/** Queue names shared by the API (producers) and worker (consumers). */
export const QUEUES = {
  PDF: 'pdf',
  EMAIL: 'email',
  BILLING: 'billing',
} as const;

export const DEFAULT_JOB_RETRIES = 3;
export const DEFAULT_BACKOFF_DELAY_MS = 5_000;
export const RETAINED_JOBS = 100;