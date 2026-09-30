import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES } from '@/lib/locale';

export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  // Việc chọn locale cho path trần do `proxy.ts` (cookie -> cf-ipcountry -> en); next-intl không tự dò.
  localeDetection: false,
  // hreflang do localeAlternates() (seo.ts) phát qua metadata; tắt header Link của next-intl (x-default sẽ trỏ path trần).
  alternateLinks: false,
  localeCookie: { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax', path: '/' },
});
