import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/site-settings', () => ({
  fetchSiteSettings: async () => ({ siteName: 'Studio X', logoUrl: null, seoDescription: '', youtubeUrl: '' }),
}));

const fetchLevelSummary = vi.fn();
const fetchSearch = vi.fn();
const fetchTracks = vi.fn();
vi.mock('@/lib/catalog', () => ({
  fetchLevelSummary: (...a: unknown[]) => fetchLevelSummary(...a),
  fetchSearch: (...a: unknown[]) => fetchSearch(...a),
}));
vi.mock('@/lib/courses', () => ({ fetchTracks: (...a: unknown[]) => fetchTracks(...a) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/catalog/sheet-grid', () => ({
  SheetGrid: ({ items }: { items: { id: string; title: string }[] }) => (
    <ul data-testid="grid">
      {items.map((i) => (
        <li key={i.id}>{i.title}</li>
      ))}
    </ul>
  ),
}));

import HomePage, { generateMetadata } from './page';

describe('generateMetadata (trang chủ)', () => {
  const meta = (locale: string) => generateMetadata({ params: Promise.resolve({ locale }) });

  it('title tuyệt đối (không dính hậu tố của layout), description, canonical, hreflang, Open Graph', async () => {
    const m = await meta('vi');
    expect(m.title).toEqual({ absolute: 'Studio X' });
    expect(m.description).toBe('homeDescription');
    expect(m.alternates?.canonical).toBe('/vi');
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi', en: '/en', 'x-default': '/en' });
    expect(m.openGraph).toMatchObject({ type: 'website', locale: 'vi_VN', alternateLocale: ['en_US'] });
    expect(String((m.openGraph as Record<string, unknown>).url)).toMatch(/^https?:\/\/[^/]+\/vi$/);
  });

  it('locale lạ thì metadata rỗng', async () => {
    expect(await meta('xx')).toEqual({});
  });
});

describe('HomePage', () => {
  const renderHome = async () => render(withIntl(await HomePage({ params: Promise.resolve({ locale: 'en' }) })));
  const sheets = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Sheet ${i}` }));

  beforeEach(() => {
    fetchLevelSummary.mockReset();
    fetchSearch.mockReset();
    fetchTracks.mockReset();
  });

  it('đủ dữ liệu: hero, 4 thẻ Level kèm số bài, 6 bài mới nhất, khối khoá học và bảng giá', async () => {
    fetchLevelSummary.mockResolvedValue({ total: 12 });
    fetchSearch.mockResolvedValue({ items: sheets });
    fetchTracks.mockResolvedValue([{ slug: 'a' }]);
    await renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beginner' })).toHaveAttribute('href', '/level/beginner');
    expect(screen.getAllByText('12 pieces')).toHaveLength(4);
    expect(screen.getByTestId('grid').children).toHaveLength(6);
    expect(fetchSearch).toHaveBeenCalledWith({ sort: 'newest', page: 1 });
    expect(screen.getByRole('link', { name: 'Start with Beginner' })).toHaveAttribute('href', '/en/level/beginner');
    expect(screen.getByRole('link', { name: 'Browse courses' })).toHaveAttribute('href', '/en/courses');
    expect(screen.getAllByRole('searchbox').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Explore courses' })).toHaveAttribute('href', '/en/courses');
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute('href', '/en/pricing');
  });

  it('API lỗi: vẫn hiện hero và thẻ Level (không số bài), ẩn lưới bài mới và khối khoá học', async () => {
    fetchLevelSummary.mockRejectedValue(new Error('API 500'));
    fetchSearch.mockRejectedValue(new Error('API 500'));
    fetchTracks.mockRejectedValue(new Error('API 500'));
    await renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^(Beginner|Intermediate|Advanced|Expert)$/ })).toHaveLength(4);
    expect(screen.queryByText(/^\d+ pieces?$/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore courses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Browse courses' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See pricing' })).toBeInTheDocument();
  });

  it('chưa có khoá học: ẩn khối khoá học, giữ bảng giá', async () => {
    fetchLevelSummary.mockResolvedValue({ total: 1 });
    fetchSearch.mockResolvedValue({ items: [] });
    fetchTracks.mockResolvedValue([]);
    await renderHome();
    expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore courses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Browse courses' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See pricing' })).toBeInTheDocument();
  });
});
