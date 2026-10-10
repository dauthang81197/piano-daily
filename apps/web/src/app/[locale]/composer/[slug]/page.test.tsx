import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const fetchComposer = vi.fn();
const fetchComposerSheets = vi.fn();
const fetchAds = vi.fn();
vi.mock('@/lib/ads', () => ({ fetchAds: (...a: unknown[]) => fetchAds(...a) }));
vi.mock('@/components/ads/ad-slot-frame', () => ({
  AdSlotFrame: ({ slots, position }: { slots: unknown[]; position: string }) => (
    <div data-testid="ad" data-position={position} data-count={slots.length} />
  ),
}));
vi.mock('@/lib/catalog', () => ({
  fetchComposer: (...a: unknown[]) => fetchComposer(...a),
  fetchComposerSheets: (...a: unknown[]) => fetchComposerSheets(...a),
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

import ComposerPage, { generateMetadata } from './page';

const item = { id: 'c1', slug: 'bach', name: 'Bach', bio: 'Baroque\nmaster', avatarUrl: 'http://cdn/a.webp' };
const empty = { items: [], page: 1, pageSize: 12, total: 0 };
const some = { items: [{ id: 'i1' }], page: 1, pageSize: 12, total: 1 };

const run = (search: Record<string, string> = {}, locale = 'en', slug = 'bach') =>
  ComposerPage({ params: Promise.resolve({ locale, slug }), searchParams: Promise.resolve(search) });

describe('ComposerPage', () => {
  beforeEach(() => {
    fetchAds.mockReset().mockResolvedValue([]);
    fetchComposer.mockReset().mockResolvedValue(item);
    fetchComposerSheets.mockReset().mockResolvedValue(some);
  });

  it('notFound: slug không tồn tại, page sai, page > 1 không còn item, locale lạ', async () => {
    fetchComposer.mockResolvedValue(null);
    await expect(run({}, 'en', 'zzz')).rejects.toThrow('NEXT_NOT_FOUND');
    fetchComposer.mockResolvedValue(item);
    await expect(run({ page: '0' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ page: 'abc' })).rejects.toThrow('NEXT_NOT_FOUND');
    fetchComposerSheets.mockResolvedValue(empty);
    await expect(run({ page: '2' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({}, 'xx')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('có bài: hiện tên, lưới; gọi danh sách với entity, page và sort (sort sai về newest)', async () => {
    render(withIntl(await run({ sort: 'x', page: '1' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Bach' })).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
    expect(fetchComposerSheets).toHaveBeenCalledWith(item, { page: 1, sort: 'newest' });
    expect(fetchComposer).toHaveBeenCalledWith('bach');
  });

  it('href sắp xếp và phân trang giữ slug và sort hiện tại; đổi sort thì về trang 1', async () => {
    render(withIntl(await run({ sort: 'most_viewed' })));
    expect(screen.getByTestId('pager')).toHaveAttribute('data-page-2', '/composer/bach?sort=most_viewed&page=2');
    expect(screen.getByTestId('sort')).toHaveAttribute('data-newest', '/composer/bach');
    expect(screen.getByTestId('sort')).toHaveAttribute('data-most-viewed', '/composer/bach?sort=most_viewed');
  });

  it('sort most_viewed được truyền', async () => {
    render(withIntl(await run({ sort: 'most_viewed' })));
    expect(fetchComposerSheets).toHaveBeenCalledWith(item, { page: 1, sort: 'most_viewed' });
  });

  it('không có bài: trạng thái rỗng và link 4 Level, không lưới', async () => {
    fetchComposerSheets.mockResolvedValue(empty);
    render(withIntl(await run()));
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('grid')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/level/beginner');
  });

  it('hiện bio và avatar khi có; ẩn khi null', async () => {
    const { unmount } = render(withIntl(await run()));
    expect(screen.getByText(/Baroque/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://cdn/a.webp');
    unmount();
    fetchComposer.mockResolvedValue({ ...item, bio: null, avatarUrl: null });
    render(withIntl(await run()));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Baroque/)).toBeNull();
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
    fetchComposer.mockReset().mockResolvedValue(item);
  });

  const meta = () =>
    generateMetadata({ params: Promise.resolve({ locale: 'en', slug: 'bach' }) });

  it('title theo tên, canonical theo locale, không noindex', async () => {
    const m = await meta();
    expect(m.title).toBe('title:' + 'Bach');
    expect(m.alternates?.canonical).toBe('/en/composer/bach');
    expect(m.robots).toBeUndefined();
  });

  it('slug không tồn tại: metadata rỗng', async () => {
    fetchComposer.mockResolvedValue(null);
    expect(await meta()).toEqual({});
  });

  it('description = bio của Composer; OG có ảnh avatar; hreflang vi/en', async () => {
    const m = await meta();
    expect(m.description).toBe('Baroque master');
    expect(m.openGraph).toMatchObject({
      type: 'website',
      locale: 'en_US',
      images: [{ url: 'http://cdn/a.webp' }],
      url: expect.stringMatching(/\/en\/composer\/bach$/),
    });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi/composer/bach', en: '/en/composer/bach' });
  });

  it('không có bio: mô tả mặc định theo tên; không có avatar: không bịa ảnh', async () => {
    fetchComposer.mockResolvedValue({ ...item, bio: '  ', avatarUrl: null });
    const m = await meta();
    expect(m.description).toBe('composerDescription:Bach');
    expect((m.openGraph as Record<string, unknown>).images).toBeUndefined();
    expect(m.twitter).toMatchObject({ card: 'summary' });
  });
});
