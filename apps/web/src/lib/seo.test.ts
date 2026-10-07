import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX, localeAlternates, pageMetadata, SITE_NAME, truncateDescription } from './seo';

describe('localeAlternates', () => {
  it('trang chủ', () => {
    expect(localeAlternates('/', 'vi')).toEqual({
      canonical: '/vi',
      languages: { vi: '/vi', en: '/en', 'x-default': '/en' },
    });
  });
  it('path con', () => {
    const alt = localeAlternates('/level/beginner', 'en');
    expect(alt.canonical).toBe('/en/level/beginner');
    expect(alt.languages).toEqual({
      vi: '/vi/level/beginner',
      en: '/en/level/beginner',
      'x-default': '/en/level/beginner',
    });
  });
});

describe('truncateDescription', () => {
  it('gọn khoảng trắng; ngắn thì giữ nguyên', () => {
    expect(truncateDescription('  Một   bản\n nhạc \t hay  ')).toBe('Một bản nhạc hay');
    expect(truncateDescription('x'.repeat(DESCRIPTION_MAX))).toHaveLength(DESCRIPTION_MAX);
  });
  it('dài thì cắt đúng 160 code point, kết thúc bằng … và không chẻ surrogate', () => {
    const out = truncateDescription('😀'.repeat(300));
    expect(Array.from(out)).toHaveLength(DESCRIPTION_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
  it('không để khoảng trắng thừa trước dấu …', () => {
    const out = truncateDescription(`${'a'.repeat(158)} ${'b'.repeat(50)}`);
    expect(out.endsWith(' …')).toBe(false);
  });
});

describe('pageMetadata', () => {
  const base = { locale: 'vi', path: '/level/beginner', title: 'Sheet Cơ bản', description: 'Mô tả ngắn' } as const;

  it('title, description, canonical + hreflang (vi, en, x-default)', () => {
    const m = pageMetadata(base);
    expect(m.title).toBe('Sheet Cơ bản');
    expect(m.description).toBe('Mô tả ngắn');
    expect(m.alternates).toEqual({
      canonical: '/vi/level/beginner',
      languages: { vi: '/vi/level/beginner', en: '/en/level/beginner', 'x-default': '/en/level/beginner' },
    });
  });

  it('Open Graph: type, url tuyệt đối theo locale, siteName, og:locale và alternate', () => {
    const og = pageMetadata(base).openGraph as Record<string, unknown>;
    expect(og).toMatchObject({
      type: 'website',
      title: 'Sheet Cơ bản',
      description: 'Mô tả ngắn',
      siteName: SITE_NAME,
      locale: 'vi_VN',
      alternateLocale: ['en_US'],
    });
    expect(String(og.url)).toMatch(/^https?:\/\/[^/]+\/vi\/level\/beginner$/);
    expect(og.images).toBeUndefined();
    const en = pageMetadata({ ...base, locale: 'en' }).openGraph as Record<string, unknown>;
    expect(en).toMatchObject({ locale: 'en_US', alternateLocale: ['vi_VN'] });
    expect(String(en.url)).toMatch(/\/en\/level\/beginner$/);
  });

  it('có ảnh: OG images và Twitter summary_large_image; không ảnh: summary, không bịa ảnh', () => {
    const withImage = pageMetadata({ ...base, image: 'https://cdn.example.com/a.webp', type: 'article' });
    expect(withImage.openGraph).toMatchObject({ type: 'article', images: [{ url: 'https://cdn.example.com/a.webp' }] });
    expect(withImage.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://cdn.example.com/a.webp'] });
    for (const none of [undefined, null, '']) {
      const m = pageMetadata({ ...base, image: none });
      expect((m.openGraph as Record<string, unknown>).images).toBeUndefined();
      expect(m.twitter).toMatchObject({ card: 'summary' });
      expect((m.twitter as Record<string, unknown>).images).toBeUndefined();
    }
  });

  it('mô tả dài được cắt ở cả description, OG và Twitter', () => {
    const m = pageMetadata({ ...base, description: 'x'.repeat(500) });
    for (const d of [m.description, (m.openGraph as Record<string, string>).description, (m.twitter as Record<string, string>).description]) {
      expect(Array.from(String(d)).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it('trang chủ: path "/" cho URL /vi, title tuyệt đối không dính hậu tố của layout', () => {
    const m = pageMetadata({ ...base, path: '/', title: 'Piano Daily', absoluteTitle: true });
    expect(m.title).toEqual({ absolute: 'Piano Daily' });
    expect(m.alternates?.canonical).toBe('/vi');
    expect(String((m.openGraph as Record<string, unknown>).url)).toMatch(/\/vi$/);
  });

  it('robots chỉ có khi được truyền (Search có bộ lọc)', () => {
    expect(pageMetadata(base).robots).toBeUndefined();
    expect(pageMetadata({ ...base, robots: { index: false, follow: true } }).robots).toEqual({ index: false, follow: true });
  });
});
