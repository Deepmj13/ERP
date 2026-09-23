import { Injectable } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { SaasAssertionsService } from '../saas-assertions.service';

export interface ChangeSubscriptionInput {
  planCode: string;
}

/**
 * Direct subscription management (mock billing path). A billed path goes
 * through POST /billing/checkout-session instead — the provider webhook
 * applies the change in the worker.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saas: SaasAssertionsService,
  ) {}

  async current(user: AuthUser) {
    return this.saas.currentSubscription(user);
  }

  async change(user: AuthUser, input: ChangeSubscriptionInput) {
    const current = await this.saas.currentSubscription(user);
    const target = await this.saas.getPlan(input.planCode);
    this.saas.assertChangeAllowed(input.planCode, current, { code: target.code, price: Number(target.price) });

    const endsAt = new Date();
    if (target.interval === 'MONTHLY') endsAt.setMonth(endsAt.getMonth() + 1);
    else endsAt.setFullYear(endsAt.getFullYear() + 1);

    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.subscription.update({
        where: { id: current.subscriptionId },
        data: { planCode: input.planCode, interval: target.interval, endsAt },
      }),
    );
    await this.recordEvent(user, 'subscription_changed', {
      from: current.planCode,
      to: input.planCode,
    });

    return this.saas.currentSubscription(user);
  }

  async cancel(user: AuthUser) {
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.subscription.updateMany({
        where: { tenantId: user.tenantId, status: { in: ['ACTIVE', 'TRIAL'] } },
        data: { status: 'CANCELLED', endsAt: new Date() },
      }),
    );
    await this.recordEvent(user, 'subscription_cancelled', {});
    return { ok: true as const };
  }

  private async recordEvent(user: AuthUser, eventType: string, payload: Record<string, unknown>) {
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.billingEvent.create({
        data: {
          tenantId: user.tenantId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
    );
  }
}