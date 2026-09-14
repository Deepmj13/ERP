import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request tenant context (RSL backstop integration, ADR-0002).
 *
 * `AsyncLocalStorage` carries the tenant id from the authenticated request
 * (armed by TenantContextInterceptor) through the whole async stack so the
 * Prisma query extension can run every DB operation with the
 * `app.current_tenant_id` config set — Row-Level Security then enforces the
 * tenant boundary at the DB layer.
 *
 * `inTx` marks an interactive transaction that already armed the GUC
 * (`withTenant`); the query extension skips wrapping inside it to avoid
 * nest-transaction errors.
 */
export interface RlsContextState {
  tenantId?: string;
  inTx?: boolean;
}

export const rlsStore = new AsyncLocalStorage<RlsContextState>();

export const RlsContext = {
  /** Runs `fn` with a tenant context (used by the interceptor and withTenant). */
  run<T>(tenantId: string | undefined, fn: () => T): T {
    return rlsStore.run({ tenantId, inTx: false }, fn);
  },

  /** Runs `fn` with an explicit context state (used by withTenant). */
  runWith<T>(state: RlsContextState, fn: () => T): T {
    return rlsStore.run(state, fn);
  },

  get(): RlsContextState | undefined {
    return rlsStore.getStore();
  },
};
