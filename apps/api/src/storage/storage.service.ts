import { Inject, Injectable, Logger } from '@nestjs/common';

import { StoredObject, StorageProvider } from './storage.types';
import { STORAGE_PROVIDER } from './storage.constants';

/**
 * Covers the concrete driver selected from STORAGE_DRIVER. Feature modules
 * depend on this single service (plan §13), never on a driver directly.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  get driver(): string {
    return this.provider.name;
  }

  put(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    return this.provider.put(key, body, contentType);
  }

  async read(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
    const object = await this.provider.get(key);
    if (!object) this.logger.debug(`read miss: ${key}`);
    return object;
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  signedUrl(key: string, expiresInSec = 900): Promise<string> {
    if (!this.provider.signedUrl) {
      throw new Error(`Storage driver ${this.provider.name} does not support signed URLs`);
    }
    return this.provider.signedUrl(key, expiresInSec);
  }
}
