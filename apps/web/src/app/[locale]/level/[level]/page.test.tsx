import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchLevelSummary = vi.fn();
const fetchLevelSheets = vi.fn();
vi.mock('@/lib/catalog', () => ({
  fetchLevelSummary: (...a: unknown[]) => fetchLevelSummary(...a),
  fetchLevelSheets: (...a: unknown[]) => fetchLevelSheets(...a),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
  getFormatter: async () => ({ dateTime: () => 'DATE' }),
}));
vi.mock('@/components/catalog/genre-tags', () => ({ GenreTags: () => null }));
vi.mock('@/components/catalog/sort-links', () => ({ SortLinks: () => null }));
vi.mock('@/components/catalog/pagination', () => ({ Pagination: () => null }));
vi.mock('@/components/catalog/sheet-grid', () => ({ SheetGrid: () => <div data-testid="grid" /> }));
vi.mock('@/components/layout/search-form', () => ({ SearchForm: () => null }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import LevelPage, { generateMetadata } from './page';

const summary = {
  total: 3,
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  genres: [{ id: 'g1', slug: 'jazz', name: 'Jazz', count: 3 }],
};
const empty = { items: [], page: 1, pageSize: 12, total: 0 };

const run = (level: string, search: Record<string, string> = {}, locale = 'en') =>
  LevelPage({ params: Promise.resolve({ locale, level }), searchParams: Promise.resolve(search) });

describe('LevelPage', () => {
  beforeEach(() => {
    fetchLevelSummary.mockReset().mockResolvedValue(summary);
    fetchLevelSheets.mockReset().mockResolvedValue(empty);
  });

  it('notFound cho page=0, level lạ và page=2 không còn item', async () => {
    await expect(run('beginner', { page: '0' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run('foo')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run('beginner', { page: '2' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('genre lạ bị bỏ: list gọi với genre undefined', async () => {
    render(await run('beginner', { genre: 'khong-co' }));
    expect(fetchLevelSummary).toHaveBeenCalledWith('beginner');
    expect(fetchLevelSheets).toHaveBeenCalledWith('beginner', { page: 1, sort: 'newest', genre: undefined });
    expect(screen.queryByText('clearFilter')).toBeNull();
  });

  it('genre hợp lệ truyền slug và id; trạng thái rỗng kèm link bỏ lọc', async () => {
    render(await run('beginner', { genre: 'jazz' }));
    expect(fetchLevelSheets).toHaveBeenCalledWith('beginner', {
      page: 1,
      sort: 'newest',
      genre: summary.genres[0],
    });
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('clearFilter')).toHaveAttribute('href', '/level/beginner');
  });

  it('không genre: rỗng nhưng không có link bỏ lọc; fetch không có genre', async () => {
    render(await run('beginner'));
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.queryByText('clearFilter')).toBeNull();
    expect(fetchLevelSheets).toHaveBeenCalledWith('beginner', { page: 1, sort: 'newest' });
  });
});

describe('generateMetadata (Level)', () => {
  const meta = (level = 'beginner', locale = 'en') =>
    generateMetadata({ params: Promise.resolve({ locale, level }) });

  beforeEach(() => {
    fetchLevelSummary.mockReset().mockResolvedValue({ ...summary, total: 42 });
  });

  it('title, description kèm tổng số bài, canonical + hreflang, Open Graph website', async () => {
    const m = await meta();
    expect(m.title).toBe('heroTitle');
    expect(m.description).toBe('levelDescription');
    expect(m.alternates?.canonical).toBe('/en/level/beginner');
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi/level/beginner', en: '/en/level/beginner' });
    expect(m.openGraph).toMatchObject({ type: 'website', locale: 'en_US', alternateLocale: ['vi_VN'] });
    expect(fetchLevelSummary).toHaveBeenCalledWith('beginner');
  });

  it('locale vi: canonical /vi và og:locale vi_VN', async () => {
    const m = await meta('expert', 'vi');
    expect(m.alternates?.canonical).toBe('/vi/level/expert');
    expect(m.openGraph).toMatchObject({ locale: 'vi_VN' });
  });

  it('level hoặc locale lạ: metadata rỗng, không gọi API', async () => {
    fetchLevelSummary.mockClear();
    expect(await meta('zzz')).toEqual({});
    expect(await meta('beginner', 'xx')).toEqual({});
    expect(fetchLevelSummary).not.toHaveBeenCalled();
  });
});
