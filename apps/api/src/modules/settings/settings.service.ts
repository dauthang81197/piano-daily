import { Injectable, Logger } from '@nestjs/common';
import {
  type AdminSettings,
  cacheTags,
  DEFAULT_SITE_NAME,
  DEFAULT_TOKEN_DAYS,
  DEFAULT_TOKEN_MAX_DOWNLOADS,
  DEFAULT_TRIAL_DAYS,
  DEFAULT_TRIAL_MAX_DOWNLOADS,
  MAX_TRIAL_DAYS,
  MAX_TRIAL_DOWNLOADS,
  MAX_TOKEN_DAYS,
  MAX_TOKEN_DOWNLOADS,
  type PublicSiteSettings,
  type UpdateSettingsBody,
} from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from '../catalog/cache-invalidator';
import { SiteLogoService } from '../media/site-logo.service';
import { StorageService } from '../media/storage.service';

export const SETTING_KEYS = {
  PAYMENTS_ENABLED: 'payments_enabled',
  TOKEN_DEFAULT_DAYS: 'token_default_days',
  TOKEN_DEFAULT_MAX_DOWNLOADS: 'token_default_max_downloads',
  SITE_NAME: 'site_name',
  LOGO_KEY: 'logo_key',
  SEO_DESCRIPTION: 'seo_description',
  YOUTUBE_URL: 'youtube_url',
  SUBSCRIPTIONS_ENABLED: 'subscriptions_enabled',
  TRIAL_DAYS: 'trial_days',
  TRIAL_MAX_DOWNLOADS: 'trial_max_downloads',
} as const;

/** Cấu hình cưỡng chế dùng thử/gói khi khách tải (S2 thuê bao). */
export type SubscriptionConfig = { enabled: boolean; trialDays: number; trialMaxDownloads: number };

export { MAX_TOKEN_DAYS, MAX_TOKEN_DOWNLOADS };

