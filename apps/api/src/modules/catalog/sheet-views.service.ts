import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { SheetViewsRepository } from './sheet-views.repository';
import { hourBucket, visitorHash } from './visitor-hash';

/** Ghi nhận lượt xem từ beacon (AD-11): băm người xem, dedupe theo giờ, tăng đếm nếu là lượt mới. */
@Injectable()
export class SheetViewsService {
  private readonly salt: string;

  constructor(
    private readonly views: SheetViewsRepository,
    config: ConfigService<Env, true>,
  ) {
    this.salt = config.get('VIEW_SALT', { infer: true });
  }

  /** `true` nếu lượt này được tính (chỉ dùng cho test/log; không bao giờ lộ ra client). */
  record(sheetId: string, ip: string, userAgent: string | undefined, now = new Date()): Promise<boolean> {
    return this.views.record(sheetId, visitorHash(ip, userAgent, this.salt), hourBucket(now));
  }
}
