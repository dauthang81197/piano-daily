import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import DashboardPage from '@/app/(admin)/page';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const DATA = {
  range: { from: '2026-10-01', to: '2026-10-02', granularity: 'day' },
  totals: { revenueCents: 3505, orders: 3, downloads: 4, sheets: 2, views: 12 },
  levels: [
    { level: 'BEGINNER', sheets: 1, views: 7, downloads: 3 },
    { level: 'INTERMEDIATE', sheets: 0, views: 0, downloads: 0 },
    { level: 'ADVANCED', sheets: 0, views: 0, downloads: 0 },
    { level: 'EXPERT', sheets: 1, views: 5, downloads: 1 },
  ],
  series: [
    { period: '2026-10-01', revenueCents: 3505, orders: 3 },
    { period: '2026-10-02', revenueCents: 0, orders: 0 },
  ],
  topSold: [{ sheetId: 's1', title: 'Für Elise', orders: 3, revenueCents: 3505 }],
  topViewed: [{ sheetId: 's1', title: 'Für Elise', level: 'BEGINNER', viewCount: 7 }],
  recentSheets: [{ sheetId: 's1', title: 'Für Elise', level: 'BEGINNER', status: 'PUBLISHED', updatedAt: '2026-09-30T17:30:00.000Z' }],
};
const EMPTY = {
  ...DATA,
  totals: { revenueCents: 0, orders: 0, downloads: 0, sheets: 0, views: 0 },
  series: [{ period: '2026-10-01', revenueCents: 0, orders: 0 }],
  topSold: [],
  topViewed: [],
  recentSheets: [],
};

type Handler = (url: URL) => Response | undefined;
async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw) => handler(new URL(raw)) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}
const isDash = (url: URL) => url.pathname === '/admin/analytics/dashboard';
const dashCalls = (fetchMock: Awaited<ReturnType<typeof signIn>>) =>
  fetchMock.mock.calls.map(([input]) => new URL(String(input))).filter(isDash);

beforeEach(() => resetSessionForTests());

describe('Trang Dashboard', () => {
  it('hiện thẻ tổng quan, bảng theo Level, doanh thu USD từ cents và các bảng top', async () => {
    await signIn((url) => (isDash(url) ? jsonResponse(200, DATA) : undefined));
    render(<DashboardPage />);
    expect(await screen.findByTestId('stat-Doanh thu')).toHaveTextContent('$35.05');
    expect(screen.getByTestId('stat-Số đơn')).toHaveTextContent('3');
    const levels = screen.getByRole('table', { name: 'Thống kê theo Level' });
    expect(within(levels).getAllByRole('row')).toHaveLength(5);
    expect(within(levels).getByRole('row', { name: /Cơ bản/ })).toHaveTextContent('7');
    expect(screen.getByText(/không lọc theo khoảng/)).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Top Sheet bán chạy' })).getByText('Für Elise')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Top Sheet xem nhiều' })).getByText('Für Elise')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Sheet cập nhật gần đây' })).getByText('00:30 1/10/26')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Doanh thu theo kỳ' })).getByText('$0.00')).toBeInTheDocument();
  });

  it('đổi khoảng ngày và granularity thì gọi lại API với query tương ứng', async () => {
    const fetchMock = await signIn((url) => (isDash(url) ? jsonResponse(200, DATA) : undefined));
    render(<DashboardPage />);
    await screen.findByTestId('stat-Doanh thu');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Theo tháng' }));
    await waitFor(() => expect(dashCalls(fetchMock).at(-1)!.searchParams.get('granularity')).toBe('month'));
    const from = screen.getByLabelText('Từ ngày');
    await user.clear(from);
    await user.type(from, '2026-09-01');
    const to = screen.getByLabelText('Đến ngày');
    await user.clear(to);
    await user.type(to, '2026-09-30');
    await waitFor(() => {
      const last = dashCalls(fetchMock).at(-1)!;
      expect(last.searchParams.get('from')).toBe('2026-09-01');
      expect(last.searchParams.get('to')).toBe('2026-09-30');
    });
  });

  it('khoảng quá 366 ngày: báo lỗi, không gọi API với khoảng đó', async () => {
    const fetchMock = await signIn((url) => (isDash(url) ? jsonResponse(200, DATA) : undefined));
    render(<DashboardPage />);
    await screen.findByTestId('stat-Doanh thu');
    const from = screen.getByLabelText('Từ ngày');
    const user = userEvent.setup();
    await user.clear(from);
    await user.type(from, '2020-01-01');
    expect(await screen.findByText(/tối đa 366 ngày/)).toBeInTheDocument();
    expect(dashCalls(fetchMock).some((u) => u.searchParams.get('from') === '2020-01-01')).toBe(false);
  });

  it('không có dữ liệu: tổng 0 và bảng top báo rỗng', async () => {
    await signIn((url) => (isDash(url) ? jsonResponse(200, EMPTY) : undefined));
    render(<DashboardPage />);
    expect(await screen.findByTestId('stat-Doanh thu')).toHaveTextContent('$0.00');
    expect(within(screen.getByRole('table', { name: 'Top Sheet bán chạy' })).getByText('Chưa có dữ liệu.')).toBeInTheDocument();
  });

  it('lỗi tải: hiện thông báo lỗi', async () => {
    await signIn((url) => (isDash(url) ? jsonResponse(500, errorBody('INTERNAL_ERROR')) : undefined));
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
