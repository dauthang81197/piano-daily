import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/locale';
import { siteUrl } from '@/lib/site';

/**
 * `robots.txt`: cho phép toàn site, chặn API và route xem trước Draft và trang tải file đã mua (token trong URL) của mọi locale, trỏ tới sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', ...LOCALES.map((l) => `/${l}/preview/`), ...LOCALES.map((l) => `/${l}/downloads/`)] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
