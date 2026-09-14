import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES, DEFAULT_JOB_RETRIES, RETAINED_JOBS } from './jobs.constants';
import { DocumentsJobService } from './documents.job.service';
import { NotificationsJobService } from './notifications.job.service';
import { DeadLetterService } from './dead-letter.service';

/**
 * Sits between business code and the worker queues (G-6). The module owns the
 * BullMQ driver configuration (single Redis connection, lazy-connect), the
 * producer queues, and the dead-letter queue monitor.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
        defaultJobOptions: {
          attempts: DEFAULT_JOB_RETRIES,
          removeOnComplete: true,
          removeOnFail: { count: RETAINED_JOBS },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.PDF }, { name: QUEUES.EMAIL }),
  ],
  providers: [
    DocumentsJobService,
    NotificationsJobService,
    DeadLetterService,
  ],
  exports: [
    DocumentsJobService,
    NotificationsJobService,
    DeadLetterService,
  ],
})
export class JobsModule {}