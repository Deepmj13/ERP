import { Inject, Injectable, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthContext, AuthUser } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { JWT_SETTINGS } from '../auth/auth.constants';
import { JwtSettings } from '../config/configuration';

export interface MembershipView {
  tenant: { id: string; name: string; slug: string; status: string };
  roleNames: string[];
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(JWT_SETTINGS) private readonly settings: JwtSettings,
    private readonly sessions: SessionService,
  ) {}

  async listForUser(user: AuthUser): Promise<MembershipView[]> {
    const rows = await this.prisma.tenantUser.findMany({
      where: { userId: user.userId, status: 'ACTIVE' },
      include: { tenant: true },
    });
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const userRoles = tenantIds.length
      ? await this.prisma.userRole.findMany({
          where: { userId: user.userId, tenantId: { in: tenantIds } },
          include: { role: { select: { name: true } } },
        })
      : [];
    const roleNamesByTenant = new Map<string, string[]>();
    for (const ur of userRoles) {
      const list = roleNamesByTenant.get(ur.tenantId) ?? [];
      list.push(ur.role.name);
      roleNamesByTenant.set(ur.tenantId, list);
    }
    return rows.map((r) => ({
      tenant: {
        id: r.tenant.id,
        name: r.tenant.name,
        slug: r.tenant.slug,
        status: r.tenant.status,
      },
      roleNames: roleNamesByTenant.get(r.tenantId) ?? [],
    }));
  }

  /** Explicit tenant switch — issues a session in the target tenant (plan §1). */
  async activate(user: AuthUser, tenantId: string, device?: string): Promise<AuthContext> {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.userId } },
      include: { tenant: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Not a member of this workspace');
    }

    const account = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!account) throw new ForbiddenException('No such user');

    const issued = this.sessions.issueTokens(user.userId, tenantId, account.email);
    await this.prisma.session.create({
      data: {
        id: issued.session.id,
        familyId: issued.session.familyId,
        refreshTokenHash: issued.session.refreshTokenHash,
        userId: user.userId,
        tenantId,
        device: device ? { userAgent: device } : undefined,
        expiresAt: issued.session.expiresAt,
      },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      user: { id: account.id, email: account.email, name: account.fullName },
      expiresAt: issued.session.expiresAt.toISOString(),
    };
  }
}
