import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/** TTL mặc định của presigned URL cho preview MP3 (5 phút, tinh thần AD-6: "chỉ phát signed URL ngắn hạn"). */
const DEFAULT_PRESIGN_TTL_SECONDS = 300;

/** Tên file tải xuống an toàn để đặt vào header: ASCII chữ, số, `.`, `_`, `-`. */
const SAFE_DOWNLOAD_NAME = /^[A-Za-z0-9._-]{1,200}$/;

/** Vùng lưu trữ: prefix đầu tiên của key quyết định bucket. */
export type StorageZone = 'public' | 'private';

/** Object public: cache vĩnh viễn (key chứa hash nội dung nên không bao giờ đổi nội dung). */
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Vùng của key (`public/…` hoặc `private/…`); key sai dạng thì ném lỗi (lỗi lập trình). */
export function zoneOf(key: string): StorageZone {
  if (key.startsWith('public/')) return 'public';
  if (key.startsWith('private/')) return 'private';
  throw new Error(`Storage key phải bắt đầu bằng public/ hoặc private/: ${key}`);
}

/**
 * Nơi DUY NHẤT của API nói chuyện với S3 (AD-6). Hai bucket: public (thumbnail, ảnh trang — đọc ẩn danh)
 * và private (file gốc — không bao giờ có URL public). Checksum `WHEN_REQUIRED` để tương thích R2.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly buckets: Record<StorageZone, string>;
  private readonly publicBaseUrl: string;
  private readonly autoCreateBuckets: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.buckets = {
      public: config.get('S3_BUCKET_PUBLIC', { infer: true }),
      private: config.get('S3_BUCKET_PRIVATE', { infer: true }),
    };
    this.publicBaseUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true });
    this.autoCreateBuckets = config.get('S3_AUTO_CREATE_BUCKETS', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    if (this.autoCreateBuckets) await this.ensureBuckets();
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  /** Tạo bucket còn thiếu (chỉ dev/test, bật bằng `S3_AUTO_CREATE_BUCKETS`). */
  async ensureBuckets(): Promise<void> {
    for (const bucket of Object.values(this.buckets)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err) {
        if (!(err instanceof S3ServiceException) || err.$metadata.httpStatusCode !== 404) throw err;
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Created bucket ${bucket}`);
        } catch (createErr) {
          // Tiến trình khác vừa tạo xong.
          if (createErr instanceof S3ServiceException && /BucketAlready(OwnedByYou|Exists)/.test(createErr.name)) continue;
          throw createErr;
        }
      }
    }
  }

  /** Ghi object vào bucket public (kèm cache immutable). `key` phải bắt đầu bằng `public/`. */
  putPublic(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.put('public', key, body, contentType);
  }

  /** Ghi object vào bucket private. `key` phải bắt đầu bằng `private/`. */
  putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.put('private', key, body, contentType);
  }

  /**
   * Xoá các object (bucket suy từ prefix của key). Xoá hết những gì xoá được; object không tồn tại coi như đã xoá.
   * Có object xoá thất bại thì ném `AggregateError` sau khi đã thử toàn bộ.
   */
  async deleteObjects(keys: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(
      [...new Set(keys)].map((key) =>
        this.client.send(new DeleteObjectCommand({ Bucket: this.buckets[zoneOf(key)], Key: key })),
      ),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
    if (failures.length) throw new AggregateError(failures, `Không xoá được ${failures.length}/${keys.length} object`);
  }

  /** URL public mà trình duyệt dùng để đọc object của bucket public. Key private thì ném lỗi (không bao giờ lộ). */
  publicUrl(key: string): string {
    if (zoneOf(key) !== 'public') throw new Error('Không có URL public cho object private');
    return `${this.publicBaseUrl}/${key}`;
  }

  /**
   * Presigned GET URL ngắn hạn cho object private (admin preview MP3, tải file, AD-6). Chỉ nhận key `private/`;
   * tính HMAC cục bộ (không round-trip S3). Sinh lại mỗi lần gọi, không lưu DB. Có `downloadName` thì URL ép trình
   * duyệt tải xuống (`Content-Disposition: attachment`) với tên file đó; tên phải là ASCII không có `"` hay `\`.
   */
  presignPrivateUrl(key: string, ttlSeconds = DEFAULT_PRESIGN_TTL_SECONDS, downloadName?: string): Promise<string> {
    if (zoneOf(key) !== 'private') throw new Error('presignPrivateUrl chỉ nhận key private/');
    if (downloadName !== undefined && !SAFE_DOWNLOAD_NAME.test(downloadName)) throw new Error('downloadName không hợp lệ');
    const command = new GetObjectCommand({
      Bucket: this.buckets.private,
      Key: key,
      ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` } : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  private async put(zone: StorageZone, key: string, body: Buffer, contentType: string): Promise<void> {
    if (zoneOf(key) !== zone) throw new Error(`Key ${key} không thuộc vùng ${zone}`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[zone],
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        ...(zone === 'public' ? { CacheControl: PUBLIC_CACHE_CONTROL } : {}),
      }),
    );
  }
}
