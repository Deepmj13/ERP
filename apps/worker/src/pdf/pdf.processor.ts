import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { DocumentFileService } from './document-file.service';
import { DefaultPdfRenderer } from './default-pdf-renderer';
import { PdfRenderer } from './pdf-renderer.interface';

/** Mirrors the API producer payload (apps/api/src/jobs/documents.job.service.ts). */
export interface PdfJobPayload {
  tenantId: string;
  documentType: string;
  documentId: string;
  template?: string;
  generatedById?: string | null;
  meta?: Record<string, unknown>;
}

@Processor('pdf')
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly documentFileService: DocumentFileService) {
    super();
  }

  async process(job: Job<PdfJobPayload>): Promise<void> {
    const { tenantId, documentType, documentId } = job.data;
    this.logger.log(
      `generating ${documentType}:${documentId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
    );

    const renderer = this.resolveRenderer(job.data);
    await this.documentFileService.generate(tenantId, documentType, documentId, renderer, {
      generatedById: job.data.generatedById,
    });
  }

  /** Renderer registry — swap in document-type strategies as they land (M1). */
  private resolveRenderer(data: PdfJobPayload): PdfRenderer {
    return new DefaultPdfRenderer({
      tenantId: data.tenantId,
      documentType: data.documentType,
      documentId: data.documentId,
      template: data.template,
      generatedById: data.generatedById,
      meta: data.meta,
    });
  }
}