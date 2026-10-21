import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const { auth } = vi.hoisted(() => ({ auth: { value: null as unknown } }));
vi.mock('./auth-provider', () => ({ useCustomer: () => auth.value }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HeaderAuth } from './header-auth';

beforeEach(() => {
  auth.value = null;
});

describe('HeaderAuth: link "Bản nhạc của tôi"', () => {
  it('đã đăng nhập: có link tới /my-sheets cạnh tên và nút đăng xuất', () => {
    auth.value = { status: 'authenticated', customer: { id: 'c', name: 'Khách A', email: 'a@x.co' }, entitlement: null, openAuth: vi.fn(), logout: vi.fn() };
    render(withIntl(<HeaderAuth />, 'vi'));
    expect(screen.getByRole('link', { name: 'Bản nhạc của tôi' })).toHaveAttribute('href', '/my-sheets');
    expect(screen.getByText('Khách A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('chưa đăng nhập: chỉ có nút Đăng nhập, không có link', () => {
    auth.value = { status: 'anonymous', customer: null, openAuth: vi.fn() };
    render(withIntl(<HeaderAuth />, 'vi'));
    expect(screen.queryByRole('link', { name: 'Bản nhạc của tôi' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
