import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface PdfPayload {
  tenantId: string;
  entityType: string;
  entityId: string;
  template?: string;
}

@Processor('pdf')
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  async process(job: Job<PdfPayload>): Promise<void> {
    this.logger.log(`Generating PDF for ${job.data.entityType}:${job.data.entityId}`);
    // Phase 3: actual PDF generation + S3 storage (plan §23 doc lifecycle).
  }
}
