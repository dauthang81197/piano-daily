import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFacets = vi.fn();
const fetchSearch = vi.fn();
const fetchAds = vi.fn();
vi.mock('@/lib/ads', () => ({ fetchAds: (...a: unknown[]) => fetchAds(...a) }));
vi.mock('@/components/ads/ad-slot-frame', () => ({
  AdSlotFrame: ({ slots, position }: { slots: unknown[]; position: string }) => (
    <div data-testid="ad" data-position={position} data-count={slots.length} />
  ),
}));
vi.mock('@/lib/catalog', () => ({
  fetchFacets: (...a: unknown[]) => fetchFacets(...a),
  fetchSearch: (...a: unknown[]) => fetchSearch(...a),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.filter ? `${key}:${values.filter}` : key,
}));
vi.mock('@/components/catalog/genre-tags', () => ({ GenreTags: () => null }));
vi.mock('@/components/catalog/sort-links', () => ({ SortLinks: () => null }));
vi.mock('@/components/catalog/pagination', () => ({ Pagination: () => null }));
vi.mock('@/components/catalog/search-filters', () => ({ SearchFilters: () => null }));
vi.mock('@/components/catalog/sheet-grid', () => ({ SheetGrid: () => <div data-testid="grid" /> }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SearchPage, { generateMetadata } from './page';

const facets = {
  genres: [{ id: 'g1', slug: 'jazz', name: 'Jazz', count: 3 }],
  composers: [{ id: 'c1', slug: 'bach', name: 'Bach', count: 3 }],
};
const empty = { items: [], page: 1, pageSize: 12, total: 0 };
const some = { items: [{ id: 'i1' }], page: 1, pageSize: 12, total: 1 };

const run = (search: Record<string, string> = {}, locale = 'en') =>
  SearchPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(search) });

describe('SearchPage', () => {
  beforeEach(() => {
    fetchAds.mockReset().mockResolvedValue([]);
    fetchFacets.mockReset().mockResolvedValue(facets);
    fetchSearch.mockReset().mockResolvedValue(empty);
  });

  it('notFound cho page sai và page > 1 không còn item', async () => {
    await expect(run({ page: '0' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ page: 'abc' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ page: '2' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({}, 'xx')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('không tham số: liệt kê toàn bộ (gọi list với sort newest, không bộ lọc)', async () => {
    fetchSearch.mockResolvedValue(some);
    render(await run());
    expect(fetchSearch).toHaveBeenCalledWith({
      q: undefined,
      level: undefined,
      format: undefined,
      sort: 'newest',
      page: 1,
    });
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });

  it('có q: sort mặc định relevance; level/format/sort sai bị bỏ', async () => {
    render(await run({ q: ' dem thu ', level: 'foo', format: 'pdf', sort: 'x' }));
    expect(fetchSearch).toHaveBeenCalledWith({
      q: 'dem thu',
      level: undefined,
      format: undefined,
      sort: 'relevance',
      page: 1,
    });
  });

  it('genre và composer lạ bị bỏ lọc (list gọi không kèm slug)', async () => {
    render(await run({ genre: 'zzz', composer: 'nobody' }));
    expect(fetchSearch).toHaveBeenCalledWith(
      expect.objectContaining({ genre: undefined, composer: undefined }),
    );
    expect(screen.queryByText(/^clearFilter/)).toBeNull();
  });

  it('genre và composer hợp lệ được truyền; trạng thái rỗng có link bỏ từng bộ lọc và 4 Level', async () => {
    render(await run({ q: 'zzz', level: 'beginner', genre: 'jazz', composer: 'bach', format: 'midi' }));
    expect(fetchSearch).toHaveBeenCalledWith({
      q: 'zzz',
      level: 'beginner',
      genre: 'jazz',
      composer: 'bach',
      format: 'midi',
      sort: 'relevance',
      page: 1,
    });
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    const clear = screen.getAllByText(/^clearFilter/);
    expect(clear).toHaveLength(5);
    expect(screen.getByText('clearFilter:“zzz”')).toHaveAttribute(
      'href',
      '/search?level=beginner&genre=jazz&composer=bach&format=midi',
    );
    expect(screen.getByText('clearFilter:Jazz')).toHaveAttribute(
      'href',
      '/search?q=zzz&level=beginner&composer=bach&format=midi',
    );
    expect(screen.getByText('levels.expert')).toHaveAttribute('href', '/level/expert');
    expect(screen.getAllByText(/^levels\./)).toHaveLength(4);
  });

  it('rỗng không có bộ lọc: không có link bỏ lọc nhưng vẫn có link Level', async () => {
    render(await run());
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.queryByText(/^clearFilter/)).toBeNull();
    expect(screen.getAllByText(/^levels\./)).toHaveLength(4);
  });

  it('IN_LIST: truyền quảng cáo từ fetchAds vào AdSlotFrame, nằm sau lưới', async () => {
    fetchAds.mockResolvedValue([{ id: 'a1', position: 'IN_LIST', htmlCode: '<b>x</b>', image: null, link: null }]);
    render(await run());
    const ad = screen.getByTestId('ad');
    expect(ad).toHaveAttribute('data-position', 'IN_LIST');
    expect(ad).toHaveAttribute('data-count', '1');
  });
});

describe('generateMetadata', () => {
  const meta = (search: Record<string, string>) =>
    generateMetadata({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(search) });

  it('noindex khi có tham số lọc, không có thì index mặc định', async () => {
    expect((await meta({ q: 'x' })).robots).toEqual({ index: false, follow: true });
    expect((await meta({ page: '2' })).robots).toEqual({ index: false, follow: true });
    expect((await meta({})).robots).toBeUndefined();
    expect((await meta({})).alternates?.canonical).toBe('/en/search');
  });

  it('có description và Open Graph; vẫn canonical dù noindex khi có bộ lọc', async () => {
    const unfiltered = await meta({});
    expect(unfiltered.description).toBe('searchDescription');
    expect(unfiltered.openGraph).toMatchObject({ type: 'website', locale: 'en_US' });
    const filtered = await meta({ genre: 'jazz' });
    expect(filtered.robots).toEqual({ index: false, follow: true });
    expect(filtered.alternates?.canonical).toBe('/en/search');
  });
});
