/**
 * API response standards — see ERP_Implementation_Plan_V2.md §17.
 *
 * Every REST endpoint returns one of these envelopes:
 *   Success        -> { data, meta? }
 *   Collection     -> { data: [], meta: { page, limit, total } }
 *   Error          -> { error: { code, message, details? } }
 */

/** Single-object success envelope. */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Paginated collection envelope. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

/** Stable machine-readable error code, e.g. INVOICE_ALREADY_POSTED. */
export type ErrorCode = string;

/** Error envelope — single consistent shape across every module. */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level validation errors or any structured retry info. */
    details?: unknown;
  };
}

/** Shape of the Idempotency-Key response a client may see (see plan §16a). */
export interface IdempotentResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  /** True when the response is a replay of a previously completed call. */
  replayed: boolean;
}

/** Error codes reserved by the platform. Modules add their own. */
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  IN_PROGRESS: 'REQUEST_IN_PROGRESS',
} as const;
