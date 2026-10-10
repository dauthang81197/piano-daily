import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from '@/app/(admin)/orders/page';
import { formatReportDateTime, formatUsd } from '@/lib/format';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { OrderDetail } from './order-detail';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/orders' }));

const ID = '01920000-0000-7000-8000-0000000000f1';
const ROW = {
  id: ID,
  orderCode: 'PD-7K3M9Q',
  email: 'nguyen@example.com',
  sheet: { id: 's1', title: 'Für Elise' },
  fileTypes: ['PDF', 'MIDI'],
  amountCents: 798,
  currency: 'USD',
  status: 'PAID',
  reviewRequired: false,
  createdAt: '2026-09-30T17:30:00.000Z', // 00:30 ngày 01/10 giờ Việt Nam
};
const FLAGGED = { ...ROW, id: '01920000-0000-7000-8000-0000000000f2', orderCode: 'PD-AAAAAA', reviewRequired: true };
const DETAIL = {
  ...ROW,
  items: [
    { fileType: 'PDF', priceCents: 499 },
    { fileType: 'MIDI', priceCents: 299 },
  ],
  paypalOrderId: 'PP-1',
  paypalCaptureId: 'CAP-1',
  payerEmail: 'payer@example.com',
  payerName: 'Nguyen Van A',
  paidAt: '2026-09-30T17:31:00.000Z',
  refundedAt: null,
  emailSentAt: '2026-09-30T17:32:00.000Z',
  token: { status: 'ACTIVE', expiresAt: '2026-10-30T00:00:00.000Z', usedDownloads: 2, maxDownloads: 5, revokedAt: null },
  downloads: [{ id: 'l1', fileType: 'PDF', ua: 'Mozilla/5.0 TestUA', createdAt: '2026-10-01T03:00:00.000Z' }],
};

const page = <T,>(items: T[], total = items.length) => ({ items, page: 1, pageSize: 20, total });

type Handler = (url: URL) => Response | undefined;

async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw) => handler(new URL(raw)) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}

const listCalls = (fetchMock: Awaited<ReturnType<typeof signIn>>) =>
  fetchMock.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname === '/admin/orders');

beforeEach(() => {
  resetSessionForTests();
  router.push.mockReset();
});

describe('formatter', () => {
  it('ngày theo REPORT_TZ và tiền từ cent', () => {
    expect(formatReportDateTime('2026-09-30T17:30:00.000Z')).toBe('00:30 1/10/26');
    expect(formatReportDateTime(null)).toBe('—');
    expect(formatUsd(798)).toBe('$7.98');
    expect(formatUsd(5)).toBe('$0.05');
  });
});

