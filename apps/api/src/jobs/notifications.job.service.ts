import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import {
  QUEUES,
  DEFAULT_JOB_RETRIES,
  DEFAULT_BACKOFF_DELAY_MS,
  RETAINED_JOBS,
} from './jobs.constants';

/** Payload carried by the `email` queue — worker renders the template and sends. */
export interface EmailNotificationPayload {
  tenantId: string;
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
}

/** Email notification job producer (G-6). */
@Injectable()
export class NotificationsJobService {
  private readonly logger = new Logger(NotificationsJobService.name);

  constructor(@InjectQueue(QUEUES.EMAIL) private readonly queue: Queue) {}

  async enqueueEmail(payload: EmailNotificationPayload): Promise<Job<EmailNotificationPayload>> {
    const job = await this.queue.add('send-email', payload, {
      attempts: DEFAULT_JOB_RETRIES,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
      removeOnComplete: { count: RETAINED_JOBS },
      removeOnFail: { count: RETAINED_JOBS },
    });
    this.logger.debug(`queued email job ${job.id} to ${payload.to}`);
    return job;
  }
}