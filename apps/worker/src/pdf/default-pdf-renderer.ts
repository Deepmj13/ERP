import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PdfRenderer } from './pdf-renderer.interface';

/** Renderer input resolved from the `pdf` queue job payload. */
export interface PlaceholderPdfContext {
  documentType: string;
  documentId: string;
  tenantId: string;
  template?: string;
  generatedById?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Fallback renderer for document types without a dedicated strategy (M1+).
 * Produces a deterministic placeholder card; the document registry + storage
 * pipeline it plugs into is the real M0 deliverable. Type-specific renderers
 * load their entity through the RLS-armed `tx` exactly like here.
 */
@Injectable()
export class DefaultPdfRenderer implements PdfRenderer {
  constructor(private readonly context: PlaceholderPdfContext) {}

  render(): Promise<Buffer> {
    return renderPlaceholderCard(this.context);
  }
}

export function renderPlaceholderCard(ctx: PlaceholderPdfContext): Promise<Buffer> {
  const metaLines = Object.entries(ctx.meta ?? {})
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${String(v)}`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: ctx.documentType } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(22).text(ctx.documentType, { align: 'center' });
    doc.moveDown();
    doc.font('Helvetica').fontSize(12);
    doc.text(`Document ID: ${ctx.documentId}`);
    doc.text(`Document Type: ${ctx.documentType}`);
    doc.text(`Template: ${ctx.template ?? 'default'}`);
    doc.moveDown();
    doc.fontSize(10).text(`Generated ${new Date().toISOString()}${ctx.generatedById ? ` by user ${ctx.generatedById}` : ''}`);
    if (metaLines.length > 0) {
      doc.moveDown().font('Helvetica-Bold').fontSize(11).text('Metadata').moveDown(0.5);
      doc.font('Helvetica').fontSize(10);
      for (const line of metaLines) doc.text(line);
    }
    doc.moveDown();
    doc.fontSize(9).text('Placeholder (M0) — entity-aware renderers land in M1.', { align: 'center' });

    doc.end();
  });
}