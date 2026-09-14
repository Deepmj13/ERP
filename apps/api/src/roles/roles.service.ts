import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateRoleInput {
  name: string;
  permissionCodes: string[];
}

export interface UpdateRoleInput {
  name?: string;
  permissionCodes?: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.role.findMany({
      where: { tenantId: user.tenantId },
      include: { permissions: { include: { permission: { select: { code: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, input: CreateRoleInput, ip?: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Role name is required');
    if (input.permissionCodes.length === 0) {
      throw new BadRequestException('At least one permission is required');
    }

    const role = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.role.findUnique({
        where: { tenantId_name: { tenantId: user.tenantId, name } },
      });
      if (existing) throw new ConflictException('A role with this name already exists');

      const permissions = await tx.permission.findMany({
        where: { code: { in: input.permissionCodes } },
        select: { id: true },
      });
      if (permissions.length !== input.permissionCodes.length) {
        throw new NotFoundException('One or more permission codes were not found');
      }

      const created = await tx.role.create({
        data: { tenantId: user.tenantId, name, isSystem: false },
      });
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: created.id,
          permissionId: p.id,
          tenantId: user.tenantId,
        })),
      });
      return created;
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      newValues: { name, permissionCodes: input.permissionCodes },
      ipAddress: ip,
    });
    return { id: role.id, name: role.name };
  }

  async update(user: AuthUser, id: string, input: UpdateRoleInput, ip?: string) {
    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role || role.tenantId !== user.tenantId) {
        throw new NotFoundException('Role not found in this workspace');
      }

      const data: { name?: string } = {};
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!role.isSystem && !name) throw new BadRequestException('Role name is required');
        const clash = await tx.role.findUnique({
          where: { tenantId_name: { tenantId: user.tenantId, name } },
        });
        if (clash && clash.id !== id) {
          throw new ConflictException('A role with this name already exists');
        }
        data.name = name;
      }

      const updated = await tx.role.update({ where: { id }, data });
      if (input.permissionCodes !== undefined) {
        const permissions = await tx.permission.findMany({
          where: { code: { in: input.permissionCodes } },
          select: { id: true },
        });
        if (permissions.length !== input.permissionCodes.length) {
          throw new NotFoundException('One or more permission codes were not found');
        }
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({
              roleId: id,
              permissionId: p.id,
              tenantId: user.tenantId,
            })),
          });
        }
      }
      return updated;
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'role.update',
      entityType: 'role',
      entityId: id,
      newValues: input,
      ipAddress: ip,
    });
    return { id: updated.id, name: updated.name, isSystem: updated.isSystem };
  }

  async remove(user: AuthUser, id: string, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role || role.tenantId !== user.tenantId) {
        throw new NotFoundException('Role not found in this workspace');
      }
      if (role.isSystem) {
        throw new BadRequestException('System roles cannot be deleted');
      }
      const assigned = await tx.userRole.count({ where: { roleId: id } });
      if (assigned > 0) {
        throw new ConflictException('Role is assigned to users and cannot be deleted');
      }
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });

      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.userId,
        action: 'role.delete',
        entityType: 'role',
        entityId: id,
        ipAddress: ip,
      });
      return { ok: true };
    });
  }
}
