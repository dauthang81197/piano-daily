import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { MobileMenu } from './mobile-menu';

describe('MobileMenu', () => {
  it('thu gọn mặc định; nút mở có aria-expanded; Esc đóng', async () => {
    render(withIntl(<MobileMenu />));
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Beginner' })).toHaveAttribute('href', '/level/beginner');

    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
