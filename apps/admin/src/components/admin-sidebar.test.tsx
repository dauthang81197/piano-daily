import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminSidebar, isNavItemActive } from './admin-sidebar';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

describe('AdminSidebar', () => {
  it('hiển thị đủ 6 mục theo thứ tự, đánh dấu mục đang mở', () => {
    pathname = '/sheets';
    render(<AdminSidebar />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng quản trị' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Dashboard', '/'],
      ['Sheet', '/sheets'],
      ['Composer/Genre/Series', '/taxonomy'],
      ['Quảng cáo', '/ads'],
      ['Đơn hàng', '/orders'],
      ['Cài đặt', '/settings'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Sheet' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('Dashboard chỉ active ở đúng "/", mục khác active cả route con', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/', '/sheets')).toBe(false);
    expect(isNavItemActive('/sheets', '/sheets/123')).toBe(true);
    expect(isNavItemActive('/sheets', '/sheets-archive')).toBe(false);
  });
});
