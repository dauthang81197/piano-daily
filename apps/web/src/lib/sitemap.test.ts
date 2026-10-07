import { describe, expect, it } from 'vitest';
import { buildSitemap } from './sitemap';

const entries = {
  sheets: [{ slug: 'fur-elise', updatedAt: '2026-10-01T00:00:00.000Z' }],
  composers: [{ slug: 'beethoven', updatedAt: '2026-10-02T00:00:00.000Z' }],
  genres: [{ slug: 'classical', updatedAt: '2026-10-03T00:00:00.000Z' }],
};
const BASE = 'https://pianodaily.example';

describe('buildSitemap', () => {
  const map = buildSitemap(entries, BASE);
  const urls = map.map((e) => e.url);

  it('gồm trang chủ, 4 Level, Sheet, Composer, Genre cho CẢ HAI locale', () => {
    for (const locale of ['vi', 'en']) {
      expect(urls).toEqual(
        expect.arrayContaining([
          `${BASE}/${locale}`,
          `${BASE}/${locale}/level/beginner`,
          `${BASE}/${locale}/level/intermediate`,
          `${BASE}/${locale}/level/advanced`,
          `${BASE}/${locale}/level/expert`,
          `${BASE}/${locale}/sheet/fur-elise`,
          `${BASE}/${locale}/composer/beethoven`,
          `${BASE}/${locale}/genre/classical`,
        ]),
      );
    }
    expect(map).toHaveLength(2 * (1 + 4 + 1 + 1 + 1));
  });

  it('mỗi URL kèm hreflang vi, en và x-default trỏ đúng cặp', () => {
    const entry = map.find((e) => e.url === `${BASE}/vi/sheet/fur-elise`)!;
    expect(entry.alternates?.languages).toEqual({
      vi: `${BASE}/vi/sheet/fur-elise`,
      en: `${BASE}/en/sheet/fur-elise`,
      'x-default': `${BASE}/en/sheet/fur-elise`,
    });
    expect(map.find((e) => e.url === `${BASE}/en`)!.alternates?.languages).toMatchObject({ vi: `${BASE}/vi`, en: `${BASE}/en` });
  });

  it('lastModified lấy từ API cho Sheet/Composer/Genre; trang chủ và Level không có', () => {
    expect(map.find((e) => e.url.endsWith('/vi/sheet/fur-elise'))!.lastModified).toBe('2026-10-01T00:00:00.000Z');
    expect(map.find((e) => e.url.endsWith('/en/composer/beethoven'))!.lastModified).toBe('2026-10-02T00:00:00.000Z');
    expect(map.find((e) => e.url.endsWith('/vi/genre/classical'))!.lastModified).toBe('2026-10-03T00:00:00.000Z');
    expect(map.find((e) => e.url === `${BASE}/vi`)!.lastModified).toBeUndefined();
    expect(map.find((e) => e.url.endsWith('/vi/level/beginner'))!.lastModified).toBeUndefined();
  });

  it('không có Search, preview, tải hay admin; không có URL trùng', () => {
    expect(urls.some((u) => /search|preview|download|admin|api/.test(u))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('mã hoá slug; dữ liệu rỗng vẫn có trang chủ và Level', () => {
    const odd = buildSitemap({ sheets: [{ slug: 'a b', updatedAt: '2026-10-01T00:00:00.000Z' }], composers: [], genres: [] }, BASE);
    expect(odd.some((e) => e.url === `${BASE}/vi/sheet/a%20b`)).toBe(true);
    expect(buildSitemap({ sheets: [], composers: [], genres: [] }, BASE)).toHaveLength(2 * 5);
  });
});
