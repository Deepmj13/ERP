import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { StorageModule } from '@erp/storage';
import { PrismaModule } from './prisma/prisma.module';
import { PdfModule } from './pdf/pdf.module';
import { EmailModule } from './email/email.module';
import { LowStockModule } from './low-stock/low-stock.module';
import { BillingModule } from './billing/billing.module';
import { UsageMeterModule } from './usage-meter/usage-meter.module';

/**
 * Background worker (plan §23). Shares environment with the API but runs
 * as a separate NestJS process: drains BullMQ queues off the main request
 * path (PDF generation, email, notifications, report generation).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    PrismaModule,
    StorageModule,
    PdfModule,
    EmailModule,
    LowStockModule,
    BillingModule,
    UsageMeterModule,
  ],
})
export class AppModule {}