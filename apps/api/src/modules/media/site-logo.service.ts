import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { LOGO_MAX_BYTES, LOGO_MAX_DIMENSION } from '@piano-daily/shared';
import sharp from 'sharp';
import { StorageService } from './storage.service';

const WEBP_MIME_TYPE = 'image/webp';
const WEBP_QUALITY = 85;
/** Chặn ảnh "bom giải nén": tối đa ~50 megapixel. */
const MAX_INPUT_PIXELS = 50_000_000;

export type LogoRejection = 'TOO_LARGE' | 'UNSUPPORTED' | 'UNREADABLE';

/** Logo không nhận được; `reason` để controller ánh xạ mã lỗi. */
export class LogoRejectedError extends Error {
  constructor(readonly reason: LogoRejection) {
    super(`Logo bị từ chối: ${reason}`);
    this.name = 'LogoRejectedError';
  }
}

/** Nhận diện PNG/JPEG/WebP bằng magic bytes (không tin Content-Type của client). */
export function isSupportedLogoImage(buf: Buffer): boolean {
  const png = buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return png || jpeg || webp;
}

/** Xử lý và lưu logo site vào vùng public (module `media`; `settings` chỉ lưu key). */
@Injectable()
export class SiteLogoService {
  private readonly logger = new Logger(SiteLogoService.name);

  constructor(private readonly storage: StorageService) {}

  /** Chuẩn hoá về WebP cạnh dài ≤ 512 px rồi ghi `public/site/logo-<sha256>.webp`; trả key. */
  async store(input: Buffer): Promise<string> {
    if (input.length > LOGO_MAX_BYTES) throw new LogoRejectedError('TOO_LARGE');
    if (!isSupportedLogoImage(input)) throw new LogoRejectedError('UNSUPPORTED');
    let webp: Buffer;
    try {
      webp = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: LOGO_MAX_DIMENSION, height: LOGO_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      this.logger.warn({ reason: err instanceof Error ? err.name : 'unknown' }, 'sharp không xử lý được logo');
      throw new LogoRejectedError('UNREADABLE');
    }
    const key = `public/site/logo-${createHash('sha256').update(webp).digest('hex')}.webp`;
    await this.storage.putPublic(key, webp, WEBP_MIME_TYPE);
    return key;
  }
}
