import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

const METER_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

/**
 * Phase 9 usage tap (future.md §9.4 — "worker tap, batch, idempotent").
 * A repeatable job aggregates measurable usage per tenant and appends readings
 * to usage_metrics, keeping the interceptor pipeline untouched.
 */
@Processor('usage-meter')
@Injectable()
export class UsageMeterProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(UsageMeterProcessor.name);

  constructor(
    @InjectQueue('usage-meter') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'aggregate-usage',
      {},
      {
        jobId: 'usage-meter',
        repeat: { every: METER_INTERVAL_MS },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    this.logger.log('scheduled periodic usage aggregation (every 6h)');
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'aggregate-usage') return;
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      try {
        await this.aggregateTenant(tenant.id);
      } catch (err) {
        this.logger.error(`usage aggregation failed for tenant ${tenant.id}: ${String(err)}`);
      }
    }
  }

  private async aggregateTenant(tenantId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const [users, documents] = await Promise.all([
        tx.tenantUser.count({ where: { tenantId, status: 'ACTIVE' } }),
        tx.documentFile.count({ where: { tenantId } }),
      ]);
      const now = new Date();
      const readings = [
        { metric: 'users', value: users },
        { metric: 'documents', value: documents },
      ];
      for (const r of readings) {
        await tx.usageMetric.create({
          data: { tenantId, metric: r.metric, value: r.value, recordedAt: now },
        });
      }
    });
    this.logger.log(`usage recorded for tenant ${tenantId}`);
  }
}