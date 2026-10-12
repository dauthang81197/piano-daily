import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AD_IMAGE_MAX_BYTES, AD_IMAGE_MAX_DIMENSION } from '@piano-daily/shared';
import sharp from 'sharp';
import { isSupportedLogoImage } from './site-logo.service';
import { StorageService } from './storage.service';

const WEBP_MIME_TYPE = 'image/webp';
const WEBP_QUALITY = 82;
/** Chặn ảnh "bom giải nén": tối đa ~50 megapixel. */
const MAX_INPUT_PIXELS = 50_000_000;

export type AdImageRejection = 'TOO_LARGE' | 'UNSUPPORTED' | 'UNREADABLE';

/** Ảnh quảng cáo không nhận được; `reason` để controller ánh xạ mã lỗi. */
export class AdImageRejectedError extends Error {
  constructor(readonly reason: AdImageRejection) {
    super(`Ảnh quảng cáo bị từ chối: ${reason}`);
    this.name = 'AdImageRejectedError';
  }
}

/** Xử lý và lưu ảnh quảng cáo vào vùng public (module `media`; `ads` chỉ nhận URL). */
@Injectable()
export class AdImageService {
  private readonly logger = new Logger(AdImageService.name);

  constructor(private readonly storage: StorageService) {}

  /** Chuẩn hoá về WebP cạnh dài ≤ 1200 px rồi ghi `public/ads/<sha256>.webp`; trả URL công khai. */
  async store(input: Buffer): Promise<string> {
    if (input.length > AD_IMAGE_MAX_BYTES) throw new AdImageRejectedError('TOO_LARGE');
    if (!isSupportedLogoImage(input)) throw new AdImageRejectedError('UNSUPPORTED');
    let webp: Buffer;
    try {
      webp = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: AD_IMAGE_MAX_DIMENSION, height: AD_IMAGE_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      this.logger.warn({ reason: err instanceof Error ? err.name : 'unknown' }, 'sharp không xử lý được ảnh quảng cáo');
      throw new AdImageRejectedError('UNREADABLE');
    }
    const key = `public/ads/${createHash('sha256').update(webp).digest('hex')}.webp`;
    await this.storage.putPublic(key, webp, WEBP_MIME_TYPE);
    return this.storage.publicUrl(key);
  }
}
