import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env';
import { StorageService } from '../../src/modules/media/storage.service';

const values: Record<string, unknown> = {
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: true,
  S3_ACCESS_KEY_ID: 'piano',
  S3_SECRET_ACCESS_KEY: 'piano-secret',
  S3_BUCKET_PUBLIC: 'pub',
  S3_BUCKET_PRIVATE: 'priv',
  S3_PUBLIC_BASE_URL: 'http://localhost:8333/pub',
  S3_AUTO_CREATE_BUCKETS: false,
};

describe('StorageService.presignPrivateUrl', () => {
  const storage = new StorageService({ get: (k: string) => values[k] } as unknown as ConfigService<Env, true>);

  it('ép tải xuống với tên file khi có downloadName; TTL theo tham số', async () => {
    const url = new URL(await storage.presignPrivateUrl('private/sheets/s/pdf/h.pdf', 300, 'fur-elise.pdf'));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="fur-elise.pdf"');
    expect(url.pathname).toContain('/priv/private/sheets/s/pdf/h.pdf');
  });

  it('không có downloadName thì không đặt Content-Disposition (hành vi cũ)', async () => {
    const url = new URL(await storage.presignPrivateUrl('private/a.mp3'));
    expect(url.searchParams.get('response-content-disposition')).toBeNull();
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('từ chối tên file có ký tự nguy hiểm và key public', () => {
    expect(() => storage.presignPrivateUrl('private/a.pdf', 300, 'a"b.pdf')).toThrow();
    expect(() => storage.presignPrivateUrl('private/a.pdf', 300, 'a\r\nb.pdf')).toThrow();
    expect(() => storage.presignPrivateUrl('public/a.webp', 300, 'a.webp')).toThrow();
  });
});
