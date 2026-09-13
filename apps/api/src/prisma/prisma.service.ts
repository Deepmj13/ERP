import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '@erp/database';

/**
 * Single PrismaClient for the API process.
 *
 * Tenant isolation (plan §7): business services filter every query with
 * the tenant_id resolved from the authenticated session. For sensitive or
 * multi-statement work they use `withTenant`, which runs inside a transaction
 * and sets the `app.current_tenant_id` config so PostgreSQL Row-Level
 * Security policies (applied via migrations in §2 ADR-0002) enforce the
 * boundary as a DB-level backstop.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({ datasources: { db: { url: configService.get<string>('DATABASE_URL', '') } } });
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
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
