import { Inject, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

import { Prisma, seedChartOfAccounts } from '@erp/database';

import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import { AccessTokenPayload, AuthContext } from './auth.types';
import { JWT_SETTINGS } from './auth.constants';
import { JwtSettings } from '../config/configuration';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

export interface RegisterResult extends AuthContext {
  membershipCount: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(JWT_SETTINGS) private readonly settings: JwtSettings,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Registration (plan §1, §6). Creates the first tenant + company with a
   * system "Owner" role carrying every permission, the registering user, and
   * a session — all in one transaction so a failure rolls back as a unit.
   */
  async register(dto: RegisterDto, device?: string): Promise<RegisterResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const slug = await this.uniqueSlug(dto.tenantName);

    return this.prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: dto.tenantName, slug, status: 'TRIAL' },
        });

        const user = await tx.user.create({
          data: { email: dto.email, passwordHash, fullName: dto.name },
        });

        await tx.tenantUser.create({
          data: { tenantId: tenant.id, userId: user.id, status: 'ACTIVE' },
        });

        const company = await tx.company.create({
          data: { tenantId: tenant.id, name: dto.tenantName },
        });

        const ownerRole = await tx.role.create({
          data: { tenantId: tenant.id, name: 'Owner', isSystem: true },
        });

        const permissions = await tx.permission.findMany({ select: { id: true } });
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: ownerRole.id,
            permissionId: p.id,
            tenantId: tenant.id,
          })),
        });

        // Phase 5: provision the standard chart of accounts so posted documents
        // (invoices, payments, journal entries) always resolve target accounts.
        await seedChartOfAccounts(tx, tenant.id);

        await tx.userRole.create({
          data: { userId: user.id, roleId: ownerRole.id, tenantId: tenant.id },
        });

        const issued = this.sessions.issueTokens(user.id, tenant.id, user.email);
        await tx.session.create({
          data: {
            id: issued.session.id,
            familyId: issued.session.familyId,
            refreshTokenHash: issued.session.refreshTokenHash,
            userId: user.id,
            tenantId: tenant.id,
            device: device ? { userAgent: device } : undefined,
            expiresAt: issued.session.expiresAt,
          },
        });

        return {
          accessToken: issued.accessToken,
          refreshToken: issued.refreshToken,
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          company: { id: company.id, name: company.name },
          user: { id: user.id, email: user.email, name: user.fullName },
          expiresAt: issued.session.expiresAt.toISOString(),
          membershipCount: 1,
        };
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
  }

  /** Bcrypt-compare credentials and issue a new session + tokens. */
  async login(dto: LoginDto, device?: string): Promise<RegisterResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { tenant: true },
      orderBy: { tenantId: 'asc' },
    });
    if (memberships.length === 0) {
      throw new UnauthorizedException('Account has no active workspaces');
    }

    const tenant = memberships[0].tenant;
    const issued = this.sessions.issueTokens(user.id, tenant.id, user.email);

    // `companies` and `sessions` are RLS-enforced (ADR-0002): the GUC must be
    // armed before touching them, so run both in a tenant transaction.
    const company = await this.prisma.withTenant(tenant.id, async (tx) => {
      const company = await tx.company.findFirst({ where: { tenantId: tenant.id } });
      await tx.session.create({
        data: {
          id: issued.session.id,
          familyId: issued.session.familyId,
          refreshTokenHash: issued.session.refreshTokenHash,
          userId: user.id,
          tenantId: tenant.id,
          device: device ? { userAgent: device } : undefined,
          expiresAt: issued.session.expiresAt,
        },
      });
      return company;
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      company: company ? { id: company.id, name: company.name } : undefined,
      user: { id: user.id, email: user.email, name: user.fullName },
      expiresAt: issued.session.expiresAt.toISOString(),
      membershipCount: memberships.length,
    };
  }

  /**
   * Refresh with rotation + reuse detection (plan §24): the session stores the
   * hash of the *current* refresh token. A refresh with a valid signature but
   * a mismatched hash means a rotated token was replayed -> revoke the whole
   * session family and force re-login.
   */
  async refresh(dto: RefreshTokenDto, device?: string): Promise<AuthContext> {
    const payload = this.verifyRefresh(dto.refreshToken);

    const session = await this.prisma.withTenant(payload.tid, (tx) =>
      tx.session.findUnique({ where: { id: payload.sid } }),
    );
    if (!session || session.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session inactive');
    }
    if (session.userId !== payload.sub || session.tenantId !== payload.tid) {
      throw new UnauthorizedException('Session mismatch');
    }

    if (session.refreshTokenHash !== this.sessions.hashRefreshToken(dto.refreshToken)) {
      // Reuse detection is a committed write, not part of a rollback-sensitive
      // transaction: revoke the family even though the request then 401s.
      await this.prisma.withTenant(payload.tid, (tx) =>
        tx.session.updateMany({
          where: { familyId: session.familyId },
          data: { status: 'REVOKED', revokedAt: new Date() },
        }),
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const [user, tenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub } }),
      this.prisma.tenant.findUnique({ where: { id: payload.tid } }),
    ]);
    if (!user || !tenant) throw new UnauthorizedException('Session references missing records');

    const issued = this.sessions.issueTokens(user.id, tenant.id, user.email);
    await this.prisma.withTenant(payload.tid, (tx) =>
      tx.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: this.sessions.hashRefreshToken(issued.refreshToken),
          lastUsedAt: new Date(),
          device: device
            ? { userAgent: device }
            : (session.device as Prisma.InputJsonValue | undefined),
        },
      }),
    );

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: { id: user.id, email: user.email, name: user.fullName },
      expiresAt: issued.session.expiresAt.toISOString(),
    };
  }

  async logout(dto: LogoutDto): Promise<{ ok: true }> {
    const payload = this.verifyRefresh(dto.refreshToken);
    await this.prisma.withTenant(payload.tid, (tx) =>
      tx.session.updateMany({
        where: { id: payload.sid, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    );
    return { ok: true };
  }

  /** Issues a fresh access token for a signed-in user (tenant switch helper). */
  accessTokenFor(userId: string, tenantId: string, email: string): string {
    const payload: AccessTokenPayload = { sub: userId, tid: tenantId, email };
    return this.jwtService.sign(payload, {
      secret: this.settings.accessSecret,
      expiresIn: this.settings.accessExpiresIn,
    });
  }

  private verifyRefresh(token: string): { sub: string; sid: string; tid: string } {
    try {
      return this.jwtService.verify<{ sub: string; sid: string; tid: string }>(token, {
        secret: this.settings.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
    for (let i = 0; i < 5; i++) {
      const candidate = i === 0 ? base || 'tenant' : `${base}-${i}`;
      const collision = await this.prisma.tenant.findUnique({ where: { slug: candidate } });
      if (!collision) return candidate;
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
  }
}
