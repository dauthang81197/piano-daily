import { DEFAULT_LOCALE, type Locale, LOCALES } from './locale';

/**
 * Quy ước `hreflang` cho MỌI route công khai: mỗi trang gọi hàm này trong `generateMetadata`
 * và gán vào `alternates` (layout không biết pathname). `path` không kèm locale, vd. `/level/beginner`; trang chủ là `/`.
 * URL tương đối được Next nối với `metadataBase` (đặt ở layout).
 */
export function localeAlternates(path: string, locale: Locale = DEFAULT_LOCALE) {
  const suffix = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
  const languages: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [l, `/${l}${suffix}`]));
  languages['x-default'] = `/${DEFAULT_LOCALE}${suffix}`;
  return { canonical: `/${locale}${suffix}`, languages };
}
