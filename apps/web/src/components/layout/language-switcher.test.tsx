import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from './test-utils';

const replace = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/level/beginner',
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replace.mockClear();
    document.cookie = 'NEXT_LOCALE=; max-age=0; path=/';
  });

  it('ở /en đổi sang vi, giữ nguyên path và ghi cookie NEXT_LOCALE', async () => {
    const setter = vi.spyOn(document, 'cookie', 'set');
    render(withIntl(<LanguageSwitcher />, 'en'));
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Việt/ }));
    expect(replace).toHaveBeenCalledWith('/level/beginner', { locale: 'vi' });
    const written = setter.mock.calls.map((c) => c[0]).join('\n');
    expect(written).toContain('NEXT_LOCALE=vi');
    expect(written).toContain('max-age=31536000');
  });

  it('giữ nguyên query string khi đổi ngôn ngữ', async () => {
    window.history.pushState({}, '', '/en/search?q=bach');
    render(withIntl(<LanguageSwitcher />, 'en'));
    await userEvent.click(screen.getByRole('button'));
    expect(replace).toHaveBeenCalledWith('/level/beginner?q=bach', { locale: 'vi' });
    window.history.pushState({}, '', '/');
  });

  it('ở /vi đổi sang en', async () => {
    render(withIntl(<LanguageSwitcher />, 'vi'));
    await userEvent.click(screen.getByRole('button'));
    expect(replace).toHaveBeenCalledWith('/level/beginner', { locale: 'en' });
  });
});
