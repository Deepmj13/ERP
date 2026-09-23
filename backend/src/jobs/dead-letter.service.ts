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
  private readonly recoveryTimers = new Map<string, NodeJS.Timeout>();

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

      // Throttle connection errors: when Redis is unreachable, ioredis retries
      // indefinitely and emits an 'error' per attempt — logging every one floods
      // the API console. Report the outage once per component, then poll for the
      // connection coming back and log a "restored" notice. Real job failures
      // still reach the 'failed' handler below.
      let reported = false;
      const pollRecovery = (label: string, target: QueueEvents | Queue): void => {
        if (!reported) return;
        this.recoveryTimers.set(
          label,
          setTimeout(() => {
            Promise.race([
              target.waitUntilReady() as Promise<unknown>,
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('still unreachable')), 1_000),
              ),
            ])
              .then(() => {
                if (reported) {
                  reported = false;
                  this.logger.log(`redis connection restored for "${label}"`);
                }
              })
              .catch(() => {
                pollRecovery(label, target);
              });
          }, 2_000),
        );
      };
      events.on('error', (err) => {
        if (!reported) {
          reported = true;
          this.logger.warn(
            `redis unreachable — dead-letter monitoring paused for "${queue.name}" until the connection is restored (${String(err)})`,
          );
          pollRecovery(`queue-events "${queue.name}"`, events);
        }
      });
      events.on('failed', async ({ jobId }) => {
        const job = await queue.getJob(jobId);
        if (!job) return;
        await deadLetter.add(job.name ?? 'dead', job.data, { jobId });
        this.logger.warn(
          `dead-lettered ${queue.name}#${jobId} (${job.attemptsMade} attempt(s))`,
        );
      });
      let dlqReported = false;
      const pollDlq = (): void => {
        if (!dlqReported) return;
        this.recoveryTimers.set(
          `dlq "${deadLetter.name}"`,
          setTimeout(() => {
            Promise.race([
              deadLetter.waitUntilReady() as Promise<unknown>,
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('still unreachable')), 1_000),
              ),
            ])
              .then(() => {
                if (dlqReported) {
                  dlqReported = false;
                  this.logger.log(`redis connection restored for "${deadLetter.name}"`);
                }
              })
              .catch(() => {
                pollDlq();
              });
          }, 2_000),
        );
      };
      deadLetter.on('error', (err) => {
        if (!dlqReported) {
          dlqReported = true;
          this.logger.warn(
            `redis unreachable — "${deadLetter.name}" unavailable until the connection is restored (${String(err)})`,
          );
          pollDlq();
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.recoveryTimers.values()) clearTimeout(timer);
    this.recoveryTimers.clear();
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