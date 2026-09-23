import { PrismaClient } from '../../database';

/**
 * Strategy for rendering a document entity into a PDF buffer. Type-specific
 * renderers (plan §12 DocType-specific renderers) implement this; a fallback
 * renderer handles anything not yet customised.
 */
export interface PdfRenderer {
  /**
   * The processor hands the renderer a RLS-armed transaction (`tx`) so the
   * renderer can safely load the document entity without creating a new GUC.
   * Returns a PDF buffer ready to be stored.
   */
  render(tx: PrismaClient, tenantId: string, documentId: string): Promise<Buffer>;
}