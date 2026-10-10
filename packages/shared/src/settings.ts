import { z } from 'zod';

/** Giới hạn cài đặt site (Story 4.4); API và admin dùng chung. */
export const SITE_NAME_MAX = 80;
export const SEO_DESCRIPTION_MAX = 320;
export const YOUTUBE_URL_MAX = 300;
/** Trần an toàn cho cấu hình token (10 năm / 1000 lượt). */
export const MAX_TOKEN_DAYS = 3650;
export const MAX_TOKEN_DOWNLOADS = 1000;
export const DEFAULT_TOKEN_DAYS = 7;
export const DEFAULT_TOKEN_MAX_DOWNLOADS = 5;
export const DEFAULT_SITE_NAME = 'Piano Daily';

/** Logo: PNG/JPEG/WebP ≤ 2 MB, chuẩn hoá về WebP cạnh dài ≤ 512 px. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_DIMENSION = 512;
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const SITE_NAME_ERROR = `Tên site phải từ 1 đến ${SITE_NAME_MAX} ký tự.`;
export const SEO_DESCRIPTION_ERROR = `Mô tả SEO tối đa ${SEO_DESCRIPTION_MAX} ký tự.`;
export const SITE_YOUTUBE_URL_ERROR = 'Link YouTube phải để trống hoặc là URL https của youtube.com / youtu.be.';
export const TOKEN_DAYS_ERROR = `Số ngày hiệu lực phải là số nguyên từ 1 đến ${MAX_TOKEN_DAYS}.`;
export const TOKEN_DOWNLOADS_ERROR = `Số lượt tải phải là số nguyên từ 1 đến ${MAX_TOKEN_DOWNLOADS}.`;

/** `true` nếu là URL https của youtube.com (kể cả www./m.) hoặc youtu.be, không có thông tin đăng nhập. */
export function isSiteYoutubeUrl(value: string): boolean {
  if (value.length > YOUTUBE_URL_MAX) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

const trimmed = (message: string) => z.string({ error: message }).trim();

export const siteNameSchema = trimmed(SITE_NAME_ERROR).min(1, { error: SITE_NAME_ERROR }).max(SITE_NAME_MAX, { error: SITE_NAME_ERROR });
export const seoDescriptionSchema = trimmed(SEO_DESCRIPTION_ERROR).max(SEO_DESCRIPTION_MAX, { error: SEO_DESCRIPTION_ERROR });
export const siteYoutubeUrlSchema = trimmed(SITE_YOUTUBE_URL_ERROR).refine((v) => v === '' || isSiteYoutubeUrl(v), { error: SITE_YOUTUBE_URL_ERROR });
export const tokenDaysSchema = z
  .number({ error: TOKEN_DAYS_ERROR })
  .int({ error: TOKEN_DAYS_ERROR })
  .min(1, { error: TOKEN_DAYS_ERROR })
  .max(MAX_TOKEN_DAYS, { error: TOKEN_DAYS_ERROR });
export const tokenMaxDownloadsSchema = z
  .number({ error: TOKEN_DOWNLOADS_ERROR })
  .int({ error: TOKEN_DOWNLOADS_ERROR })
  .min(1, { error: TOKEN_DOWNLOADS_ERROR })
  .max(MAX_TOKEN_DOWNLOADS, { error: TOKEN_DOWNLOADS_ERROR });

/** Body `PUT /admin/settings`: đủ mọi trường (logo đi qua route upload riêng). */
export const updateSettingsBodySchema = z.object({
  siteName: siteNameSchema,
  seoDescription: seoDescriptionSchema,
  youtubeUrl: siteYoutubeUrlSchema,
  paymentsEnabled: z.boolean({ error: 'Công tắc thanh toán phải là true hoặc false.' }),
  tokenDefaultDays: tokenDaysSchema,
  tokenDefaultMaxDownloads: tokenMaxDownloadsSchema,
});
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;

/** Response `GET/PUT admin/settings` và `POST admin/settings/logo`. */
export const adminSettingsSchema = updateSettingsBodySchema.extend({
  /** URL public của logo; `null` nếu chưa có. */
  logoUrl: z.string().nullable(),
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;

/** Response `GET /settings/site` (công khai): đúng 4 trường, không lộ cài đặt thanh toán/token. */
export const publicSiteSettingsSchema = z.object({
  siteName: z.string(),
  logoUrl: z.string().nullable(),
  seoDescription: z.string(),
  youtubeUrl: z.string(),
});
export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;
