import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface EmailPayload {
  tenantId: string;
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<EmailPayload>): Promise<void> {
    this.logger.log(`Sending email job ${job.id} — template=${job.data.template}`);
    // Provider integration arrives here (plan §22).
  }
}
