import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { dirname, relative, resolve, sep } from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageProvider, StoredObject } from './storage.types';

/**
 * Local-disk provider used for development and small single-node deployments.
 * Keys are namespace-prefixed (tenantId/...) and hardened against traversal —
 * a key containing `..` or absolute segments is rejected outright.
 */
@Injectable()
export class LocalDiskProvider implements StorageProvider {
  readonly name = 'local';

  private readonly logger = new Logger(LocalDiskProvider.name);
  private readonly baseDir: string;

  constructor(configService: ConfigService) {
    this.baseDir = resolve(configService.get<string>('STORAGE_LOCAL_DIR', './storage'));
  }

  private resolvePath(key: string): string {
    if (!key || key.length > 512) throw new BadRequestException('Invalid object key');
    if (
      key.startsWith('/') ||
      key.startsWith('\\') ||
      /\\/.test(key) ||
      key.split('/').includes('..')
    ) {
      throw new BadRequestException('Object key must be a relative safe path');
    }
    const abs = resolve(this.baseDir, key);
    const rel = relative(this.baseDir, abs);
    if (rel.startsWith(`..${sep}`) || rel === '..') {
      throw new BadRequestException('Object key escapes the storage root');
    }
    return abs;
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await new Promise<void>((resolvePut, reject) => {
      const stream = createWriteStream(filePath);
      stream.once('error', reject);
      stream.once('finish', () => resolvePut());
      stream.end(body);
    });
    this.logger.debug(`stored ${key} (${body.byteLength} bytes)`);
    return { key, size: body.byteLength, contentType };
  }

  async get(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
    const filePath = this.resolvePath(key);
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) return null;
    const body = await new Promise<Buffer>((resolveRead, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath);
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.once('error', reject);
      stream.once('end', () => resolveRead(Buffer.concat(chunks)));
    });
    return { body };
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }

  async signedUrl(_key: string): Promise<string> {
    throw new Error('Local storage does not support signed URLs');
  }
}
