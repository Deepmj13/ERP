import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { LogMailerProvider } from './log-mailer.provider';
import { MailProvider } from './mail-provider.interface';

/** Mirrors the API producer payload (apps/api/src/jobs/notifications.job.service.ts). */
export interface EmailJobPayload {
  tenantId: string;
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
}

@Processor('email')
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly provider: MailProvider;

  constructor(provider: LogMailerProvider) {
    super();
    this.provider = provider;
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    if (!job.data.to || !job.data.template) {
      throw new Error(`email job ${job.id} missing to/template`);
    }
    this.logger.log(
      `sending ${job.data.template} -> ${job.data.to} (attempt ${job.attemptsMade + 1})`,
    );
    await this.provider.send({
      to: job.data.to,
      subject: job.data.subject,
      template: job.data.template,
      data: job.data.data,
      tenantId: job.data.tenantId,
    });
  }
}