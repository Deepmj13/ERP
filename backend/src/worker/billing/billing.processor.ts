import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import {
  BillingProvider,
  CheckoutSessionResult,
  WebhookEvent,
} from './billing-provider.interface';
import { MockBillingProvider } from './mock-billing.provider';

/** Mirrors the API producer payload (apps/api/src/saas/billing/billing.job.service.ts). */
export interface CheckoutJobPayload {
  tenantId: string;
  planCode: string;
  interval: string;
  requestedBy: string;
}

/**
 * Phase 9 billing consumer. Provider work (checkout sessions, signature-
 * verified webhook handling) stays behind the job boundary per plan §22 —
 * the API only ever enqueues jobs.
 */
@Processor('billing')
@Injectable()
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);
  private readonly provider: BillingProvider;

  constructor(provider: MockBillingProvider, private readonly prisma: PrismaService) {
    super();
    this.provider = provider;
  }

  async process(job: Job): Promise<CheckoutSessionResult | void> {
    if (job.name === 'checkout-session') {
      return this.checkout(job.data as CheckoutJobPayload);
    }
    if (job.name === 'webhook-event') {
      await this.webhook(job.data as WebhookEvent);
    }
  }

  private async checkout(payload: CheckoutJobPayload): Promise<CheckoutSessionResult> {
    const result = await this.provider.createCheckoutSession({
      tenantId: payload.tenantId,
      planCode: payload.planCode,
      interval: payload.interval,
      requestedBy: payload.requestedBy,
    });
    await this.prisma.withTenant(payload.tenantId, (tx) =>
      tx.billingEvent.create({
        data: {
          tenantId: payload.tenantId,
          eventType: 'checkout_session_created',
          payload: {
            planCode: payload.planCode,
            interval: payload.interval,
            sessionId: result.sessionId,
            url: result.url,
          },
        },
      }),
    );
    this.logger.log(`checkout session ${result.sessionId} created for tenant ${payload.tenantId}`);
    return result;
  }

  private async webhook(input: WebhookEvent): Promise<void> {
    await this.provider.handleWebhook(input);

    // Apply trusted provider events to the subscription state. The provider
    // signature verification is guaranteed to have passed before this point in
    // a real implementation; the mock accepts envelopes as-is.
    const raw = (input.raw ?? {}) as { type?: string; tenantId?: string; planCode?: string; status?: string };
    const tenantId = raw.tenantId ?? (input.raw as { data?: { tenant_id?: string } })?.data?.tenant_id;

    if (raw.type === 'subscription_changed' && tenantId && raw.planCode) {
      await this.applyPlanChange(tenantId, raw.planCode);
    } else if (raw.type === 'charge_succeeded' && tenantId) {
      await this.markPaid(tenantId);
    }
  }

  private async applyPlanChange(tenantId: string, planCode: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { code: planCode } });
      if (!plan) throw new Error(`Unknown plan '${planCode}' in webhook`);
      await tx.subscription.updateMany({
        where: { tenantId, status: { in: ['ACTIVE', 'TRIAL'] } },
        data: { planCode, interval: plan.interval, status: 'ACTIVE' },
      });
      await tx.billingEvent.create({
        data: {
          tenantId,
          eventType: 'subscription_changed',
          payload: { to: planCode, via: 'webhook' },
        },
      });
    });
    this.logger.log(`applied plan change to ${planCode} for tenant ${tenantId}`);
  }

  private async markPaid(tenantId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.billingEvent.create({
        data: {
          tenantId,
          eventType: 'charge_succeeded',
          payload: { source: 'webhook' },
        },
      }),
    );
  }
}