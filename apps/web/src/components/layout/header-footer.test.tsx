import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from './test-utils';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Footer } from './footer';
import { Header } from './header';

describe('Header', () => {
  it('mặc định hiện tên cũ, không có logo', () => {
    const { container } = render(withIntl(<Header />));
    expect(screen.getByRole('link', { name: 'Piano Daily, go to home page' })).toHaveTextContent('Piano Daily');
    expect(container.querySelector('header img')).toBeNull();
  });

  it('hiện tên site đã lưu và logo nếu có', () => {
    const { container } = render(withIntl(<Header siteName="Studio X" logoUrl="https://m.test/logo.webp" />));
    expect(screen.getByText('Studio X')).toBeInTheDocument();
    expect(container.querySelector('header img')).toHaveAttribute('src', 'https://m.test/logo.webp');
  });
});

describe('Header (bố cục mới)', () => {
  it('nav chỉ có Level, Khoá học, Bảng giá; ô tìm có nút icon tên "Search"', () => {
    render(withIntl(<Header />));
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toHaveTextContent('Beginner');
    expect(nav).toHaveTextContent('Courses');
    expect(nav).toHaveTextContent('Pricing');
    expect(nav).not.toHaveTextContent('Home');
    expect(screen.getAllByRole('button', { name: 'Search' }).length).toBeGreaterThan(0);
  });
});

describe('Footer', () => {
  it('có cột Học và gói, link Level và dòng bản quyền theo tên site', () => {
    render(withIntl(<Footer siteName="Studio X" />));
    expect(screen.getByRole('link', { name: 'Courses' })).toHaveAttribute('href', '/courses');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: 'Beginner' })).toHaveAttribute('href', '/level/beginner');
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Studio X`))).toBeInTheDocument();
  });

  it('có link YouTube khi được cấu hình', () => {
    render(withIntl(<Footer youtubeUrl="https://www.youtube.com/@pd" />));
    const link = screen.getByRole('link', { name: 'YouTube channel' });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/@pd');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('ẩn link YouTube khi rỗng', () => {
    render(withIntl(<Footer youtubeUrl="" />));
    expect(screen.queryByRole('link', { name: 'YouTube channel' })).not.toBeInTheDocument();
    render(withIntl(<Footer />));
    expect(screen.queryByRole('link', { name: 'YouTube channel' })).not.toBeInTheDocument();
  });
});

describe('Thanh toán đang ẩn (NEXT_PUBLIC_PAYMENTS_ENABLED tắt)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('menu chính và footer không có link Bảng giá', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '');
    render(withIntl(<Header />));
    render(withIntl(<Footer />));
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Courses' }).length).toBeGreaterThan(0);
  });
});
