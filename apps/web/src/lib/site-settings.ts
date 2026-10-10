import 'server-only';
import { cacheTags, DEFAULT_SITE_NAME, type PublicSiteSettings, publicSiteSettingsSchema } from '@piano-daily/shared';
import { publicFetch } from './api';

/** Giá trị dùng khi API cài đặt lỗi: trang vẫn render với tên/giao diện cũ. */
export const FALLBACK_SITE_SETTINGS: PublicSiteSettings = {
  siteName: DEFAULT_SITE_NAME,
  logoUrl: null,
  seoDescription: '',
  youtubeUrl: '',
};

/** Cài đặt site công khai (tag `settings`, được API revalidate sau khi founder lưu). Không bao giờ ném lỗi. */
export async function fetchSiteSettings(): Promise<PublicSiteSettings> {
  try {
    const res = await publicFetch('/settings/site', { tags: [cacheTags.settings], headers: { Accept: 'application/json' } });
    if (!res.ok) return FALLBACK_SITE_SETTINGS;
    return publicSiteSettingsSchema.parse(await res.json());
  } catch {
    return FALLBACK_SITE_SETTINGS;
  }
}
