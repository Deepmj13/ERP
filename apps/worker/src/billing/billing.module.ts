import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingProcessor } from './billing.processor';
import { MockBillingProvider } from './mock-billing.provider';

@Module({
  imports: [BullModule.registerQueue({ name: 'billing' })],
  providers: [BillingProcessor, MockBillingProvider],
})
export class BillingModule {}