/** Billing provider contract (plan §27 Phase 9). Real providers plug in here. */
export interface BillingProvider {
  readonly name: string;

  createCheckoutSession(input: CheckoutInput): Promise<CheckoutSessionResult>;
  handleWebhook(input: WebhookEvent): Promise<void>;
}

export interface CheckoutInput {
  tenantId: string;
  planCode: string;
  interval: string;
  requestedBy: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface WebhookEvent {
  provider: string;
  signature?: string;
  raw: unknown;
}