import type { ApiResponse, PaginatedResponse } from '@erp/api-contracts';

export { ApiResponse, PaginatedResponse };
export * from '@erp/api-contracts';

/** Domain value shared by every module and both apps. Add cross-module types here. */

/**
 * Standard lifecycles for business documents (plan §2 Rule 5).
 * Modules constrain this further, e.g. invoice lifecycle.
 */
export const DOCUMENT_LIFECYCLE = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'POSTED',
  'CANCELLED',
] as const;
export type DocumentLifecycle = (typeof DOCUMENT_LIFECYCLE)[number];

/** Base shape for a tenant-owned primary entity (plan §11). */
export interface TenantOwned {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

/** Base shape for a financial/inventory-sensitive entity that tracks users. */
export interface Audited extends TenantOwned {
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** Explicit state-transition result verb (plan §16). */
export interface BusinessActionResult {
  ok: true;
  transition: string;
  document: string;
}
