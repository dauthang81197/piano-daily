import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SETTING_KEYS = {
  PAYMENTS_ENABLED: 'payments_enabled',
  TOKEN_DEFAULT_DAYS: 'token_default_days',
  TOKEN_DEFAULT_MAX_DOWNLOADS: 'token_default_max_downloads',
} as const;

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
}
