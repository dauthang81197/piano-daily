import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const push = vi.hoisted(() => vi.fn());
vi.mock('@/lib/navigate', () => ({ navigateTo: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { navigateTo } from '@/lib/navigate';
import { DownloadButtons } from '@/components/sheet/download-buttons';
import { AuthProvider } from './auth-provider';
import { HeaderAuth } from './header-auth';
import { ResetPasswordView } from './reset-password-view';
import { VerifyEmailView } from './verify-email-view';

const USER = { id: '01920000-0000-7000-8000-000000000001', email: 'khach@example.com', name: 'Khách', emailVerified: true };
const SESSION = { accessToken: 'access-1', expiresIn: 900, user: USER };
const SHEET = '01920000-0000-7000-8000-0000000000aa';

type Reply = { status?: number; body?: unknown };
/** Fetch giả theo `METHOD path`; request chưa khai báo trả 500 để lộ ra ngay. */
function stubApi(routes: Record<string, Reply | (() => Reply)>) {
  const calls: { key: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(url).replace('http://api.test', '')}`;
    calls.push({ key, init });
    const entry = routes[key];
    const reply = typeof entry === 'function' ? entry() : (entry ?? { status: 500, body: {} });
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
const error = (status: number, code: string) => ({ status, body: { error: { code, message: code } } });
const ANON = { 'POST /customer/auth/refresh': error(401, 'UNAUTHORIZED') };

const ui = (extra = <></>) =>
  render(
    withIntl(
      <AuthProvider>
        <HeaderAuth />
        <DownloadButtons sheetId={SHEET} title="Für Elise" types={['PDF', 'MIDI']} />
        {extra}
      </AuthProvider>,
    ),
  );

describe('Tài khoản khách (web)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.mocked(navigateTo).mockReset();
    push.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('chưa đăng nhập: bấm Tải mở modal đăng nhập, không gọi API tải, không điều hướng', async () => {
    const { calls } = stubApi(ANON);
    ui();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(calls.some((c) => c.key.includes('/customer/downloads/'))).toBe(false);
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('đã đăng nhập (khôi phục từ cookie refresh): Tải gọi POST kèm Bearer rồi điều hướng tới signed URL', async () => {
    const { calls } = stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      [`POST /customer/downloads/${SHEET}/pdf`]: { body: { url: 'https://r2.example/file.pdf?sig=1' } },
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('https://r2.example/file.pdf?sig=1'));
    const download = calls.find((c) => c.key.includes('/customer/downloads/'))!;
    expect((download.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(download.init.credentials).toBe('include');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tải trả 403 EMAIL_NOT_VERIFIED: mở modal xác minh email; lỗi khác hiện thông báo, không điều hướng', async () => {
    let reply: Reply = error(403, 'EMAIL_NOT_VERIFIED');
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, [`POST /customer/downloads/${SHEET}/pdf`]: () => reply });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByRole('heading', { name: 'Verify email' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    reply = error(500, 'INTERNAL_ERROR');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the file');
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('tải trả 401 (phiên hết hạn): mở modal đăng nhập, về trạng thái chưa đăng nhập, không báo lỗi tải', async () => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      [`POST /customer/downloads/${SHEET}/pdf`]: error(401, 'UNAUTHORIZED'),
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Log in' }).length).toBeGreaterThan(0);
  });

  it('bấm Tải khi chưa đăng nhập: đăng nhập xong tự tải tiếp file đó, không phải bấm lại', async () => {
    stubApi({
      ...ANON,
      'POST /customer/auth/login': { body: SESSION },
      [`POST /customer/downloads/${SHEET}/midi`]: { body: { url: 'https://r2.example/file.mid?sig=1' } },
    });
    ui();
    await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(screen.getByRole('button', { name: /Download MIDI/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'khach@example.com' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'mat-khau-123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('https://r2.example/file.mid?sig=1'));
  });

  it('đóng modal thì bỏ lượt tải đang chờ (đăng nhập sau đó không tự tải)', async () => {
    const { calls } = stubApi({ ...ANON, 'POST /customer/auth/login': { body: SESSION } });
    ui();
    await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' })[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'khach@example.com' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'mat-khau-123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    await screen.findByText('Khách');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.key.includes('/customer/downloads/'))).toBe(false);
  });

  it.each(['TRIAL_EXPIRED', 'PLAN_REQUIRED', 'QUOTA_EXCEEDED'])(
    'tải trả 402 %s: chuyển sang /pricing kèm lý do, không modal, không báo lỗi tải, không điều hướng file',
    async (reason) => {
      stubApi({
        'POST /customer/auth/refresh': { body: SESSION },
        [`POST /customer/downloads/${SHEET}/pdf`]: error(402, reason),
      });
      ui();
      await screen.findByText('Khách');
      fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
      await waitFor(() => expect(push).toHaveBeenCalledWith(`/pricing?reason=${reason}`));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(navigateTo).not.toHaveBeenCalled();
    },
  );

  it('thanh toán ẩn: tải trả 402 mã paywall không chuyển sang /pricing, hiện lỗi tải chung', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '');
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      [`POST /customer/downloads/${SHEET}/pdf`]: error(402, 'PLAN_REQUIRED'),
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the file');
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('402 với mã lạ (không phải mã paywall): không chuyển sang /pricing, hiện lỗi tải chung', async () => {
    stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      [`POST /customer/downloads/${SHEET}/pdf`]: error(402, 'PAYMENT_DECLINED'),
    });
    ui();
    await screen.findByText('Khách');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the file');
    expect(push).not.toHaveBeenCalled();
  });

  it('đăng nhập xong tải trạng thái dùng thử và hiện cạnh tên: còn lượt, hết dùng thử, có gói; tắt cưỡng chế thì ẩn', async () => {
    const base = { subscriptionsEnabled: true, canDownload: true, subscription: null };
    const trial = { active: true, endsAt: '2026-10-20T00:00:00.000Z', downloadsLeft: 1, downloadsMax: 2 };
    let entitlement: unknown = { ...base, trial };
    stubApi({ 'POST /customer/auth/refresh': { body: SESSION }, 'GET /customer/entitlement': () => ({ body: entitlement }) });
    const { unmount } = ui();
    expect(await screen.findByTestId('entitlement')).toHaveTextContent('Trial: 1 download left until Oct 20, 2026');
    unmount();

    entitlement = { ...base, canDownload: false, trial: { ...trial, active: false, downloadsLeft: 0 } };
    const ended = ui();
    expect(await screen.findByTestId('entitlement')).toHaveTextContent('Trial ended');
    ended.unmount();

    entitlement = {
      ...base,
      trial: { ...trial, active: false, downloadsLeft: 0 },
      subscription: { planId: 'p', planName: { vi: 'Gói tháng', en: 'Monthly' }, endsAt: '2026-11-13T00:00:00.000Z', downloadsLeft: 7 },
    };
    const paid = ui();
    expect(await screen.findByTestId('entitlement')).toHaveTextContent('Monthly · 7 left · until Nov 13, 2026');
    paid.unmount();

    entitlement = { ...base, subscriptionsEnabled: false, trial };
    ui();
    await screen.findByText('Khách');
    await waitFor(() => expect(screen.queryByTestId('entitlement')).toBeNull());
  });

  it('tải thành công thì tải lại trạng thái dùng thử (số lượt còn lại giảm)', async () => {
    let left = 2;
    const { calls } = stubApi({
      'POST /customer/auth/refresh': { body: SESSION },
      'GET /customer/entitlement': () => ({
        body: { subscriptionsEnabled: true, canDownload: true, subscription: null, trial: { active: true, endsAt: '2026-10-20T00:00:00.000Z', downloadsLeft: left, downloadsMax: 2 } },
      }),
      [`POST /customer/downloads/${SHEET}/pdf`]: () => {
        left -= 1;
        return { body: { url: 'https://r2.example/file.pdf?sig=1' } };
      },
    });
    ui();
    expect(await screen.findByTestId('entitlement')).toHaveTextContent('2 downloads left');
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(screen.getByTestId('entitlement')).toHaveTextContent('1 download left'));
    expect(calls.filter((c) => c.key === 'GET /customer/entitlement').length).toBeGreaterThanOrEqual(2);
  });

  it('đăng nhập đúng: đóng modal, header hiện tên khách và nút Đăng xuất; đăng xuất thu hồi phiên', async () => {
    const { calls } = stubApi({
      ...ANON,
      'POST /customer/auth/login': { body: SESSION },
      'POST /customer/auth/logout': { status: 204 },
    });
    ui();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'khach@example.com' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'mat-khau-123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    await screen.findByText('Khách');
    expect(screen.queryByRole('dialog')).toBeNull();
    const login = calls.find((c) => c.key === 'POST /customer/auth/login')!;
    expect(JSON.parse(login.init.body as string)).toMatchObject({ email: 'khach@example.com', password: 'mat-khau-123' });

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in' });
    expect(calls.some((c) => c.key === 'POST /customer/auth/logout')).toBe(true);
  });

  it('đăng nhập sai: báo lỗi bằng chữ, modal vẫn mở; chưa xác minh: chuyển sang tab xác minh', async () => {
    let reply: Reply = error(401, 'INVALID_CREDENTIALS');
    stubApi({ ...ANON, 'POST /customer/auth/login': () => reply });
    ui();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'khach@example.com' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'sai-mat-khau' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Incorrect email or password.');

    reply = error(403, 'EMAIL_NOT_VERIFIED');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    expect(await within(dialog).findByRole('heading', { name: 'Verify email' })).toBeInTheDocument();
  });

  it('đăng ký: gửi đúng dữ liệu kèm locale, hiện thông báo đã gửi email xác minh (không lộ email có tồn tại)', async () => {
    const { calls } = stubApi({ ...ANON, 'POST /customer/auth/register': { status: 202 } });
    ui();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: /Sign up/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Your name'), { target: { value: 'Lan' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'lan@example.com' } });
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: 'mat-khau-123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('lan@example.com');
    const register = calls.find((c) => c.key === 'POST /customer/auth/register')!;
    expect(JSON.parse(register.init.body as string)).toEqual({ email: 'lan@example.com', password: 'mat-khau-123', name: 'Lan', locale: 'en' });
  });

  it('quên mật khẩu: luôn báo đã gửi', async () => {
    stubApi({ ...ANON, 'POST /customer/auth/forgot-password': { status: 204 } });
    ui();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'ai-do@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send reset link' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('If ai-do@example.com has an account');
  });

  it('Esc đóng modal và trả focus; thiếu NEXT_PUBLIC_GOOGLE_CLIENT_ID thì không có nút Google', async () => {
    stubApi(ANON);
    ui();
    const trigger = await screen.findByRole('button', { name: 'Log in' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(screen.queryByTestId('google-button')).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('có NEXT_PUBLIC_GOOGLE_CLIENT_ID: modal đăng nhập có khung nút Google', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    stubApi(ANON);
    ui();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('google-button')).toBeInTheDocument();
  });

  it('ngoài AuthProvider: nút Tải không ném và HeaderAuth không render', () => {
    render(withIntl(<><HeaderAuth /><DownloadButtons sheetId={SHEET} title="x" types={['PDF']} /></>));
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Trang xác minh email và đặt lại mật khẩu', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test'));
  afterEach(() => vi.unstubAllEnvs());

  it('xác minh: token đúng báo thành công; token sai/thiếu báo link không hợp lệ', async () => {
    const { calls } = stubApi({ 'POST /customer/auth/verify-email': { status: 204 } });
    const { unmount } = render(withIntl(<VerifyEmailView token={'t'.repeat(43)} />));
    expect(await screen.findByText(/Your email is verified/)).toBeInTheDocument();
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ token: 't'.repeat(43) });
    unmount();

    stubApi({ 'POST /customer/auth/verify-email': error(400, 'INVALID_TOKEN') });
    const bad = render(withIntl(<VerifyEmailView token={'x'.repeat(43)} />));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    bad.unmount();

    const { fetchMock } = stubApi({});
    render(withIntl(<VerifyEmailView token="" />));
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('đặt lại mật khẩu: gửi token + mật khẩu mới; token hết hạn báo lỗi', async () => {
    const { calls } = stubApi({ 'POST /customer/auth/reset-password': { status: 204 } });
    const { unmount } = render(withIntl(<ResetPasswordView token={'t'.repeat(43)} />));
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'mat-khau-moi-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your password was changed');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ token: 't'.repeat(43), newPassword: 'mat-khau-moi-1' });
    unmount();

    stubApi({ 'POST /customer/auth/reset-password': error(400, 'INVALID_TOKEN') });
    render(withIntl(<ResetPasswordView token={'x'.repeat(43)} />));
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'mat-khau-moi-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });
});
