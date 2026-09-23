import { ServiceUnavailableException } from '@nestjs/common';
import { Job, Queue, type JobsOptions } from 'bullmq';

const DEFAULT_ENQUEUE_TIMEOUT_MS = 5_000;

/**
 * Adds a job to a BullMQ queue but fails fast when Redis is unreachable.
 *
 * BullMQ's ioredis client buffers commands until the connection is (re)established,
 * so a bare `queue.add` hangs forever while Redis is down. Racing the add against
 * a bounded timer keeps API callers responsive and Redis optional at boot: jobs
 * simply stay dormant until the queue reconnects.
 */
export async function tryEnqueue(
  queue: Queue,
  name: string,
  data: unknown,
  opts: JobsOptions = {},
  timeoutMs: number = DEFAULT_ENQUEUE_TIMEOUT_MS,
): Promise<Job> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const add = queue.add(name, data, opts);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ServiceUnavailableException(
              `Job queue unavailable (Redis not reachable) — could not enqueue "${name}" within ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      );
    });
    return (await Promise.race([add, timeout])) as Job;
  } finally {
    if (timer) clearTimeout(timer);
  }
}