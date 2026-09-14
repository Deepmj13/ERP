import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '@erp/database';

import { RlsContext } from '../common/rls/rls-context';
import { createRlsWrapper } from './rls.transaction';

/**
 * Single PrismaClient for the API process.
 *
 * Tenant isolation (plan §7 / ADR-0002): business services filter every query
 * with the tenant_id resolved from the authenticated session, and the DB-side
 * Row-Level Security backstop enforces the same boundary again.
 *
 * The client is extended so *every* operation runs with
 * `app.current_tenant_id` set (from the per-request RlsContext) inside a short
 * transaction — this is what makes strict `ENABLE RLS + FORCE` work against
 * the PgBouncer pooler. Ops issued without a tenant context (health, public
 * auth bootstrap) pass through unwrapped; `withTenant` arms the GUC explicitly
 * inside its own interactive transaction and marks the context to prevent
 * nested-transaction wrapping.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({ datasources: { db: { url: configService.get<string>('DATABASE_URL', '') } } });

    // Naming must be a `let`: the extension body references it lazily on every
    // operation, by which time the assignment below has completed.
    let extended: PrismaClient;
    // Base (un-extended) raw executor, bound before `Object.assign` below
    // overwrites `this.$executeRaw`. Used to arm the GUC inside the wrapper so
    // the set_config statement does NOT re-enter the extension and nest
    // transactions.
    const rawExecuteRaw = this.$executeRaw.bind(this);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrap: any = createRlsWrapper({
      getContext: () => RlsContext.get(),
      setConfig: (tenantId: string) =>
        rawExecuteRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
      // Array-form $transaction serialises both calls on a single connection,
      // so the RLS GUC set by the first statement is visible to the wrapped
      // query. (Interactive $transaction is *not* used here: it holds its
      // connection and can deadlock the pool when nested with other
      // transactions.) `maxWait`/`timeout` are interactive-tx options not
      // modelled on the array-form overload; the engine honours them anyway.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runTransaction: (ops) =>
        extended.$transaction(ops as never, { maxWait: 15_000, timeout: 30_000 } as any) as Promise<
          unknown[]
        >,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extended = this.$extends({
      query: {
        $allModels: { $allOperations: wrap },
        $queryRaw: wrap,
        $executeRaw: wrap,
        $queryRawUnsafe: wrap,
        $executeRawUnsafe: wrap,
      },
    }) as unknown as PrismaClient;

    // Copy the extended client's delegates (bound to the extension) onto `this`
    // so `prisma.model.*`, `$queryRaw`, `$transaction`, ... all route through
    // the RLS wrapper while keeping the existing call sites unchanged.
    Object.assign(this as unknown as Record<string, unknown>, extended);
  }

  /**
   * No eager $connect: the client dials the DB lazily on first query, so the
   * API can boot and serve DB-agnostic routes (health, docs) even while the
   * database is unavailable in local development.
   */

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Runs `fn` inside a transaction with the tenant RLS context set. */
  withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return RlsContext.runWith({ tenantId, inTx: true }, () =>
      this.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
          return fn(tx as unknown as PrismaClient);
        },
        { maxWait: 15_000, timeout: 30_000 },
      ),
    );
  }
}