describe('Trang /orders — bảng', () => {
  it('hiện mã đơn, email, Sheet, file, USD, trạng thái, ngày; click hàng mở chi tiết', async () => {
    await signIn((url) => (url.pathname === '/admin/orders' ? jsonResponse(200, page([ROW])) : undefined));
    render(<OrdersPage />);
    const row = await screen.findByRole('row', { name: 'Xem đơn PD-7K3M9Q' });
    expect(row).toHaveTextContent('nguyen@example.com');
    expect(row).toHaveTextContent('Für Elise');
    expect(row).toHaveTextContent('PDF, MIDI');
    expect(row).toHaveTextContent('$7.98');
    expect(row).toHaveTextContent('Đã thanh toán');
    expect(row).toHaveTextContent(formatReportDateTime(ROW.createdAt));
    expect(row).toHaveTextContent('00:30 1/10/26');
    await userEvent.setup().click(row);
    expect(router.push).toHaveBeenCalledWith(`/orders/${ID}`);
  });

  it('đơn review_required nổi bật, đơn thường thì không', async () => {
    await signIn((url) => (url.pathname === '/admin/orders' ? jsonResponse(200, page([ROW, FLAGGED])) : undefined));
    render(<OrdersPage />);
    const flagged = await screen.findByRole('row', { name: 'Xem đơn PD-AAAAAA' });
    expect(within(flagged).getByText('Cần xem xét')).toBeInTheDocument();
    expect(flagged).toHaveAttribute('data-review-required', 'true');
    expect(within(screen.getByRole('row', { name: 'Xem đơn PD-7K3M9Q' })).queryByText('Cần xem xét')).toBeNull();
  });

  it('lọc gửi đúng query: trạng thái, xem xét, khoảng ngày, email (debounce)', async () => {
    const fetchMock = await signIn((url) => (url.pathname === '/admin/orders' ? jsonResponse(200, page([ROW])) : undefined));
    render(<OrdersPage />);
    await screen.findByRole('row', { name: /PD-7K3M9Q/ });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Trạng thái'));
    await user.click(await screen.findByRole('option', { name: 'Đã thanh toán' }));
    await user.click(screen.getByLabelText('Xem xét'));
    await user.click(await screen.findByRole('option', { name: 'Cần xem xét' }));
    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-01');
    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-01');
    await user.type(screen.getByLabelText('Tìm đơn theo email'), 'nguy');

    await waitFor(() => {
      const last = listCalls(fetchMock).at(-1)!;
      expect(last.searchParams.get('status')).toBe('PAID');
      expect(last.searchParams.get('reviewRequired')).toBe('true');
      expect(last.searchParams.get('from')).toBe('2026-10-01');
      expect(last.searchParams.get('to')).toBe('2026-10-01');
      expect(last.searchParams.get('email')).toBe('nguy');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });

  it('khoảng ngày sai thì báo lỗi và không gọi API với khoảng đó', async () => {
    const fetchMock = await signIn((url) => (url.pathname === '/admin/orders' ? jsonResponse(200, page([ROW])) : undefined));
    render(<OrdersPage />);
    await screen.findByRole('row', { name: /PD-7K3M9Q/ });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-05');
    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    expect(listCalls(fetchMock).some((url) => url.searchParams.get('from') === '2026-10-05' && url.searchParams.get('to') === '2026-10-01')).toBe(false);
  });

  it('phân trang và trạng thái rỗng', async () => {
    const fetchMock = await signIn((url) => {
      if (url.pathname !== '/admin/orders') return undefined;
      return jsonResponse(200, url.searchParams.get('page') === '2' ? { ...page([FLAGGED], 21), page: 2 } : page([ROW], 21));
    });
    render(<OrdersPage />);
    await screen.findByRole('row', { name: /PD-7K3M9Q/ });
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByRole('row', { name: /PD-AAAAAA/ })).toBeInTheDocument();
    expect(listCalls(fetchMock).at(-1)?.searchParams.get('page')).toBe('2');
  });

  it('hiện lỗi tải', async () => {
    await signIn((url) => (url.pathname === '/admin/orders' ? jsonResponse(500, errorBody('INTERNAL_ERROR')) : undefined));
    render(<OrdersPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Trang /orders/[id] — chi tiết', () => {
  it('đủ items, PayPal, mốc thời gian, token, lịch sử tải; không có token bí mật hay IP', async () => {
    await signIn((url) => (url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, DETAIL) : undefined));
    const { container } = render(<OrderDetail id={ID} />);
    expect(await screen.findByRole('heading', { name: 'Đơn PD-7K3M9Q' })).toBeInTheDocument();
    const items = screen.getByRole('table', { name: 'File đã mua' });
    expect(items).toHaveTextContent('$4.99');
    expect(items).toHaveTextContent('$2.99');
    expect(screen.getByText('PP-1')).toBeInTheDocument();
    expect(screen.getByText('CAP-1')).toBeInTheDocument();
    expect(screen.getByText('payer@example.com')).toBeInTheDocument();
    expect(screen.getByText('Còn hiệu lực')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('Chưa vô hiệu')).toBeInTheDocument();
    expect(screen.getByText(formatReportDateTime(DETAIL.paidAt))).toBeInTheDocument();
    expect(screen.getByText(formatReportDateTime(DETAIL.emailSentAt))).toBeInTheDocument();
    const logs = screen.getByRole('table', { name: 'Lịch sử tải' });
    expect(logs).toHaveTextContent('Mozilla/5.0 TestUA');
    expect(logs).toHaveTextContent(formatReportDateTime('2026-10-01T03:00:00.000Z'));
    expect(container.textContent).not.toMatch(/ipHash/i);
    expect(screen.queryByText('Cần xem xét')).toBeNull();
  });

  it('đơn PENDING chưa có token; đơn review_required nổi bật', async () => {
    await signIn((url) =>
      url.pathname === `/admin/orders/${ID}`
        ? jsonResponse(200, { ...DETAIL, status: 'PENDING', reviewRequired: true, token: null, downloads: [], paidAt: null, emailSentAt: null })
        : undefined,
    );
    render(<OrderDetail id={ID} />);
    expect(await screen.findByText('Đơn chưa có link tải.')).toBeInTheDocument();
    expect(screen.getByText('Chưa có lượt tải nào.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cần xem xét');
  });

  it('đơn không tồn tại hiện lỗi', async () => {
    await signIn(() => undefined);
    render(<OrderDetail id={ID} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('đơn đã hoàn tiền: token đã vô hiệu, hiện mốc hoàn tiền và vô hiệu', async () => {
    const refunded = {
      ...DETAIL,
      status: 'REFUNDED',
      refundedAt: '2026-10-03T02:00:00.000Z',
      token: { ...DETAIL.token, status: 'REVOKED', revokedAt: '2026-10-03T02:07:00.000Z' },
    };
    await signIn((url) => (url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, refunded) : undefined));
    render(<OrderDetail id={ID} />);
    expect(await screen.findByText('Đã vô hiệu')).toBeInTheDocument();
    expect(screen.getByText(formatReportDateTime('2026-10-03T02:00:00.000Z'))).toBeInTheDocument();
    expect(screen.getByText(formatReportDateTime('2026-10-03T02:07:00.000Z'))).toBeInTheDocument();
  });
});

describe('Trang /orders/[id] — gửi lại email và gia hạn (Story 4.2)', () => {
  const postsTo = (fetchMock: Awaited<ReturnType<typeof signIn>>, suffix: string) =>
    fetchMock.mock.calls.filter(([input, init]) => new URL(String(input)).pathname === `/admin/orders/${ID}/${suffix}` && (init as RequestInit)?.method === 'POST');

  it('gửi lại email: gọi API, cập nhật ngay "Gửi email lúc"', async () => {
    const refreshed = { ...DETAIL, emailSentAt: '2026-10-09T05:00:00.000Z' };
    const fetchMock = await signIn((url) => {
      if (url.pathname === `/admin/orders/${ID}/resend-email`) return jsonResponse(200, refreshed);
      return url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, DETAIL) : undefined;
    });
    render(<OrderDetail id={ID} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Gửi lại email' }));
    expect(await screen.findByText(formatReportDateTime(refreshed.emailSentAt))).toBeInTheDocument();
    expect(postsTo(fetchMock, 'resend-email')).toHaveLength(1);
  });

  it('gửi lại email lỗi: FormError nêu lý do cụ thể từ API', async () => {
    await signIn((url) => {
      if (url.pathname === `/admin/orders/${ID}/resend-email`)
        return jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ email chưa được cấu hình nên chưa gửi được email.' } });
      return url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, DETAIL) : undefined;
    });
    render(<OrderDetail id={ID} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Gửi lại email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dịch vụ email chưa được cấu hình nên chưa gửi được email.');
  });

  it('gia hạn: nút brass, gửi đúng body, cập nhật ngay thẻ token', async () => {
    const refreshed = { ...DETAIL, token: { ...DETAIL.token, maxDownloads: 8, expiresAt: '2026-11-30T00:00:00.000Z' } };
    const fetchMock = await signIn((url) => {
      if (url.pathname === `/admin/orders/${ID}/extend-token`) return jsonResponse(200, refreshed);
      return url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, DETAIL) : undefined;
    });
    render(<OrderDetail id={ID} />);
    const button = await screen.findByRole('button', { name: 'Gia hạn' });
    expect(button.className).toContain('bg-secondary');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Thêm ngày'), '30');
    await user.type(screen.getByLabelText('Thêm lượt tải'), '3');
    await user.click(button);
    expect(await screen.findByText('2 / 8')).toBeInTheDocument();
    expect(screen.getByText(formatReportDateTime(refreshed.token.expiresAt))).toBeInTheDocument();
    const init = postsTo(fetchMock, 'extend-token')[0]![1];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ addDays: 30, addDownloads: 3 });
  });

  it('gia hạn với ô trống hoặc số sai: báo lỗi và không gọi API', async () => {
    const fetchMock = await signIn((url) => (url.pathname === `/admin/orders/${ID}` ? jsonResponse(200, DETAIL) : undefined));
    render(<OrderDetail id={ID} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gia hạn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập số ngày hoặc số lượt cần thêm.');
    await user.type(screen.getByLabelText('Thêm ngày'), '0');
    await user.click(screen.getByRole('button', { name: 'Gia hạn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Số ngày phải là số nguyên từ 1 đến 3650.');
    expect(postsTo(fetchMock, 'extend-token')).toHaveLength(0);
  });

  it('đơn REFUNDED: hai nút bị vô hiệu kèm lý do', async () => {
    await signIn((url) =>
      url.pathname === `/admin/orders/${ID}`
        ? jsonResponse(200, { ...DETAIL, status: 'REFUNDED', token: { ...DETAIL.token, status: 'REVOKED', revokedAt: '2026-10-03T02:07:00.000Z' } })
        : undefined,
    );
    render(<OrderDetail id={ID} />);
    expect(await screen.findByRole('button', { name: 'Gửi lại email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gia hạn' })).toBeDisabled();
    expect(screen.getByText(/Chỉ đơn đã thanh toán/)).toBeInTheDocument();
  });
});

