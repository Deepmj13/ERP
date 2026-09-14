import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LocalDiskProvider } from './local-disk.provider';
import { S3StorageProvider } from './s3.provider';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER } from './storage.constants';

/**
 * Global storage module shared by the API and worker processes (plan §23).
 * Selects the concrete driver from `STORAGE_DRIVER` (local | s3); feature
 * code only ever sees the StorageService facade. Only the selected driver is
 * constructed — a misconfigured S3 driver fails fast at boot when the app
 * actually uses S3, without breaking `local` (test/dev) deployments.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LocalDiskProvider | S3StorageProvider => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        return driver === 's3' ? new S3StorageProvider(config) : new LocalDiskProvider(config);
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}