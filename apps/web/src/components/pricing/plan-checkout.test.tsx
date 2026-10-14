import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('@/lib/navigate', () => ({ navigateTo: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

type Actions = { resolve: () => Promise<void>; reject: () => Promise<void> };
type ButtonProps = {
  onClick: (data: object, actions: Actions) => Promise<void>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => void;
  onError: (err: unknown) => void;
};
let latest: ButtonProps;
vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  PayPalButtons: (props: ButtonProps) => {
    latest = props;
    return (
      <button type="button" data-testid="paypal">
        PayPal
      </button>
    );
  },
}));

import { AuthProvider } from '@/components/auth/auth-provider';
import { HeaderAuth } from '@/components/auth/header-auth';
import { PlanChooseButton } from './plan-checkout';

const PLAN = {
  id: '0192a000-0000-7000-8000-0000000000a1',
  name: { vi: 'Gói tháng', en: 'Monthly' },
  description: { vi: '', en: '' },
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
};
const USER = { id: '01920000-0000-7000-8000-000000000001', email: 'khach@example.com', name: 'Khách', emailVerified: true };
const SESSION = { accessToken: 'access-1', expiresIn: 900, user: USER };
const ENTITLED = {
  subscriptionsEnabled: true,
  canDownload: true,
  trial: { active: false, endsAt: null, downloadsLeft: 0, downloadsMax: 2 },
  subscription: { planId: PLAN.id, planName: PLAN.name, endsAt: '2026-11-14T00:00:00.000Z', downloadsLeft: null },
};

