import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from './test-utils';

let path = '/';
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => path,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { isActivePath, PrimaryNav } from './nav-links';

describe('isActivePath', () => {
  it('khớp đúng trang hoặc trang con, không khớp tiền tố giả', () => {
    expect(isActivePath('/level/beginner', '/level/beginner')).toBe(true);
    expect(isActivePath('/courses/piano-co-ban/abc', '/courses')).toBe(true);
    expect(isActivePath('/courses-old', '/courses')).toBe(false);
    expect(isActivePath('/sheet/x', '/level/beginner')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/pricing', '/')).toBe(false);
  });
});

describe('PrimaryNav', () => {
  it('đánh dấu aria-current cho trang hiện tại, link khác thì không', () => {
    path = '/level/beginner';
    render(withIntl(<PrimaryNav variant="bar" />));
    expect(screen.getByRole('link', { name: 'Beginner' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Expert' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });
  it('không link nào active ở trang ngoài nav; dạng stack có thêm Trang chủ', () => {
    path = '/sheet/x';
    render(withIntl(<PrimaryNav variant="stack" />));
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(document.querySelector('[aria-current]')).toBeNull();
  });
  it('Trang chủ active ở "/"', () => {
    path = '/';
    render(withIntl(<PrimaryNav variant="stack" />));
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
});
