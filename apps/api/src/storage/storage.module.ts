import { Logger, Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LocalDiskProvider } from './local-disk.provider';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER } from './storage.constants';
import { Configuration } from '../config/configuration';

const logger = new Logger('StorageModule');

function resolveDriver(config: ConfigService): 'local' | 's3' {
  return Configuration.register(config).storage.driver;
}

@Global()
@Module({
  providers: [
    LocalDiskProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalDiskProvider],
      useFactory: (config: ConfigService, local: LocalDiskProvider) => {
        const driver = resolveDriver(config);
        if (driver !== 'local') {
          // Compile-level support is in place (interface + factory); the S3
          // driver lands with the document/attachment phase, not Phase 1.
          logger.warn(
            `STORAGE_DRIVER=${driver} requested but only "local" is implemented — falling back to local disk`,
          );
        }
        return local;
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