type Reply = { status?: number; body?: unknown };
function stubApi(routes: Record<string, Reply | (() => Reply)>) {
  const calls: { key: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${String(url).replace('http://api.test', '')}`;
      calls.push({ key, init });
      const entry = routes[key];
      const reply = typeof entry === 'function' ? entry() : (entry ?? { status: 500, body: {} });
      const status = reply.status ?? 200;
      return { ok: status < 400, status, json: async () => reply.body };
    }),
  );
  return calls;
}
const error = (status: number, code: string) => ({ status, body: { error: { code, message: code } } });
const ANON = { 'POST /customer/auth/refresh': error(401, 'UNAUTHORIZED') };

const ui = () =>
  render(
    withIntl(
      <AuthProvider>
        <HeaderAuth />
        <PlanChooseButton plan={PLAN} />
      </AuthProvider>,
    ),
  );

/** Chạy luồng nút PayPal như SDK: onClick → createOrder → onApprove. */
async function approve(orderId = 'PP-1') {
  await latest.onClick({}, { resolve: async () => undefined, reject: async () => undefined });
  const created = await latest.createOrder().catch(() => null);
  if (created) await latest.onApprove({ orderID: orderId });
}

describe('Mua gói bằng PayPal (web)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'sb-client');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('chưa cấu hình PayPal: nút vô hiệu và ghi "Sắp có"', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', '');
    stubApi(ANON);
    ui();
    expect(await screen.findByRole('button', { name: 'Coming soon' })).toBeDisabled();
  });

  it('chưa đăng nhập: mở modal đăng nhập; đăng nhập xong tự mở modal thanh toán đúng gói', async () => {
    stubApi({ ...ANON, 'POST /customer/auth/login': { body: SESSION }, 'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } } });
    ui();
    await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    const login = await screen.findByRole('dialog');
    expect(within(login).getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    fireEvent.change(within(login).getByLabelText('Email'), { target: { value: 'khach@example.com' } });
    fireEvent.change(within(login).getByLabelText('Password'), { target: { value: 'mat-khau-123' } });
    fireEvent.click(within(login).getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Buy Monthly' })).toBeInTheDocument();
    expect(screen.getByTestId('paypal')).toBeInTheDocument();
  });

  it('đã đăng nhập: thanh toán thành công gửi planId + Bearer, capture, cập nhật header và hiện thành công', async () => {
    const calls = stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/paypal/create-order': { status: 201, body: { paymentCode: 'PS-ABC234', paypalOrderId: 'PP-1' } },
      'POST /customer/subscriptions/paypal/capture-order': { body: ENTITLED },
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    await screen.findByRole('heading', { name: 'Buy Monthly' });
    await approve();
    expect(await screen.findByText(/Payment successful/)).toBeInTheDocument();
    const create = calls.find((c) => c.key.endsWith('/create-order'))!;
    expect(JSON.parse(create.init.body as string)).toEqual({ planId: PLAN.id });
    expect((create.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(JSON.parse(calls.find((c) => c.key.endsWith('/capture-order'))!.init.body as string)).toEqual({ paypalOrderId: 'PP-1' });
    await waitFor(() => expect(screen.getByTestId('entitlement')).toHaveTextContent('Monthly · until Nov 14, 2026'));
  });

  it.each([
    ['PAYMENTS_DISABLED', 403, /temporarily unavailable/],
    ['TOO_MANY_REQUESTS', 429, /Too many attempts/],
    ['EMAIL_NOT_VERIFIED', 403, /verify your email/],
  ])('tạo đơn lỗi %s: hiện thông báo rõ, không báo thành công', async (code, status, text) => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/paypal/create-order': error(status, code),
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    await screen.findByRole('heading', { name: 'Buy Monthly' });
    await approve();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(/Payment successful/)).toBeNull();
  });

  it('bị từ chối (402) hiện thông báo từ chối; lỗi capture khác báo "đừng thanh toán lại"', async () => {
    let capture: Reply = error(402, 'PAYMENT_DECLINED');
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/paypal/create-order': { status: 201, body: { paymentCode: 'PS-ABC234', paypalOrderId: 'PP-1' } },
      'POST /customer/subscriptions/paypal/capture-order': () => capture,
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    await screen.findByRole('heading', { name: 'Buy Monthly' });
    await approve();
    expect(await screen.findByRole('alert')).toHaveTextContent(/payment was declined/);
    capture = error(503, 'SERVICE_UNAVAILABLE');
    await approve();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/do not pay again/));
  });

  it('không xác nhận được capture: khoá nút PayPal để không tạo và trả tiền đơn thứ hai', async () => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/paypal/create-order': { status: 201, body: { paymentCode: 'PS-ABC234', paypalOrderId: 'PP-1' } },
      'POST /customer/subscriptions/paypal/capture-order': error(503, 'SERVICE_UNAVAILABLE'),
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    await screen.findByRole('heading', { name: 'Buy Monthly' });
    expect(screen.getByTestId('paypal')).toBeInTheDocument();
    await approve();
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not pay again/);
    expect(screen.queryByTestId('paypal')).toBeNull();
  });

  it('gói không có giá USD: nút Chọn gói bị vô hiệu', async () => {
    stubApi(ANON);
    render(
      withIntl(
        <AuthProvider>
          <PlanChooseButton plan={{ ...PLAN, priceUsdCents: 0 }} />
        </AuthProvider>,
      ),
    );
    expect(await screen.findByRole('button', { name: 'Choose plan' })).toBeDisabled();
  });

  it('đóng PayPal giữa chừng: báo chưa bị trừ tiền; Esc đóng modal khi không xử lý', async () => {
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, 'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } } });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    await screen.findByRole('heading', { name: 'Buy Monthly' });
    await latest.onClick({}, { resolve: async () => undefined, reject: async () => undefined });
    latest.onCancel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/not been charged/);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('tiếng Việt: giá VND, ghi rõ PayPal tính bằng USD, VietQR chưa mở (vô hiệu)', async () => {
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, 'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } } });
    render(
      withIntl(
        <AuthProvider>
          <PlanChooseButton plan={PLAN} />
        </AuthProvider>,
        'vi',
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chọn gói' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Chọn gói' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/99\.000\s*₫/);
    expect(dialog).toHaveTextContent('PayPal thu tiền bằng USD: $4.99');
    expect(within(dialog).getByLabelText('Chuyển khoản VietQR (sắp có)')).toBeDisabled();
  });
});

describe('Mua gói bằng VietQR (web)', () => {
  const INFO = {
    paymentCode: 'PS-ABC234',
    transferContent: 'PSABC234',
    amount: 99000,
    currency: 'VND',
    qrUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=Vietcombank&amount=99000&des=PSABC234',
    bankAccount: '0123456789',
    bankName: 'Vietcombank',
    accountHolder: 'NGUYEN VAN A',
  };
  const PAID = { status: 'PAID', entitlement: ENTITLED };

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'sb-client');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const uiVi = (vietqrEnabled: boolean) =>
    render(
      withIntl(
        <AuthProvider>
          <HeaderAuth />
          <PlanChooseButton plan={PLAN} vietqrEnabled={vietqrEnabled} />
        </AuthProvider>,
        'vi',
      ),
    );
  const openModal = async () => {
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Chọn gói' }));
    return screen.findByRole('dialog');
  };

  it('chưa cấu hình VietQR: lựa chọn bị vô hiệu ghi "sắp có"', async () => {
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, 'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } } });
    uiVi(false);
    const dialog = await openModal();
    expect(within(dialog).getByLabelText('Chuyển khoản VietQR (sắp có)')).toBeDisabled();
  });

  it('khách tiếng Anh không thấy lựa chọn VietQR dù đã cấu hình', async () => {
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, 'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } } });
    render(
      withIntl(
        <AuthProvider>
          <PlanChooseButton plan={PLAN} vietqrEnabled />
        </AuthProvider>,
      ),
    );
    await screen.findByRole('button', { name: 'Choose plan' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose plan' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/VietQR/)).toBeNull();
  });

  it('chọn VietQR: gọi create với planId + Bearer, hiện QR, số tiền VND, tài khoản và nội dung; ẩn nút PayPal', async () => {
    const calls = stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': { status: 201, body: INFO },
      'GET /customer/subscriptions/payments/PS-ABC234': { body: { status: 'PENDING', entitlement: null } },
    });
    uiVi(true);
    const dialog = await openModal();
    expect(within(dialog).getByTestId('paypal')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    expect(await within(dialog).findByAltText('Mã QR chuyển khoản')).toHaveAttribute('src', INFO.qrUrl);
    expect(dialog).toHaveTextContent('Vietcombank');
    expect(dialog).toHaveTextContent('0123456789');
    expect(dialog).toHaveTextContent('NGUYEN VAN A');
    expect(dialog).toHaveTextContent(/99\.000\s*₫/);
    expect(dialog).toHaveTextContent('PSABC234');
    expect(within(dialog).queryByTestId('paypal')).toBeNull();
    expect(within(dialog).queryByText(/PayPal thu tiền bằng USD/)).toBeNull();
    const create = calls.find((c) => c.key.endsWith('/vietqr/create'))!;
    expect(JSON.parse(create.init.body as string)).toEqual({ planId: PLAN.id });
    expect((create.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('polling: khi server báo PAID thì hiện thành công và cập nhật header', async () => {
    let paid = false;
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': { status: 201, body: INFO },
      'GET /customer/subscriptions/payments/PS-ABC234': () => ({ body: paid ? PAID : { status: 'PENDING', entitlement: null } }),
    });
    uiVi(true);
    const dialog = await openModal();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    await within(dialog).findByAltText('Mã QR chuyển khoản');
    expect(dialog).toHaveTextContent('Đang chờ nhận tiền');
    paid = true;
    expect(await screen.findByText(/Thanh toán thành công/, undefined, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('entitlement')).toHaveTextContent('Gói tháng'));
  }, 15000);

  it('lỗi 503 (SePay chưa cấu hình ở server): hiện thông báo dùng PayPal; có nút thử lại khi lỗi mạng', async () => {
    let reply: Reply = error(503, 'SERVICE_UNAVAILABLE');
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': () => reply,
    });
    uiVi(true);
    const dialog = await openModal();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('VietQR chưa khả dụng');
    // Quay lại PayPal vẫn dùng được.
    fireEvent.click(within(dialog).getByLabelText(/^PayPal/));
    expect(await within(dialog).findByTestId('paypal')).toBeInTheDocument();
    reply = { status: 201, body: INFO };
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    expect(await within(dialog).findByAltText('Mã QR chuyển khoản')).toBeInTheDocument();
  });

  it('hết thời gian chờ: gợi ý liên hệ kèm mã thanh toán, không báo thành công', async () => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': { status: 201, body: INFO },
      'GET /customer/subscriptions/payments/PS-ABC234': { body: { status: 'PENDING', entitlement: null } },
    });
    uiVi(true);
    const dialog = await openModal();
    const now = Date.now();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    await within(dialog).findByAltText('Mã QR chuyển khoản');
    vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000);
    expect(await screen.findByText(/Chưa thấy tiền về sau 15 phút/, undefined, { timeout: 8000 })).toHaveTextContent('PS-ABC234');
    expect(screen.queryByText(/Thanh toán thành công/)).toBeNull();
    vi.restoreAllMocks();
  }, 15000);

  it('sau hết thời gian chờ vẫn tiếp tục hỏi: tiền về muộn thì vẫn báo thành công', async () => {
    let paid = false;
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': { status: 201, body: INFO },
      'GET /customer/subscriptions/payments/PS-ABC234': () => ({ body: paid ? PAID : { status: 'PENDING', entitlement: null } }),
    });
    uiVi(true);
    const dialog = await openModal();
    const now = Date.now();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    await within(dialog).findByAltText('Mã QR chuyển khoản');
    vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000);
    expect(await screen.findByText(/Chưa thấy tiền về sau 15 phút/, undefined, { timeout: 8000 })).toBeInTheDocument();
    paid = true;
    expect(await screen.findByText(/Thanh toán thành công/, undefined, { timeout: 30000 })).toBeInTheDocument();
  }, 45000);

  it('thanh toán đã hoàn tiền/huỷ: dừng hỏi và báo rõ, không báo thành công', async () => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': { body: { ...ENTITLED, subscription: null } },
      'POST /customer/subscriptions/vietqr/create': { status: 201, body: INFO },
      'GET /customer/subscriptions/payments/PS-ABC234': { body: { status: 'REFUNDED', entitlement: null } },
    });
    uiVi(true);
    const dialog = await openModal();
    fireEvent.click(within(dialog).getByLabelText('Chuyển khoản VietQR (ngân hàng trong nước)'));
    await within(dialog).findByAltText('Mã QR chuyển khoản');
    expect(await screen.findByText(/đã được hoàn tiền hoặc huỷ/, undefined, { timeout: 8000 })).toHaveTextContent('PS-ABC234');
    expect(screen.queryByText(/Thanh toán thành công/)).toBeNull();
  }, 15000);
});
