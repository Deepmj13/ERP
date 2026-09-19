import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LowStockProcessor } from './low-stock.processor';

/**
 * Phase 8, Gate O4: scheduled low-stock scan. A repeatable BullMQ job is
 * enqueued on boot (jobId `low-stock-check`) and this processor drains it,
 * writing in-app Notification rows per tenant and fanning out a summary
 * email through the shared `email` queue consumed by EmailProcessor.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }, { name: 'email' }),
  ],
  providers: [LowStockProcessor],
})
export class LowStockModule {}