export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';
/** Cookie lựa chọn ngôn ngữ sống 1 năm (giây). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/** Path đã có tiền tố `/vi` hoặc `/en` (đúng cả segment: `/vietnam` không tính). */
export function hasLocalePrefix(pathname: string): boolean {
  return LOCALES.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
}

/**
 * Chọn locale cho path chưa có tiền tố (AD-12): cookie hợp lệ -> `cf-ipcountry == VN` thì `vi` -> `en`.
 * Hàm thuần; không bao giờ dùng cho URL đã có tiền tố.
 */
export function resolveLocale(input: { cookie?: string | null; country?: string | null }): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  if (input.country?.trim().toUpperCase() === 'VN') return 'vi';
  return DEFAULT_LOCALE;
}
