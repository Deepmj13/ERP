import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

export interface OverrideLimitInput {
  metric: string;
  value: number;
}

/**
 * Platform operator endpoints (plan §27 Phase 9 — customer administration).
 * Gated by the BILLING_ADMIN_TOKEN env var via header, not tenant RBAC: these
 * cross tenant boundaries and no global admin role exists (design decision
 * D-2026-09-22, recorded in future.md).
 */
@Injectable()
export class AdminService {
  private readonly adminToken: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.adminToken = config.get<string>('BILLING_ADMIN_TOKEN', '');
  }

  assertOperator(token: string | undefined): void {
    if (!this.adminToken || token !== this.adminToken) {
      throw new ForbiddenException('Invalid or missing operator token');
    }
  }

  async overrideLimit(tenantId: string, input: OverrideLimitInput) {
    if (!/^[a-z_]+$/.test(input.metric) || input.value < -1) {
      throw new ForbiddenException('Invalid metric or value (-1 = unlimited)');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new ForbiddenException('Tenant not found');

    // tenant_settings is RLS-FORCED — arm the tenant context before writing.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: `limit:${input.metric}` } },
        update: { value: String(input.value) },
        create: { tenantId, key: `limit:${input.metric}`, value: String(input.value) },
      }),
    );
    return { tenantId, metric: input.metric, value: input.value };
  }

  async tenantSummary(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return null;
    const [subscriptions, usageMetrics] = await Promise.all([
      this.prisma.withTenant(tenantId, (tx) =>
        tx.subscription.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ),
      this.prisma.withTenant(tenantId, (tx) =>
        tx.usageMetric.findMany({
          where: { tenantId },
          orderBy: { recordedAt: 'desc' },
          take: 20,
        }),
      ),
    ]);
    return { ...tenant, subscriptions, usageMetrics };
  }

  async usageSummary() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, name: true, status: true } });
    const result = [];
    for (const t of tenants) {
      const sub = await this.prisma.withTenant(t.id, (tx) =>
        tx.subscription.findFirst({
          where: { tenantId: t.id, status: { in: ['ACTIVE', 'TRIAL'] } },
          orderBy: { createdAt: 'desc' },
        }),
      );
      const users = await this.prisma.tenantUser.count({ where: { tenantId: t.id, status: 'ACTIVE' } });
      result.push({
        tenantId: t.id,
        name: t.name,
        status: t.status,
        plan: sub?.planCode ?? null,
        subscriptionStatus: sub?.status ?? null,
        activeUsers: users,
      });
    }
    return result;
  }
}