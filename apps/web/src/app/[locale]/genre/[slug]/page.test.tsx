import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const fetchGenre = vi.fn();
const fetchGenreSheets = vi.fn();
const fetchAds = vi.fn();
vi.mock('@/lib/ads', () => ({ fetchAds: (...a: unknown[]) => fetchAds(...a) }));
vi.mock('@/components/ads/ad-slot-frame', () => ({
  AdSlotFrame: ({ slots, position }: { slots: unknown[]; position: string }) => (
    <div data-testid="ad" data-position={position} data-count={slots.length} />
  ),
}));
vi.mock('@/lib/catalog', () => ({
  fetchGenre: (...a: unknown[]) => fetchGenre(...a),
  fetchGenreSheets: (...a: unknown[]) => fetchGenreSheets(...a),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));
vi.mock('@/components/catalog/sort-links', () => ({
  SortLinks: ({ hrefFor }: { hrefFor: (s: 'newest' | 'most_viewed') => string }) => (
    <div data-testid="sort" data-newest={hrefFor('newest')} data-most-viewed={hrefFor('most_viewed')} />
  ),
}));
vi.mock('@/components/catalog/pagination', () => ({
  Pagination: ({ hrefFor }: { hrefFor: (p: number) => string }) => <div data-testid="pager" data-page-2={hrefFor(2)} />,
}));
vi.mock('@/components/catalog/sheet-grid', () => ({ SheetGrid: () => <div data-testid="grid" /> }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import GenrePage, { generateMetadata } from './page';

const item = { id: 'g1', slug: 'pop', name: 'Pop', icon: 'music' };
const empty = { items: [], page: 1, pageSize: 12, total: 0 };
const some = { items: [{ id: 'i1' }], page: 1, pageSize: 12, total: 1 };

const run = (search: Record<string, string> = {}, locale = 'en', slug = 'pop') =>
  GenrePage({ params: Promise.resolve({ locale, slug }), searchParams: Promise.resolve(search) });

describe('GenrePage', () => {
  beforeEach(() => {
    fetchAds.mockReset().mockResolvedValue([]);
    fetchGenre.mockReset().mockResolvedValue(item);
    fetchGenreSheets.mockReset().mockResolvedValue(some);
  });

  it('notFound: slug không tồn tại, page sai, page > 1 không còn item, locale lạ', async () => {
    fetchGenre.mockResolvedValue(null);
    await expect(run({}, 'en', 'zzz')).rejects.toThrow('NEXT_NOT_FOUND');
    fetchGenre.mockResolvedValue(item);
    await expect(run({ page: '0' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ page: 'abc' })).rejects.toThrow('NEXT_NOT_FOUND');
    fetchGenreSheets.mockResolvedValue(empty);
    await expect(run({ page: '2' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({}, 'xx')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('có bài: hiện tên, lưới; gọi danh sách với entity, page và sort (sort sai về newest)', async () => {
    render(withIntl(await run({ sort: 'x', page: '1' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Pop' })).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
    expect(fetchGenreSheets).toHaveBeenCalledWith(item, { page: 1, sort: 'newest' });
    expect(fetchGenre).toHaveBeenCalledWith('pop');
  });

  it('href sắp xếp và phân trang giữ slug và sort hiện tại; đổi sort thì về trang 1', async () => {
    render(withIntl(await run({ sort: 'most_viewed' })));
    expect(screen.getByTestId('pager')).toHaveAttribute('data-page-2', '/genre/pop?sort=most_viewed&page=2');
    expect(screen.getByTestId('sort')).toHaveAttribute('data-newest', '/genre/pop');
    expect(screen.getByTestId('sort')).toHaveAttribute('data-most-viewed', '/genre/pop?sort=most_viewed');
  });

  it('sort most_viewed được truyền', async () => {
    render(withIntl(await run({ sort: 'most_viewed' })));
    expect(fetchGenreSheets).toHaveBeenCalledWith(item, { page: 1, sort: 'most_viewed' });
  });

  it('không có bài: trạng thái rỗng và link 4 Level, không lưới', async () => {
    fetchGenreSheets.mockResolvedValue(empty);
    render(withIntl(await run()));
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('grid')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/level/beginner');
  });

  it('hiện icon khi có (svg trang trí); không icon hoặc icon lạ thì không có svg', async () => {
    const { container, unmount } = render(withIntl(await run()));
    expect(container.querySelector('h1 svg')).toHaveAttribute('aria-hidden', 'true');
    unmount();
    fetchGenre.mockResolvedValue({ ...item, icon: null });
    const second = render(withIntl(await run()));
    expect(second.container.querySelector('h1 svg')).toBeNull();
    second.unmount();
    fetchGenre.mockResolvedValue({ ...item, icon: 'khong-co' });
    const third = render(withIntl(await run()));
    expect(third.container.querySelector('h1 svg')).toBeNull();
    third.unmount();
    fetchGenre.mockResolvedValue({ ...item, icon: 'constructor' });
    const fourth = render(withIntl(await run()));
    expect(fourth.container.querySelector('h1 svg')).toBeNull();
  });


  it('IN_LIST: truyền quảng cáo từ fetchAds vào AdSlotFrame, nằm sau lưới', async () => {
    fetchAds.mockResolvedValue([{ id: 'a1', position: 'IN_LIST', htmlCode: '<b>x</b>', image: null, link: null }]);
    render(withIntl(await run()));
    const ad = screen.getByTestId('ad');
    expect(ad).toHaveAttribute('data-position', 'IN_LIST');
    expect(ad).toHaveAttribute('data-count', '1');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    fetchGenre.mockReset().mockResolvedValue(item);
  });

  const meta = () =>
    generateMetadata({ params: Promise.resolve({ locale: 'en', slug: 'pop' }) });

  it('title theo tên, canonical theo locale, không noindex', async () => {
    const m = await meta();
    expect(m.title).toBe('title:' + 'Pop');
    expect(m.alternates?.canonical).toBe('/en/genre/pop');
    expect(m.robots).toBeUndefined();
  });

  it('slug không tồn tại: metadata rỗng', async () => {
    fetchGenre.mockResolvedValue(null);
    expect(await meta()).toEqual({});
  });

  it('description mặc định theo tên thể loại, OG website không ảnh, hreflang vi/en', async () => {
    const m = await meta();
    expect(m.description).toBe('genreDescription:Pop');
    // Số bài lấy từ trang đầu (mặc định newest) để đưa vào mô tả.
    expect(fetchGenreSheets).toHaveBeenCalledWith(item, { page: 1, sort: 'newest' });
    expect(m.openGraph).toMatchObject({ type: 'website', locale: 'en_US' });
    expect((m.openGraph as Record<string, unknown>).images).toBeUndefined();
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi/genre/pop', en: '/en/genre/pop' });
  });
});
