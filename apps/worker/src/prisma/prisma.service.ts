import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@erp/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({ datasources: { db: { url: configService.get<string>('DATABASE_URL', '') } } });
  }

  /**
   * Runs `fn` inside a transaction with `app.current_tenant_id` set via
   * `set_config`. Called by every processor so document files inherit the same
   * RLS enforcement as the API (ADR-0002).
   */
  withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        return fn(tx as unknown as PrismaClient);
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}