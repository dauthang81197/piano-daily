import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { clearSession, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch } from '../test/helpers';
import { AuthGate } from './auth-gate';

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderGate() {
  return render(
    <AuthProvider>
      <AuthGate>
        <p>Nội dung admin bí mật</p>
      </AuthGate>
    </AuthProvider>,
  );
}

beforeEach(() => {
  resetSessionForTests();
  router.replace.mockReset();
  window.history.replaceState(null, '', '/sheets?page=2');
});

describe('AuthGate', () => {
  it('chưa có phiên (refresh 401) -> không render children, chuyển /login?next=<route>', async () => {
    stubFetch(() => jsonResponse(401, errorBody('UNAUTHORIZED')));
    renderGate();
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra phiên đăng nhập');
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login?next=%2Fsheets%3Fpage%3D2'));
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
  });

  it('còn phiên (refresh 200) -> render children, ở lại route', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    renderGate();
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    expect(await screen.findByText('Nội dung admin bí mật')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('phiên kết thúc do đổi mật khẩu -> /login?reason=password-changed, ẩn nội dung', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    renderGate();
    await screen.findByText('Nội dung admin bí mật');
    act(() => clearSession('password-changed'));
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login?reason=password-changed'));
  });

  it('refresh 503 -> alert "Không xác minh được phiên đăng nhập", không redirect, ẩn nội dung', async () => {
    stubFetch(() => jsonResponse(503, errorBody('SERVICE_UNAVAILABLE')));
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không xác minh được phiên đăng nhập');
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('tab khác đăng xuất (BroadcastChannel pd-auth) -> ẩn nội dung, chuyển /login', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    renderGate();
    await screen.findByText('Nội dung admin bí mật');
    const otherTab = new BroadcastChannel('pd-auth');
    otherTab.postMessage({ type: 'logout' });
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    otherTab.close();
  });

  it('API không truy cập được -> FormError, không render children, không crash', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ. Vui lòng thử lại.');
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
