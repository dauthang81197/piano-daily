import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SETTING_KEYS = {
  PAYMENTS_ENABLED: 'payments_enabled',
  TOKEN_DEFAULT_DAYS: 'token_default_days',
  TOKEN_DEFAULT_MAX_DOWNLOADS: 'token_default_max_downloads',
} as const;

/** Trần an toàn cho cấu hình token (10 năm / 1000 lượt). */
const MAX_TOKEN_DAYS = 3650;
const MAX_TOKEN_DOWNLOADS = 1000;

/** Nơi DUY NHẤT đọc/ghi bảng `site_settings` (AD-1). Khoá được seed bởi migration `orders_site_settings`. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async get(key: string): Promise<string | null> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key }, select: { value: true } });
    return row?.value ?? null;
  }

  /** Thanh toán đang bật không. Thiếu khoá (không nên xảy ra sau migration) coi như tắt: an toàn hơn cho luồng tiền. */
  async paymentsEnabled(): Promise<boolean> {
    return (await this.get(SETTING_KEYS.PAYMENTS_ENABLED))?.trim().toLowerCase() === 'true';
  }

  /** Số ngày hiệu lực mặc định của token (mặc định 7 nếu thiếu/không hợp lệ). */
  async tokenDefaultDays(): Promise<number> {
    return this.positiveInt(SETTING_KEYS.TOKEN_DEFAULT_DAYS, 7, MAX_TOKEN_DAYS);
  }

  /** Số lượt tải mặc định của token (mặc định 5 nếu thiếu/không hợp lệ). */
  async tokenDefaultMaxDownloads(): Promise<number> {
    return this.positiveInt(SETTING_KEYS.TOKEN_DEFAULT_MAX_DOWNLOADS, 5, MAX_TOKEN_DOWNLOADS);
  }

  private async positiveInt(key: string, fallback: number, max: number): Promise<number> {
    const raw = (await this.get(key))?.trim() ?? '';
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(value) || value <= 0) return fallback;
    return Math.min(value, max); // chặn giá trị khổng lồ làm tràn INT4 / Date không hợp lệ khi cấp token
  }
}
