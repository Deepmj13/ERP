import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, QueueEvents } from 'bullmq';
import {
  QUEUES,
  DEFAULT_JOB_RETRIES,
  DEFAULT_BACKOFF_DELAY_MS,
  RETAINED_JOBS,
} from '../../jobs/jobs.constants';

/** Payload carried by the `billing` queue — worker delegates to the BillingProvider. */
export interface CheckoutSessionPayload {
  tenantId: string;
  planCode: string;
  interval: string;
  requestedBy: string;
}

export interface WebhookPayload {
  provider: string;
  signature?: string;
  raw: unknown;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Phase 9 billing job producer. Provider work stays behind the BullMQ boundary
 * (plan §22 rule: no provider SDKs in the API). The checkout call is awaited
 * via QueueEvents so the endpoint can hand the client a redirect URL.
 */
@Injectable()
export class BillingJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingJobService.name);
  private readonly events: QueueEvents;

  constructor(
    @InjectQueue(QUEUES.BILLING) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {
    this.events = new QueueEvents(QUEUES.BILLING, {
      connection: {
        url: this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.events.waitUntilReady().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.events.close().catch(() => undefined);
  }

  async checkout(payload: CheckoutSessionPayload): Promise<CheckoutSessionResult> {
    const job: Job<CheckoutSessionPayload> = await this.queue.add('checkout-session', payload, {
      attempts: DEFAULT_JOB_RETRIES,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
      removeOnComplete: { count: RETAINED_JOBS },
      removeOnFail: { count: RETAINED_JOBS },
    });
    this.logger.debug(`queued checkout job ${job.id} for plan ${payload.planCode}`);
    return job.waitUntilFinished(this.events, 30_000);
  }

  async webhook(payload: WebhookPayload): Promise<void> {
    await this.queue.add('webhook-event', payload, {
      attempts: DEFAULT_JOB_RETRIES,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
      removeOnComplete: { count: RETAINED_JOBS },
      removeOnFail: { count: RETAINED_JOBS },
    });
    this.logger.debug('queued billing webhook job');
  }
}