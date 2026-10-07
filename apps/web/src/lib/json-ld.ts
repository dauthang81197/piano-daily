import type { PublicSheetDetail } from '@piano-daily/shared';
import type { Locale } from './locale';
import { absoluteUrl } from './site';

/** Bỏ `null`/`undefined`/chuỗi rỗng/mảng và object rỗng (đệ quy): JSON-LD không được chứa giá trị rỗng. */
export function prune<T>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return (items.length ? items : undefined) as T | undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined);
    return (entries.length ? Object.fromEntries(entries) : undefined) as T | undefined;
  }
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

/**
 * Serialize JSON-LD để nhúng trong `<script type="application/ld+json">`: thay `<`, `>`, `&` và U+2028/2029 bằng escape
 * Unicode nên dữ liệu do admin soạn (tên bài, mô tả) không thể thoát khỏi thẻ script; kết quả vẫn là JSON hợp lệ.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** `MusicComposition` của trang chi tiết Sheet; chỉ dùng dữ liệu có thật trong API (không đánh giá, giá, lượt xem). */
/**
 * Không có `inLanguage`: thuộc tính đó mô tả ngôn ngữ của tác phẩm, còn `locale` chỉ là ngôn ngữ giao diện của trang
 * (cùng một bài sẽ mang hai giá trị ở URL vi và en).
 */
export function musicCompositionJsonLd(sheet: PublicSheetDetail, locale: Locale, description?: string) {
  return prune({
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: sheet.title,
    url: absoluteUrl(`/${locale}/sheet/${encodeURIComponent(sheet.slug)}`),
    composer: {
      '@type': 'Person',
      name: sheet.composer.name,
      url: absoluteUrl(`/${locale}/composer/${encodeURIComponent(sheet.composer.slug)}`),
    },
    genre: sheet.genres.map((g) => g.name),
    image: sheet.pages[0]?.url,
    description: description ?? sheet.description,
    dateModified: sheet.updatedAt,
    isAccessibleForFree: true,
  });
}

/** `BreadcrumbList` khớp breadcrumb hiển thị: Trang chủ › Level › tên bài. */
export function breadcrumbJsonLd(input: {
  sheet: Pick<PublicSheetDetail, 'title' | 'slug' | 'level'>;
  locale: Locale;
  homeLabel: string;
  levelLabel: string;
}) {
  const { sheet, locale, homeLabel, levelLabel } = input;
  const item = (position: number, name: string, path: string) => ({
    '@type': 'ListItem',
    position,
    name,
    item: absoluteUrl(path),
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      item(1, homeLabel, `/${locale}`),
      item(2, levelLabel, `/${locale}/level/${sheet.level.toLowerCase()}`),
      item(3, sheet.title, `/${locale}/sheet/${encodeURIComponent(sheet.slug)}`),
    ],
  };
}
