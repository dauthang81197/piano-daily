import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => (key === 'description' ? 'mô tả mặc định' : key),
}));
vi.mock('next/navigation', () => ({ notFound: () => undefined }));
vi.mock('../fonts', () => ({ beVietnamPro: { variable: '' }, playfairDisplay: { variable: '' } }));
vi.mock('../globals.css', () => ({}));
vi.mock('next-intl', () => ({ hasLocale: (locales: string[], l: string) => locales.includes(l), NextIntlClientProvider: ({ children }: { children: unknown }) => children }));
vi.mock('@/components/layout/header', () => ({
  Header: ({ siteName, logoUrl }: { siteName: string; logoUrl: string | null }) => `[header:${siteName}|${logoUrl}]`,
}));
vi.mock('@/components/layout/footer', () => ({ Footer: ({ youtubeUrl }: { youtubeUrl: string }) => `[footer:${youtubeUrl}]` }));
vi.mock('@/lib/site-settings', () => ({ fetchSiteSettings: vi.fn() }));
vi.mock('@/lib/ads', () => ({ fetchAds: vi.fn() }));
vi.mock('@/components/ads/ad-slot-frame', () => ({
  AdSlotFrame: ({ slots, position }: { slots: { position: string }[]; position: string }) =>
    slots.some((s) => s.position === position) ? `[ad:${position}]` : null,
}));
vi.mock('@/components/ads/sticky-bottom-ad', () => ({
  StickyBottomAd: ({ slots }: { slots: { position: string }[] }) => (slots.some((s) => s.position === 'STICKY_BOTTOM') ? '[sticky]' : null),
}));

import { fetchAds } from '@/lib/ads';
import { fetchSiteSettings } from '@/lib/site-settings';
import { renderToStaticMarkup } from 'react-dom/server';
import LocaleLayout, { generateMetadata } from './layout';

const site = { siteName: 'Studio X', logoUrl: null, seoDescription: 'Mô tả đã lưu', youtubeUrl: '' };

describe('generateMetadata (layout)', () => {
  beforeEach(() => {
    vi.mocked(fetchSiteSettings).mockReset();
  });

  it('dùng tên site và mô tả SEO đã lưu', async () => {
    vi.mocked(fetchSiteSettings).mockResolvedValue(site);
    const m = await generateMetadata({ params: Promise.resolve({ locale: 'vi' }) });
    expect(m.title).toEqual({ default: 'Studio X', template: '%s | Studio X' });
    expect(m.description).toBe('Mô tả đã lưu');
  });

  it('mô tả SEO rỗng thì dùng mô tả mặc định theo locale', async () => {
    vi.mocked(fetchSiteSettings).mockResolvedValue({ ...site, seoDescription: '' });
    const m = await generateMetadata({ params: Promise.resolve({ locale: 'vi' }) });
    expect(m.description).toBe('mô tả mặc định');
  });
});

describe('LocaleLayout', () => {
  beforeEach(() => {
    vi.mocked(fetchAds).mockResolvedValue([]);
  });

  it('truyền tên site, logo và link YouTube đã lưu cho Header và Footer', async () => {
    vi.mocked(fetchSiteSettings).mockResolvedValue({ ...site, logoUrl: 'https://cdn.test/logo.webp', youtubeUrl: 'https://youtube.com/@x' });
    const tree = await LocaleLayout({ children: 'nội dung', params: Promise.resolve({ locale: 'vi' }) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('[header:Studio X|https://cdn.test/logo.webp]');
    expect(html).toContain('[footer:https://youtube.com/@x]');
    expect(html).toContain('nội dung');
    expect(html).not.toContain('[ad:');
    expect(html).not.toContain('[sticky]');
  });

  it('HEADER ngay sau Header, STICKY_BOTTOM sau Footer', async () => {
    vi.mocked(fetchSiteSettings).mockResolvedValue(site);
    vi.mocked(fetchAds).mockResolvedValue([
      { position: 'HEADER', htmlCode: 'x', image: null, link: null },
      { position: 'STICKY_BOTTOM', htmlCode: 'y', image: null, link: null },
    ]);
    const html = renderToStaticMarkup(await LocaleLayout({ children: 'nội dung', params: Promise.resolve({ locale: 'vi' }) }));
    expect(html.indexOf('[header:')).toBeLessThan(html.indexOf('[ad:HEADER]'));
    expect(html.indexOf('[ad:HEADER]')).toBeLessThan(html.indexOf('nội dung'));
    expect(html.indexOf('[footer:')).toBeLessThan(html.indexOf('[sticky]'));
  });
});
