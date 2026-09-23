import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { SaasAssertionsService } from '../saas-assertions.service';
import { BillingJobService, CheckoutSessionResult } from './billing.job.service';

export interface CheckoutInput {
  planCode: string;
  interval?: string;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saas: SaasAssertionsService,
    private readonly jobs: BillingJobService,
  ) {}

  /** Starts a checkout for a plan change — provider call happens worker-side. */
  async checkout(user: AuthUser, input: CheckoutInput): Promise<CheckoutSessionResult> {
    const current = await this.saas.currentSubscription(user);
    const target = await this.saas.getPlan(input.planCode);
    this.saas.assertChangeAllowed(input.planCode, current, { code: target.code, price: Number(target.price) });

    return this.jobs.checkout({
      tenantId: user.tenantId,
      planCode: input.planCode,
      interval: input.interval ?? target.interval,
      requestedBy: user.userId,
    });
  }

  /** Provider webhook entry: enqueue for signature-verified handling in the worker. */
  async webhook(input: { provider: string; signature?: string; raw: unknown }): Promise<{ ok: true }> {
    await this.jobs.webhook(input);
    return { ok: true };
  }

  /** Latest checkout session created for this tenant (demo reads the mock URL). */
  async latestCheckoutSession(user: AuthUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.billingEvent.findMany({
        where: { tenantId: user.tenantId, eventType: 'checkout_session_created' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    );
    return rows.map((r) => r.payload);
  }
}