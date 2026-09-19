import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

/** A resolved plan + the active subscription for a tenant. */
export interface SubscriptionView {
  subscriptionId: string;
  planCode: string;
  status: string;
  interval: string;
  currency: string;
  startedAt: Date;
  endsAt: Date | null;
  trialEndsAt: Date | null;
  plan: {
    code: string;
    name: string;
    price: number;
    features: Record<string, unknown>;
    limits: Record<string, number>;
  };
}

/**
 * Phase 9 shared helpers: resolve the active subscription + plan for a tenant
 * and enforce plan limits (plan §27 Phase 9 / future.md §9.4). Limit
 * enforcement returns a machine-readable `LIMIT_EXCEEDED` for the caller —
 * services surface it as a 403.
 */
@Injectable()
export class SaasAssertionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current subscription + plan for the tenant (assumes at least one exists). */
  async currentSubscription(user: AuthUser): Promise<SubscriptionView> {
    const row = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { tenantId: user.tenantId, status: { in: ['ACTIVE', 'TRIAL'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) return null;
      const plan = await tx.subscriptionPlan.findUnique({ where: { code: sub.planCode } });
      return { sub, plan: plan ?? null };
    });

    if (!row?.sub) throw new NotFoundException('No active subscription for this workspace');
    return {
      subscriptionId: row.sub.id,
      planCode: row.sub.planCode,
      status: row.sub.status,
      interval: row.sub.interval,
      currency: row.sub.currency,
      startedAt: row.sub.startedAt,
      endsAt: row.sub.endsAt,
      trialEndsAt: row.sub.trialEndsAt,
      plan: {
        code: row.plan?.code ?? row.sub.planCode,
        name: row.plan?.name ?? row.sub.planCode,
        price: row.plan ? Number(row.plan.price) : 0,
        features: (row.plan?.features as Record<string, unknown>) ?? {},
        limits: (row.plan?.limits as Record<string, number>) ?? {},
      },
    };
  }

  /**
   * Plan limit resolver: tenant-level overrides (tenant_settings keys
   * `limit:<metric>`) take precedence over the plan's limits JSON. An
   * `unlimited` marker (-1) disables the check.
   */
  async resolveLimit(user: AuthUser, metric: string): Promise<number | null> {
    const overrides = await this.prisma.tenantSetting.findMany({
      where: { tenantId: user.tenantId, key: { startsWith: `limit:${metric}` } },
    });
    const value = overrides.find((o) => o.value !== null);
    if (value?.value) return Number(value.value);

    const sub = await this.currentSubscription(user);
    const limit = sub.plan.limits[metric];
    if (limit === undefined) return null;
    return limit === -1 ? null : limit;
  }

  /** Throws LIMIT_EXCEEDED when `current` runs at or beyond `metric`'s limit. */
  async assertWithinLimit(user: AuthUser, metric: string, current: number): Promise<void> {
    const limit = await this.resolveLimit(user, metric);
    if (limit === null) return;
    if (current >= limit) {
      throw new ForbiddenException({
        code: 'LIMIT_EXCEEDED',
        message: `Plan limit reached for '${metric}' (${limit}). Upgrade or contact support.`,
        details: { metric, limit, current },
      });
    }
  }

  async getPlan(code: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code } });
    if (!plan || !plan.isActive) throw new NotFoundException(`Unknown or inactive plan '${code}'`);
    return plan;
  }

  /** Throws a machine-readable INVALID_TRANSITION on invalid plan switches. */
  assertChangeAllowed(planCode: string, previous: SubscriptionView, target: { code: string; price: number }): void {
    if (planCode === previous.planCode) {
      throw new BadRequestException({
        code: 'PLAN_ALREADY_ACTIVE',
        message: `Workspace is already on '${planCode}'`,
      });
    }
    if (previous.status === 'TRIAL' && target.price === 0) {
      throw new BadRequestException({
        code: 'PLAN_NOT_ALLOWED',
        message: 'Downgrade from trial to a free plan is not allowed while the trial is active',
      });
    }
  }
}