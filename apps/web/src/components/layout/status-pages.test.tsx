import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from './test-utils';
import { SkipLink } from './skip-link';
import { Footer } from './footer';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

import ErrorPage from '@/app/[locale]/error';
import NotFound from '@/app/[locale]/not-found';

describe('SkipLink', () => {
  it('là link tới #main-content', () => {
    render(withIntl(<SkipLink />, 'vi'));
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung' })).toHaveAttribute('href', '#main-content');
  });
});

describe('Trang trạng thái', () => {
  it('404: tiêu đề h1 và nút về trang chủ', () => {
    render(withIntl(<NotFound />, 'vi'));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /trang chủ/i })).toBeInTheDocument();
  });

  it('lỗi: ghi log, có nút Thử lại gọi retry và link về trang chủ', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const retry = vi.fn();
    const error = new Error('boom');
    render(withIntl(<ErrorPage error={error} retry={retry} />, 'vi'));
    expect(log).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toBeInTheDocument();
  });
});

describe('Footer: nhãn cột theo cờ thanh toán', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('thanh toán ẩn: "Learn"; bật: "Learn & plans"-kiểu nhãn gốc', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '');
    const { unmount } = render(withIntl(<Footer />, 'en'));
    expect(screen.getByRole('heading', { name: 'Learn' })).toBeInTheDocument();
    unmount();
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', 'true');
    render(withIntl(<Footer />, 'en'));
    expect(screen.queryByRole('heading', { name: 'Learn' })).toBeNull();
  });
});
