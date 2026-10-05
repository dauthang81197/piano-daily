import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const fetchGenre = vi.fn();
const fetchGenreSheets = vi.fn();
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

});

describe('generateMetadata', () => {
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
});
