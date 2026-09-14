import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, QueueEvents } from 'bullmq';
import { QUEUES, RETAINED_JOBS } from './jobs.constants';

/**
 * Moves terminally-failed jobs (attempts exhausted) out of the live queues onto
 * `*-dlq` queues so they never block new work and are inspectable on demand.
 * A dead-letter job keeps its original name + payload and is not auto-retried.
 */
@Injectable()
export class DeadLetterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly events = new Map<string, QueueEvents>();
  private readonly deadLetters = new Map<string, Queue>();

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.PDF) private readonly pdf: Queue,
    @InjectQueue(QUEUES.EMAIL) private readonly email: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    for (const queue of [this.pdf, this.email] as const) {
      const events = new QueueEvents(queue.name, { connection: { url } });
      const deadLetter = new Queue(`${queue.name}-dlq`, {
        connection: { url },
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: RETAINED_JOBS },
        },
      });
      this.events.set(queue.name, events);
      this.deadLetters.set(queue.name, deadLetter);

      events.on('error', (err) =>
        this.logger.error(`queue-events error (${queue.name})`, err),
      );
      events.on('failed', async ({ jobId }) => {
        const job = await queue.getJob(jobId);
        if (!job) return;
        await deadLetter.add(job.name ?? 'dead', job.data, { jobId });
        this.logger.warn(
          `dead-lettered ${queue.name}#${jobId} (${job.attemptsMade} attempt(s))`,
        );
      });
      deadLetter.on('error', (err) =>
        this.logger.error(`dlq error (${deadLetter.name})`, err),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Bound each close: an unreachable Redis leaves the underlying ioredis
    // client in reconnect state where close() never settles — a bounded race
    // keeps shutdown from hanging the process.
    const bounded = (p: Promise<unknown>): Promise<unknown> =>
      Promise.race([p.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 2_000))]);
    await Promise.allSettled([
      ...[...this.events.values()].map((e) => bounded(e.close())),
      ...[...this.deadLetters.values()].map((q) => bounded(q.close())),
    ]);
  }
}