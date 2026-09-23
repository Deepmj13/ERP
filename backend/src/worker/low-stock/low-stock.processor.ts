import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { tryEnqueue } from '../../jobs/queue.utils';
import { PrismaService } from '../prisma/prisma.service';

const LOW_STOCK_THRESHOLD = 10;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

interface LowStockRecipient {
  user: { id: string; email: string };
}

@Processor('notifications')
@Injectable()
export class LowStockProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LowStockProcessor.name);

  constructor(
    @InjectQueue('notifications') private readonly queue: Queue,
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await tryEnqueue(
        this.queue,
        'check-low-stock',
        {},
        {
          jobId: 'low-stock-check',
          repeat: { every: CHECK_INTERVAL_MS },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
      this.logger.log('scheduled periodic low-stock check (every 6h)');
    } catch (err) {
      this.logger.warn(
        `could not schedule low-stock check — Redis unreachable (${String(err)}). The worker will keep running but no scheduled job will fire.`,
      );
    }
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'check-low-stock') return;
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      try {
        await this.scanTenant(tenant.id);
      } catch (err) {
        this.logger.error(`low-stock scan failed for tenant ${tenant.id}: ${String(err)}`);
      }
    }
  }

  private async scanTenant(tenantId: string): Promise<void> {
    const summary = await this.prisma.withTenant(tenantId, async (tx) => {
      const lowItems = await tx.stockBalance.findMany({
        where: { tenantId, quantity: { lte: LOW_STOCK_THRESHOLD } },
        include: { product: { select: { id: true, name: true, sku: true } } },
        take: 50,
      });
      if (lowItems.length === 0) return { recipients: [], lowItems: [] };

      const uniqueItems = [...new Map(lowItems.map((i) => [i.productId, i])).values()];
      const recipients: LowStockRecipient[] = await tx.userRole.findMany({
        where: {
          tenantId,
          role: { permissions: { some: { permission: { code: 'inventory.stock.view' } } } },
        },
        distinct: ['userId'],
        select: { user: { select: { id: true, email: true } } },
      });

      const body = `${uniqueItems.length} item(s) at or below reorder level: ${uniqueItems
        .map((i) => `${i.product.name} (${i.product.sku})`)
        .join(', ')}.`;

for (const recipient of recipients) {
        await tx.notification.create({
          data: {
            tenantId,
            userId: recipient.user.id,
            type: 'low.stock',
            title: 'Low stock alert',
            body,
            data: {
              lowItems: uniqueItems.map((i) => ({
                productId: i.productId,
                name: i.product.name,
                sku: i.product.sku,
                quantity: i.quantity.toNumber(),
              })),
            },
          },
        });
      }

      return {
        recipients,
        lowItems: uniqueItems.map((i) => ({ name: i.product.name, sku: i.product.sku })),
      };
    });

    if (summary.lowItems.length > 0) {
      for (const recipient of summary.recipients) {
        if (!recipient.user.email) continue;
        await this.emailQueue.add('email', {
          tenantId,
          to: recipient.user.email,
          subject: 'Low stock alert',
          template: 'low-stock',
          data: { lowItems: summary.lowItems },
        });
      }
      this.logger.log(
        `low-stock: notified ${summary.recipients.length} user(s) in tenant ${tenantId}`,
      );
    }
  }
}