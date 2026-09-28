import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { resetSessionForTests } from '@/lib/auth/session';
import { callsTo, errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import LoginPage from './page';

const router = { replace: vi.fn(), push: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => searchParams }));

type Handler = (url: string) => Response | Promise<Response>;

/** Refresh ban đầu trả 401 (chưa đăng nhập); `onLogin` trả response cho /auth/login. */
function setup(onLogin: Handler) {
  const fetchMock = stubFetch((url) =>
    url.endsWith('/auth/refresh') ? jsonResponse(401, errorBody('UNAUTHORIZED')) : onLogin(url),
  );
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
  return fetchMock;
}

async function submit(email: string = USER.email, password = 'sai-mat-khau') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Mật khẩu'), password);
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

beforeEach(() => {
  resetSessionForTests();
  router.replace.mockReset();
  searchParams = new URLSearchParams();
});

describe('Trang /login', () => {
  it('sai thông tin (401 INVALID_CREDENTIALS) -> FormError, giữ email đã nhập', async () => {
    setup(() => jsonResponse(401, errorBody('INVALID_CREDENTIALS', 'x')));
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    expect(screen.getByLabelText('Email')).toHaveValue(USER.email);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('quá ngưỡng (429) -> FormError báo đợi rồi thử lại', async () => {
    setup(() => jsonResponse(429, errorBody('TOO_MANY_REQUESTS', 'x')));
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/đợi .* rồi thử lại/);
  });

  it('lỗi mạng -> FormError "Không kết nối được máy chủ. Vui lòng thử lại."', async () => {
    setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ. Vui lòng thử lại.');
  });

  it('đúng thông tin -> chuyển tới `next` (chỉ path nội bộ)', async () => {
    searchParams = new URLSearchParams({ next: '/sheets' });
    setup(() => jsonResponse(200, sessionBody()));
    await submit(USER.email, 'mat-khau-dung');
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sheets'));
  });

  it('`next` ngoài site bị bỏ qua -> về /', async () => {
    searchParams = new URLSearchParams({ next: '//evil.com' });
    setup(() => jsonResponse(200, sessionBody()));
    await submit(USER.email, 'mat-khau-dung');
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('validate phía client bằng loginRequestSchema (không gọi API khi email sai)', async () => {
    const fetchMock = setup(() => jsonResponse(200, sessionBody()));
    await submit('khong-phai-email', 'x');
    expect(await screen.findByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(callsTo(fetchMock, '/auth/login')).toHaveLength(0);
  });

  it('có tiêu đề h1', async () => {
    setup(() => jsonResponse(200, sessionBody()));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Đăng nhập quản trị');
  });

  it('API không truy cập được khi khôi phục phiên -> vẫn hiện form kèm FormError lỗi mạng', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ. Vui lòng thử lại.');
  });

  it('đến từ đổi mật khẩu -> hiện thông báo', async () => {
    searchParams = new URLSearchParams({ reason: 'password-changed' });
    setup(() => jsonResponse(200, sessionBody()));
    expect(await screen.findByText('Đã đổi mật khẩu. Vui lòng đăng nhập lại.')).toBeInTheDocument();
  });

  it('đã có phiên (refresh 200) -> chuyển về /', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});