/**
 * Nơi DUY NHẤT đọc/ghi bảng `site_settings` (AD-1). Khoá thanh toán/token được seed bởi migration
 * `orders_site_settings`; khoá site (tên, logo, SEO, YouTube) có giá trị mặc định trong code.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logos: SiteLogoService,
    private readonly cache: CacheInvalidator,
  ) {}

  private async get(key: string): Promise<string | null> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key }, select: { value: true } });
    return row?.value ?? null;
  }

  /** Upsert duy nhất của module; mọi ghi `site_settings` đi qua đây. */
  private set(key: string, value: string, tx: Pick<PrismaService, 'siteSetting'> = this.prisma) {
    return tx.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  /** Thanh toán đang bật không. Thiếu khoá (không nên xảy ra sau migration) coi như tắt: an toàn hơn cho luồng tiền. */
  async paymentsEnabled(): Promise<boolean> {
    return (await this.get(SETTING_KEYS.PAYMENTS_ENABLED))?.trim().toLowerCase() === 'true';
  }

  /** Số ngày hiệu lực mặc định của token (mặc định 7 nếu thiếu/không hợp lệ). */
  async tokenDefaultDays(): Promise<number> {
    return this.positiveInt(SETTING_KEYS.TOKEN_DEFAULT_DAYS, DEFAULT_TOKEN_DAYS, MAX_TOKEN_DAYS);
  }

  /** Số lượt tải mặc định của token (mặc định 5 nếu thiếu/không hợp lệ). */
  async tokenDefaultMaxDownloads(): Promise<number> {
    return this.positiveInt(SETTING_KEYS.TOKEN_DEFAULT_MAX_DOWNLOADS, DEFAULT_TOKEN_MAX_DOWNLOADS, MAX_TOKEN_DOWNLOADS);
  }

  /** Có cưỡng chế dùng thử/gói không. Thiếu khoá coi như tắt (mặc định an toàn: không chặn khách khi chưa có thanh toán). */
  async subscriptionsEnabled(): Promise<boolean> {
    return (await this.get(SETTING_KEYS.SUBSCRIPTIONS_ENABLED))?.trim().toLowerCase() === 'true';
  }

  /** Ba giá trị cấu hình thuê bao trong một lần đọc. Số ngày/lượt dùng thử cho phép 0 (tắt dùng thử). */
  async subscriptionConfig(): Promise<SubscriptionConfig> {
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: [SETTING_KEYS.SUBSCRIPTIONS_ENABLED, SETTING_KEYS.TRIAL_DAYS, SETTING_KEYS.TRIAL_MAX_DOWNLOADS] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      enabled: map.get(SETTING_KEYS.SUBSCRIPTIONS_ENABLED)?.trim().toLowerCase() === 'true',
      trialDays: nonNegativeInt(map.get(SETTING_KEYS.TRIAL_DAYS), DEFAULT_TRIAL_DAYS, MAX_TRIAL_DAYS),
      trialMaxDownloads: nonNegativeInt(map.get(SETTING_KEYS.TRIAL_MAX_DOWNLOADS), DEFAULT_TRIAL_MAX_DOWNLOADS, MAX_TRIAL_DOWNLOADS),
    };
  }

  /** Cài đặt công khai cho web: đúng 4 trường, logo qua URL public. */
  async getSite(): Promise<PublicSiteSettings> {
    const rows = await this.prisma.siteSetting.findMany({
      where: {
        key: { in: [SETTING_KEYS.SITE_NAME, SETTING_KEYS.LOGO_KEY, SETTING_KEYS.SEO_DESCRIPTION, SETTING_KEYS.YOUTUBE_URL] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const logoKey = map.get(SETTING_KEYS.LOGO_KEY)?.trim();
    return {
      siteName: map.get(SETTING_KEYS.SITE_NAME)?.trim() || DEFAULT_SITE_NAME,
      logoUrl: logoKey ? this.storage.publicUrl(logoKey) : null,
      seoDescription: map.get(SETTING_KEYS.SEO_DESCRIPTION)?.trim() ?? '',
      youtubeUrl: map.get(SETTING_KEYS.YOUTUBE_URL)?.trim() ?? '',
    };
  }

  /** Toàn bộ cài đặt cho admin. */
  async getAdmin(): Promise<AdminSettings> {
    const [site, paymentsEnabled, tokenDefaultDays, tokenDefaultMaxDownloads, subscription] = await Promise.all([
      this.getSite(),
      this.paymentsEnabled(),
      this.tokenDefaultDays(),
      this.tokenDefaultMaxDownloads(),
      this.subscriptionConfig(),
    ]);
    return {
      ...site,
      paymentsEnabled,
      tokenDefaultDays,
      tokenDefaultMaxDownloads,
      subscriptionsEnabled: subscription.enabled,
      trialDays: subscription.trialDays,
      trialMaxDownloads: subscription.trialMaxDownloads,
    };
  }

  /** Lưu mọi trường (đã validate ở controller) trong một transaction, rồi revalidate tag `settings`. */
  async updateAll(body: UpdateSettingsBody): Promise<AdminSettings> {
    await this.prisma.$transaction(async (tx) => {
      await this.set(SETTING_KEYS.SITE_NAME, body.siteName, tx);
      await this.set(SETTING_KEYS.SEO_DESCRIPTION, body.seoDescription, tx);
      await this.set(SETTING_KEYS.YOUTUBE_URL, body.youtubeUrl, tx);
      await this.set(SETTING_KEYS.PAYMENTS_ENABLED, body.paymentsEnabled ? 'true' : 'false', tx);
      await this.set(SETTING_KEYS.TOKEN_DEFAULT_DAYS, String(body.tokenDefaultDays), tx);
      await this.set(SETTING_KEYS.TOKEN_DEFAULT_MAX_DOWNLOADS, String(body.tokenDefaultMaxDownloads), tx);
      await this.set(SETTING_KEYS.SUBSCRIPTIONS_ENABLED, body.subscriptionsEnabled ? 'true' : 'false', tx);
      await this.set(SETTING_KEYS.TRIAL_DAYS, String(body.trialDays), tx);
      await this.set(SETTING_KEYS.TRIAL_MAX_DOWNLOADS, String(body.trialMaxDownloads), tx);
    });
    void this.cache.notify([cacheTags.settings, cacheTags.plans]);
    return this.getAdmin();
  }

  /** Xử lý + lưu logo mới, ghi key, xoá logo cũ (best-effort), revalidate. Lỗi ảnh ném `LogoRejectedError`. */
  async setLogo(image: Buffer): Promise<AdminSettings> {
    const oldKey = (await this.get(SETTING_KEYS.LOGO_KEY))?.trim() || null;
    const newKey = await this.logos.store(image);
    try {
      await this.set(SETTING_KEYS.LOGO_KEY, newKey);
    } catch (err) {
      if (newKey !== oldKey) await this.deleteQuietly(newKey);
      throw err;
    }
    if (oldKey && oldKey !== newKey) await this.deleteQuietly(oldKey);
    void this.cache.notify([cacheTags.settings]);
    return this.getAdmin();
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.deleteObjects([key]);
    } catch (err) {
      this.logger.warn({ reason: err instanceof Error ? err.name : 'unknown' }, 'Không xoá được file logo');
    }
  }

  private async positiveInt(key: string, fallback: number, max: number): Promise<number> {
    const raw = (await this.get(key))?.trim() ?? '';
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(value) || value <= 0) return fallback;
    return Math.min(value, max); // chặn giá trị khổng lồ làm tràn INT4 / Date không hợp lệ khi cấp token
  }
}

/** Số nguyên ≥ 0 (cho phép 0), mặc định `fallback` nếu thiếu/không hợp lệ, chặn ở `max`. */
function nonNegativeInt(raw: string | undefined, fallback: number, max: number): number {
  const text = raw?.trim() ?? '';
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isSafeInteger(value) ? Math.min(value, max) : fallback;
}
