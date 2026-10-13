import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicPlansResponse } from '@piano-daily/shared';
import { withIntl } from '@/components/layout/test-utils';
import { formatDate, formatPlanPrice } from '@/lib/plan-format';
import { PricingView, paywallReason } from './pricing-view';

const plan = (over: Record<string, unknown> = {}) => ({
  id: '0192a000-0000-7000-8000-0000000000a1',
  name: { vi: 'Gói tháng', en: 'Monthly' },
  description: { vi: 'Tải thoải mái', en: 'Download freely' },
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  ...over,
});
const data = (over: Partial<PublicPlansResponse> = {}): PublicPlansResponse => ({ subscriptionsEnabled: true, plans: [plan()], ...over });

describe('PricingView', () => {
  it('tiếng Việt: giá VND, thời hạn, không giới hạn; nút chọn gói bị vô hiệu kèm chú thích thanh toán sắp có', () => {
    render(withIntl(<PricingView data={data()} reason={null} />, 'vi'));
    const card = screen.getByRole('heading', { name: 'Gói tháng' }).closest('li')!;
    expect(card).toHaveTextContent(/99\.000\s*₫/);
    expect(card).toHaveTextContent('Thời hạn 30 ngày');
    expect(card).toHaveTextContent('Tải không giới hạn trong kỳ');
    const choose = within(card).getByRole('button', { name: 'Sắp có' });
    expect(choose).toBeDisabled();
    expect(choose).toHaveAccessibleDescription(/VietQR/);
  });

  it('tiếng Anh: giá USD, hạn mức; gói giá 0 hiện Free', () => {
    render(withIntl(<PricingView data={data({ plans: [plan({ downloadQuota: 20 }), plan({ id: 'b', name: { vi: 'Thử', en: 'Starter' }, priceVnd: 0, priceUsdCents: 0 })] })} reason={null} />, 'en'));
    expect(screen.getByRole('heading', { name: 'Monthly' }).closest('li')).toHaveTextContent('$4.99');
    expect(screen.getByRole('heading', { name: 'Monthly' }).closest('li')).toHaveTextContent('20 downloads per period');
    expect(screen.getByRole('heading', { name: 'Starter' }).closest('li')).toHaveTextContent('Free');
  });

  it.each([
    ['TRIAL_EXPIRED', /trial time or download allowance has run out/],
    ['PLAN_REQUIRED', /plan has expired/],
    ['QUOTA_EXCEEDED', /used all downloads of your plan/],
  ] as const)('lý do paywall %s hiện dòng giải thích', (reason, text) => {
    render(withIntl(<PricingView data={data()} reason={reason} />, 'en'));
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('chưa bật thuê bao hoặc chưa có gói: thông báo chưa mở, không có thẻ gói', () => {
    const { unmount } = render(withIntl(<PricingView data={data({ subscriptionsEnabled: false })} reason={null} />, 'en'));
    expect(screen.getByText(/not open yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coming soon' })).toBeNull();
    unmount();
    render(withIntl(<PricingView data={data({ plans: [] })} reason={null} />, 'vi'));
    expect(screen.getByText(/chưa được mở/)).toBeInTheDocument();
  });

  it('paywallReason chỉ nhận mã hợp lệ (chuỗi lạ/mảng/thiếu thì null)', () => {
    expect(paywallReason('TRIAL_EXPIRED')).toBe('TRIAL_EXPIRED');
    expect(paywallReason(['QUOTA_EXCEEDED', 'x'])).toBe('QUOTA_EXCEEDED');
    expect(paywallReason('<script>')).toBeNull();
    expect(paywallReason(undefined)).toBeNull();
  });
});

describe('plan-format', () => {
  it('định dạng giá theo ngôn ngữ và ngày theo UTC', () => {
    expect(formatPlanPrice({ priceVnd: 99000, priceUsdCents: 499 }, 'en')).toBe('$4.99');
    expect(formatPlanPrice({ priceVnd: 99000, priceUsdCents: 499 }, 'vi')).toMatch(/99\.000\s*₫/);
    expect(formatDate('2026-10-20T23:30:00.000Z', 'en')).toBe('Oct 20, 2026');
  });
});
