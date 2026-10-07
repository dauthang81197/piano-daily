import type { Metadata } from 'next';
import { DEFAULT_LOCALE, type Locale, LOCALES } from './locale';
import { absoluteUrl } from './site';

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

export const SITE_NAME = 'Piano Daily';
/** Độ dài tối đa của meta description (ký tự, tính theo code point). */
export const DESCRIPTION_MAX = 160;

/** Mã locale cho `og:locale`. */
const OG_LOCALE: Record<Locale, string> = { vi: 'vi_VN', en: 'en_US' };

/** Gọn khoảng trắng và cắt theo code point (không chẻ surrogate); quá dài thì kết thúc bằng `…` trong giới hạn. */
export function truncateDescription(text: string, max: number = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

export interface PageMetadataInput {
  locale: Locale;
  /** Không kèm locale, vd. `/level/beginner`; trang chủ là `/`. */
  path: string;
  title: string;
  description: string;
  /** URL tuyệt đối của ảnh chia sẻ; không có thì không bịa ảnh. */
  image?: string | null | undefined;
  type?: 'website' | 'article';
  /** `true`: không thêm hậu tố `| Piano Daily` của layout (trang chủ). */
  absoluteTitle?: boolean;
  robots?: Metadata['robots'];
}

/**
 * Metadata chuẩn của mọi trang công khai (Story 2.11): title, description (đã cắt), canonical + `hreflang`,
 * Open Graph và Twitter card. Mỗi trang gọi trong `generateMetadata` (layout không biết pathname).
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  type = 'website',
  absoluteTitle = false,
  robots,
}: PageMetadataInput): Metadata {
  const desc = truncateDescription(description);
  const other = LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]);
  const suffix = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: desc,
    alternates: localeAlternates(path, locale),
    openGraph: {
      type,
      title,
      description: desc,
      url: absoluteUrl(`/${locale}${suffix}`),
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      alternateLocale: other,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description: desc,
      ...(image ? { images: [image] } : {}),
    },
    ...(robots ? { robots } : {}),
  };
}
