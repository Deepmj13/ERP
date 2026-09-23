import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { StorageProvider, StoredObject } from './storage.types';

/**
 * S3-compatible object storage driver (G-3). Works with AWS S3 as well as
 * S3-compatible providers (MinIO, LocalStack, Wasabi…) via the `endpoint` +
 * `forcePathStyle` options. Immutable document files are never overwritten —
 * keys carry a version suffix, and `delete` is only a logical off for those.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.get<string>('STORAGE_BUCKET', 'erp-dev');
    const endpoint = configService.get<string>('STORAGE_ENDPOINT') || undefined;
    const region = configService.get<string>('STORAGE_REGION', 'us-east-1');
    const accessKeyId = configService.get<string>('STORAGE_ACCESS_KEY');
    const secretAccessKey = configService.get<string>('STORAGE_SECRET_KEY');

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 storage driver requires STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY environment variables',
      );
    }

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`stored ${key} (${body.byteLength} bytes)`);
    return { key, size: body.byteLength, contentType };
  }

  async get(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      const body = Buffer.from(await result.Body.transformToByteArray());
      return { body, contentType: result.ContentType ?? undefined };
    } catch (err) {
      // AWS SDK wraps missing keys as NoSuchKey / NotFound.
      const code = (err as { name?: string; Code?: string })?.name ?? (err as { Code?: string })?.Code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }
}