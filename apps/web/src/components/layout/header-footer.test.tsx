import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('Footer', () => {
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
