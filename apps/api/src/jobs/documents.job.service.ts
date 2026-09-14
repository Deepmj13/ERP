import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import {
  QUEUES,
  DEFAULT_JOB_RETRIES,
  DEFAULT_BACKOFF_DELAY_MS,
  RETAINED_JOBS,
} from './jobs.constants';

/** Payload carried by the `pdf` queue — worker renders + stores to S3. */
export interface GenerateDocumentPdfPayload {
  tenantId: string;
  documentType: string;
  documentId: string;
  template?: string;
  generatedById?: string | null;
  meta?: Record<string, unknown>;
}

/** PDF generation job producer (G-6 / plan §23). */
@Injectable()
export class DocumentsJobService {
  private readonly logger = new Logger(DocumentsJobService.name);

  constructor(@InjectQueue(QUEUES.PDF) private readonly queue: Queue) {}

  async queuePdf(payload: GenerateDocumentPdfPayload): Promise<Job<GenerateDocumentPdfPayload>> {
    const job = await this.queue.add('generate-pdf', payload, {
      attempts: DEFAULT_JOB_RETRIES,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
      removeOnComplete: { count: RETAINED_JOBS },
      removeOnFail: { count: RETAINED_JOBS },
    });
    this.logger.debug(`queued pdf job ${job.id} for ${payload.documentType}:${payload.documentId}`);
    return job;
  }
}