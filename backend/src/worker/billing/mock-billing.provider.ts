import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BillingProvider,
  CheckoutInput,
  CheckoutSessionResult,
  WebhookEvent,
} from './billing-provider.interface';

/**
 * Local/provider-agnostic billing driver (precedent: LogMailerProvider). No
 * external calls, deterministic URLs — a real provider (Stripe-like) swaps in
 * here behind the same interface; verification then happens in this worker,
 * never in the API.
 */
@Injectable()
export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockBillingProvider.name);

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSessionResult> {
    this.logger.log(
      `mock checkout: tenant=${input.tenantId} plan=${input.planCode} interval=${input.interval}`,
    );
    return {
      sessionId: randomUUID(),
      url: `/mock-billing/checkout/${input.tenantId}/${input.planCode}`,
    };
  }

  async handleWebhook(input: WebhookEvent): Promise<void> {
    // The mock accepts any payload and logs; the shapes recorded here feed the
    // webhook flow tests (saas-flow e2e) that exercise the store-and-verify
    // path end to end.
    this.logger.log(
      `mock webhook: provider=${input.provider} signature=${input.signature ?? 'none'} ` +
        `event=${(input.raw as { type?: string; planCode?: string })?.type ?? 'unknown'}`,
    );
  }
}