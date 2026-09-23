import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsageMeterProcessor } from './usage-meter.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'usage-meter' })],
  providers: [UsageMeterProcessor],
})
export class UsageMeterModule {}