import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { rpcError } from '../common/rpc-error';

/**
 * R2 (S3-compatible) storage adapter. The only place that knows the storage
 * backend — swapping providers or adding a transform layer is a new adapter,
 * nothing else. Lazy: the S3 client is built on first use, so the service boots
 * fine without R2 env configured (calls just fail with a clear message).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private get bucket(): string | undefined {
    return (
      this.config.get<string>('R2_BUCKET_NAME') ??
      this.config.get<string>('R2_BUCKET')
    );
  }

  /** R2 S3 endpoint — explicit override, else derived from the account id. */
  private get endpoint(): string | undefined {
    const explicit = this.config.get<string>('R2_ENDPOINT');
    if (explicit) return explicit;
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    return accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    const endpoint = this.endpoint;
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      throw rpcError('INTERNAL_ERROR', 'Media storage is not configured.');
    }
    this.client = new S3Client({
      region: 'auto', // R2 ignores region but the SDK requires one
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  /** Presigned PUT URL for a direct browser upload. Short-lived. */
  async presignUpload(
    key: string,
    contentType: string,
    ttlSeconds = 300,
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.getClient(), cmd, { expiresIn: ttlSeconds });
  }

  /** Public read URL for a stored object key (reconstructed from config). */
  publicUrl(key: string): string {
    const base = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
    return `${base}/${key}`;
  }

  /** Best-effort delete — failures are logged, never thrown (row is soft-deleted). */
  async delete(key: string): Promise<void> {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(`R2 delete failed for ${key}: ${String(err)}`);
    }
  }
}
