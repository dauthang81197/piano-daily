import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/locale';
import { siteUrl } from '@/lib/site';

/**
 * `robots.txt`: cho phép toàn site, chặn API và route xem trước Draft của mọi locale, trỏ tới sitemap. Route tải của
 * Epic 3 tự đặt `noindex`, nên không liệt kê ở đây.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', ...LOCALES.map((l) => `/${l}/preview/`)] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
