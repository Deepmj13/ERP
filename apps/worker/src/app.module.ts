import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './email/email.processor';
import { PdfProcessor } from './pdf/pdf.processor';

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
    EmailProcessor,
    PdfProcessor,
  ],
})
export class AppModule {}
