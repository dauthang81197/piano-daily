import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSheetDetail = vi.fn();
vi.mock('@/lib/catalog', () => ({ fetchSheetDetail: (...a: unknown[]) => fetchSheetDetail(...a) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.title ? `${key}:${values.title}` : key,
}));
// Mô tả mặc định do `lib/sheet-seo` dựng (có test riêng); ở đây chỉ cần biết trang truyền đúng cho metadata/JSON-LD.
vi.mock('@/lib/sheet-seo', () => ({
  sheetDescription: async (s: { description: string | null }) => s.description ?? 'mô tả mặc định',
}));
vi.mock('@/components/sheet/view-beacon', () => ({
  ViewBeacon: ({ sheetId }: { sheetId: string }) => <span data-testid="beacon" data-sheet-id={sheetId} />,
}));
vi.mock('@/components/sheet/sheet-detail', () => ({
  SheetDetail: ({ sheet }: { sheet: { title: string } }) => <h1>{sheet.title}</h1>,
}));

import SheetPage, { generateMetadata } from './page';

const sheet = {
  id: 'sheet-1',
  slug: 'fur-elise',
  title: 'Für Elise',
  description: 'Một bản nhạc nổi tiếng',
  level: 'BEGINNER',
  composer: { id: 'c1', name: 'Beethoven', slug: 'beethoven' },
  genres: [{ id: 'g1', name: 'Classical', slug: 'classical' }],
  pages: [{ pageNumber: 1, url: 'https://cdn.example.com/p1.webp' }],
  updatedAt: '2026-10-07T00:00:00.000Z',
};

const run = (locale = 'en', slug = 'fur-elise') => SheetPage({ params: Promise.resolve({ locale, slug }) });

describe('SheetPage', () => {
  beforeEach(() => {
    fetchSheetDetail.mockReset().mockResolvedValue(sheet);
  });

  it('render chi tiết khi có dữ liệu', async () => {
    render(await run());
    expect(screen.getByRole('heading', { name: 'Für Elise' })).toBeInTheDocument();
    expect(fetchSheetDetail).toHaveBeenCalledWith('fur-elise');
  });

  it('gắn ViewBeacon với id Sheet (ngoài SheetDetail để preview không đếm)', async () => {
    render(await run());
    expect(screen.getByTestId('beacon')).toHaveAttribute('data-sheet-id', 'sheet-1');
  });

  it('JSON-LD: một MusicComposition và một BreadcrumbList hợp lệ, đúng URL theo locale', async () => {
    const { container } = render(await run('vi'));
    const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.textContent ?? ''),
    );
    expect(blocks.map((b) => b['@type'])).toEqual(['MusicComposition', 'BreadcrumbList']);
    const [music, crumbs] = blocks;
    expect(music.name).toBe('Für Elise');
    expect(music.url).toMatch(/\/vi\/sheet\/fur-elise$/);
    expect(music.composer).toMatchObject({ '@type': 'Person', name: 'Beethoven' });
    expect(music.description).toBe('Một bản nhạc nổi tiếng');
    expect(crumbs.itemListElement).toHaveLength(3);
    expect(crumbs.itemListElement[1].item).toMatch(/\/vi\/level\/beginner$/);
  });

  it('JSON-LD không thể bị phá bởi dữ liệu có </script>', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, title: '</script><script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' });
    const { container } = render(await run());
    expect(container.querySelectorAll('script').length).toBe(2); // đúng hai khối JSON-LD, không script chèn thêm
    const raw = [...container.querySelectorAll('script')].map((s) => s.textContent ?? '').join('');
    expect(raw).not.toContain('</script>');
    expect(raw).not.toContain('<img');
    expect(JSON.parse(container.querySelector('script')!.textContent ?? '').name).toBe('</script><script>alert(1)</script>');
  });

  it('notFound: slug không tồn tại hoặc locale lạ', async () => {
    fetchSheetDetail.mockResolvedValue(null);
    await expect(run('en', 'zzz')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run('xx')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    fetchSheetDetail.mockReset().mockResolvedValue(sheet);
  });

  const meta = (slug = 'fur-elise', locale = 'en') => generateMetadata({ params: Promise.resolve({ locale, slug }) });

  it('title, description, canonical + hreflang, Open Graph article kèm ảnh trang đầu, Twitter card lớn', async () => {
    const m = await meta();
    expect(m.title).toBe('heading:Für Elise');
    expect(m.description).toBe('Một bản nhạc nổi tiếng');
    expect(m.alternates?.canonical).toBe('/en/sheet/fur-elise');
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi/sheet/fur-elise', en: '/en/sheet/fur-elise', 'x-default': '/en/sheet/fur-elise' });
    expect(m.openGraph).toMatchObject({
      type: 'article',
      url: expect.stringMatching(/\/en\/sheet\/fur-elise$/),
      locale: 'en_US',
      alternateLocale: ['vi_VN'],
      images: [{ url: 'https://cdn.example.com/p1.webp' }],
    });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://cdn.example.com/p1.webp'] });
    expect(m.robots).toBeUndefined();
  });

  it('locale vi: og:locale vi_VN và canonical /vi', async () => {
    const m = await meta('fur-elise', 'vi');
    expect(m.alternates?.canonical).toBe('/vi/sheet/fur-elise');
    expect(m.openGraph).toMatchObject({ locale: 'vi_VN', alternateLocale: ['en_US'] });
  });

  it('không có ảnh trang: OG không có images, Twitter summary', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, pages: [] });
    const m = await meta();
    expect((m.openGraph as Record<string, unknown>).images).toBeUndefined();
    expect(m.twitter).toMatchObject({ card: 'summary' });
  });

  it('không có description của admin thì dùng mô tả mặc định', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, description: null });
    expect((await meta()).description).toBe('mô tả mặc định');
  });

  it('cắt description 160 ký tự theo code point', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, description: '😀'.repeat(200) });
    const d = String((await meta()).description);
    expect(Array.from(d)).toHaveLength(160);
    expect(d.endsWith('…')).toBe(true);
  });

  it('slug không tồn tại hoặc locale lạ thì metadata rỗng', async () => {
    fetchSheetDetail.mockResolvedValue(null);
    expect(await meta()).toEqual({});
    expect(await meta('fur-elise', 'xx')).toEqual({});
  });
});
