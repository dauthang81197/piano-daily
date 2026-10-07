import type { MetadataRoute } from 'next';
import type { SitemapEntries } from '@piano-daily/shared';
import { LEVELS } from './levels';
import { DEFAULT_LOCALE, LOCALES } from './locale';
import { absoluteUrl } from './site';

/**
 * Dựng `sitemap.xml` (Story 2.11): trang chủ, 4 Level và mọi Sheet/Composer/Genre công khai, cho CẢ HAI locale; mỗi URL
 * kèm `alternates.languages` (vi, en, x-default). Không có Search, preview hay trang tải.
 */
export function buildSitemap(entries: SitemapEntries, base?: string): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: string) => {
    const suffix = path === '/' ? '' : path;
    const url = (locale: string) => absoluteUrl(`/${locale}${suffix}`, base);
    const languages: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [l, url(l)]));
    languages['x-default'] = url(DEFAULT_LOCALE);
    for (const locale of LOCALES) {
      out.push({ url: url(locale), ...(lastModified ? { lastModified } : {}), alternates: { languages } });
    }
  };
  add('/');
  for (const level of LEVELS) add(`/level/${level}`);
  for (const s of entries.sheets) add(`/sheet/${encodeURIComponent(s.slug)}`, s.updatedAt);
  for (const c of entries.composers) add(`/composer/${encodeURIComponent(c.slug)}`, c.updatedAt);
  for (const g of entries.genres) add(`/genre/${encodeURIComponent(g.slug)}`, g.updatedAt);
  return out;
}
