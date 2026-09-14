import { RlsContextState } from '../common/rls/rls-context';

/**
 * Pure, testable RLS operation wrapper (ADR-0002).
 *
 * `createRlsWrapper` returns the query wrapper used by the PrismaService
 * `$extends` extension. For an operation issued with a tenant context it runs
 * `[set_config, op]` inside a single array-form transaction and resolves to
 * the op's result; without a tenant context (or inside an already-armed
 * interactive transaction, where `inTx` is set) it passes the operation
 * straight through unwrapped.
 */
export interface RlsOperation {
  args: unknown;
  query(args: unknown): unknown;
}

export interface RlsWrapperDeps {
  getContext(): RlsContextState | undefined;
  /** Executes `SELECT set_config('app.current_tenant_id', $id, true)`. */
  setConfig(tenantId: string): unknown;
  /** Runs `[setConfig, opResult]` in one transaction; resolves to `[status, result]`. */
  runTransaction(ops: [unknown, unknown]): Promise<unknown[]>;
}

export const createRlsWrapper =
  (deps: RlsWrapperDeps) =>
  (op: RlsOperation): unknown => {
    const state = deps.getContext();
    const tenantId = state?.tenantId;
    if (!tenantId || state?.inTx) {
      return op.query(op.args);
    }
    return deps
      .runTransaction([deps.setConfig(tenantId), op.query(op.args)])
      .then((results) => results[1]);
  };
