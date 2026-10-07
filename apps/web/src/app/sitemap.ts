import type { MetadataRoute } from 'next';
import { fetchSitemapEntries } from '@/lib/catalog';
import { buildSitemap } from '@/lib/sitemap';

// Không prerender lúc build (build không có API); dữ liệu vẫn qua data cache có tag `sitemap` (revalidate theo tag).
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // API lỗi thì ném (500 để crawler thử lại) thay vì xuất sitemap rỗng làm Google bỏ hết trang; trong thời hạn cache
  // của fetch (tag `sitemap`, 600 giây) dữ liệu cũ vẫn được dùng nên API chập chờn ngắn không ảnh hưởng.
  return buildSitemap(await fetchSitemapEntries());
}
