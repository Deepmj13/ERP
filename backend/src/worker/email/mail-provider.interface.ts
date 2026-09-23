/** Sends transactional email. Real providers (SES, SendGrid…) plug in here. */
export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

export interface MailMessage {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
  tenantId: string;
}