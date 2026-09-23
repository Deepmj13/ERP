import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DocumentFile } from '../../database';
import { StorageService, buildKey } from '../../storage';

import { PdfRenderer } from './pdf-renderer.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Orchestrates the document-file lifecycle for one PDF job (plan §23 / G-2):
 *
 *   1. creates the `document_files` row (PENDING);
 *   2. renders the document through the job's renderer;
 *   3. stores the rendered PDF in object storage and records the key + checksum;
 *   4. flips the row to GENERATED.
 *
 * All steps run inside one tenant-armed transaction; object storage has no
 * rollback, so a stored object is only ever referenced by a committed row. On
 * any failure the transaction aborts (no PENDING/FAILED row survives — the
 * durable trace is the job's FAILED state in BullMQ + the dead-letter queue)
 * and a just-stored orphan object is best-effort removed. Retries start a
 * fresh PENDING row, so a previously stored object under the same key is
 * overwritten rather than duplicated.
 */
@Injectable()
export class DocumentFileService {
  private readonly logger = new Logger(DocumentFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async generate(
    tenantId: string,
    documentType: string,
    documentId: string,
    renderer: PdfRenderer,
    opts: { generatedById?: string | null } = {},
  ): Promise<DocumentFile> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.documentFile.create({
        data: { tenantId, documentType, documentId, status: 'PENDING' },
      });

      let storedKey: string | undefined;
      try {
        const pdf = await renderer.render(tx, tenantId, documentId);
        const checksum = createHash('sha256').update(pdf).digest('hex');
        const key = buildKey(tenantId, documentType, documentId, `v${row.version}.pdf`);

        storedKey = key;
        const stored = await this.storage.put(key, pdf, 'application/pdf');

        const updated = await tx.documentFile.update({
          where: { id: row.id },
          data: {
            status: 'GENERATED',
            storageKey: stored.key,
            checksum,
            mimeType: 'application/pdf',
            generatedById: opts.generatedById ?? null,
          },
        });
        this.logger.log(
          `document ${documentType}:${documentId} generated @ ${stored.key} (${checksum.slice(0, 12)})`,
        );
        return updated;
      } catch (err) {
        // The transaction aborts, so no row survives; drop any object that was
        // stored but never referenced by a committed row (best-effort — never
        // mask the original failure).
        if (storedKey) {
          await this.storage.delete(storedKey).catch(() => undefined);
        }
        this.logger.error(
          `document ${documentType}:${documentId} failed (${err instanceof Error ? err.message : String(err)})`,
        );
        throw err;
      }
    });
  }
}