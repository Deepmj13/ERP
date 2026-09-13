import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface InviteUserInput {
  email: string;
  name: string;
  roleIds?: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  status?: string;
  roleIds?: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listInTenant(user: AuthUser) {
    const memberships = await this.prisma.tenantUser.findMany({
      where: { tenantId: user.tenantId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true, createdAt: true } },
      },
    });
    const userIds = memberships.map((m) => m.userId);
    const userRoles = userIds.length
      ? await this.prisma.userRole.findMany({
          where: { tenantId: user.tenantId, userId: { in: userIds } },
          include: { role: { select: { id: true, name: true } } },
        })
      : [];
    const rolesByUser = new Map<string, { id: string; name: string }[]>();
    for (const ur of userRoles) {
      const list = rolesByUser.get(ur.userId) ?? [];
      list.push(ur.role);
      rolesByUser.set(ur.userId, list);
    }
    return memberships.map((m) => ({ ...m.user, roles: rolesByUser.get(m.userId) ?? [] }));
  }

  /**
   * Invite a user into the active tenant. Idempotent by email within the
   * tenant — medical audit trail via AuditService (plan §21).
   */
  async invite(user: AuthUser, input: InviteUserInput, ip?: string) {
    const existingOnPlatform = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    const passwordHash = await bcrypt.hash(randomPassword(), 10);
    const invited = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantUser.findFirst({
        where: {
          tenantId: user.tenantId,
          user: { email: input.email },
        },
      });
      if (existing) throw new ConflictException('User already belongs to this workspace');

      const target =
        existingOnPlatform ??
        (await tx.user.create({
          data: {
            email: input.email,
            fullName: input.name,
            passwordHash,
            status: 'ACTIVE',
          },
        }));

      if (!Array.isArray(input.roleIds) || input.roleIds.length === 0) {
        throw new ConflictException('At least one role is required');
      }
      const validRoles = await tx.role.findMany({
        where: { tenantId: user.tenantId, id: { in: input.roleIds } },
        select: { id: true },
      });
      if (validRoles.length !== input.roleIds.length) {
        throw new NotFoundException('One or more roles not found in this workspace');
      }

      await tx.tenantUser.create({
        data: { tenantId: user.tenantId, userId: target.id, status: 'ACTIVE' },
      });
      await tx.userRole.createMany({
        data: validRoles.map((r) => ({ userId: target.id, roleId: r.id, tenantId: user.tenantId })),
      });
      return target;
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'user.invite',
      entityType: 'user',
      entityId: invited.id,
      newValues: { email: input.email, roleIds: input.roleIds },
      ipAddress: ip,
    });
    return { id: invited.id, email: invited.email, name: invited.fullName };
  }

  async update(user: AuthUser, id: string, input: UpdateUserInput, ip?: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: user.tenantId, userId: id } },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('User not in this workspace');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.fullName !== undefined) {
        await tx.user.update({ where: { id }, data: { fullName: input.fullName } });
      }
      if (input.status !== undefined) {
        await tx.tenantUser.update({
          where: { tenantId_userId: { tenantId: user.tenantId, userId: id } },
          data: { status: input.status },
        });
      }
      if (input.roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id, tenantId: user.tenantId } });
        if (input.roleIds.length > 0) {
          await tx.userRole.createMany({
            data: input.roleIds.map((roleId) => ({ userId: id, roleId, tenantId: user.tenantId })),
          });
        }
      }
      return membership.user;
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      newValues: input,
      ipAddress: ip,
    });
    return { id: updated.id, email: updated.email, fullName: updated.fullName };
  }
}

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}
