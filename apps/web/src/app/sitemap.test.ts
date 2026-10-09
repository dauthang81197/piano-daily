import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSitemapEntries = vi.fn();
vi.mock('@/lib/catalog', () => ({ fetchSitemapEntries: (...a: unknown[]) => fetchSitemapEntries(...a) }));

import robots from './robots';
import sitemap, { dynamic } from './sitemap';

describe('app/sitemap', () => {
  beforeEach(() => {
    fetchSitemapEntries.mockReset();
  });

  it('dựng từ dữ liệu API cho cả hai locale', async () => {
    fetchSitemapEntries.mockResolvedValue({
      sheets: [{ slug: 'fur-elise', updatedAt: '2026-10-01T00:00:00.000Z' }],
      composers: [],
      genres: [],
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/vi/sheet/fur-elise'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/en/sheet/fur-elise'))).toBe(true);
  });

  it('API lỗi thì ném (giữ cache cũ), không trả sitemap rỗng', async () => {
    fetchSitemapEntries.mockImplementation(async () => {
      throw new Error('API /sitemap-entries trả 500');
    });
    await expect(sitemap()).rejects.toThrow('500');
  });

  it('không prerender lúc build (build không có API)', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('app/robots', () => {
  const r = robots();
  const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { userAgent: string; allow: string; disallow: string[] };

  it('cho phép toàn site, chặn API và route preview của mọi locale', () => {
    expect(rule.userAgent).toBe('*');
    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/vi/preview/', '/en/preview/']));
    expect(rule.disallow).toEqual(expect.arrayContaining(['/vi/downloads/', '/en/downloads/']));
  });

  it('trỏ tới sitemap tuyệt đối', () => {
    expect(r.sitemap).toMatch(/^https?:\/\/[^/]+\/sitemap\.xml$/);
  });
});
