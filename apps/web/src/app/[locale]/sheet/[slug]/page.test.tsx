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
vi.mock('@/components/sheet/sheet-detail', () => ({
  SheetDetail: ({ sheet }: { sheet: { title: string } }) => <h1>{sheet.title}</h1>,
}));

import SheetPage, { generateMetadata } from './page';

const sheet = { slug: 'fur-elise', title: 'Für Elise', description: 'Một bản nhạc nổi tiếng' };

describe('SheetPage', () => {
  beforeEach(() => {
    fetchSheetDetail.mockReset().mockResolvedValue(sheet);
  });

  it('render chi tiết khi có dữ liệu', async () => {
    render(await SheetPage({ params: Promise.resolve({ locale: 'en', slug: 'fur-elise' }) }));
    expect(screen.getByRole('heading', { name: 'Für Elise' })).toBeInTheDocument();
    expect(fetchSheetDetail).toHaveBeenCalledWith('fur-elise');
  });

  it('notFound: slug không tồn tại hoặc locale lạ', async () => {
    fetchSheetDetail.mockResolvedValue(null);
    await expect(SheetPage({ params: Promise.resolve({ locale: 'en', slug: 'zzz' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(SheetPage({ params: Promise.resolve({ locale: 'xx', slug: 'fur-elise' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    fetchSheetDetail.mockReset().mockResolvedValue(sheet);
  });

  const meta = (slug = 'fur-elise') => generateMetadata({ params: Promise.resolve({ locale: 'en', slug }) });

  it('title, description, canonical theo locale, không noindex', async () => {
    const m = await meta();
    expect(m.title).toBe('heading:Für Elise');
    expect(m.description).toBe('Một bản nhạc nổi tiếng');
    expect(m.alternates?.canonical).toBe('/en/sheet/fur-elise');
    expect(m.robots).toBeUndefined();
  });

  it('cắt description 160 ký tự theo code point', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, description: '😀'.repeat(200) });
    expect(Array.from(String((await meta()).description))).toHaveLength(160);
  });

  it('không có description thì bỏ; slug không tồn tại thì metadata rỗng', async () => {
    fetchSheetDetail.mockResolvedValue({ ...sheet, description: null });
    expect((await meta()).description).toBeUndefined();
    fetchSheetDetail.mockResolvedValue(null);
    expect(await meta()).toEqual({});
  });
});
