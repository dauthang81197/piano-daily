import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, stubFetch } from '../../test/helpers';
import AdminLayout from './layout';

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/sheets' }));

beforeEach(() => {
  resetSessionForTests();
  router.replace.mockReset();
  window.history.replaceState(null, '', '/sheets');
});

describe('(admin) layout', () => {
  it('bọc toàn bộ khung trong AuthGate: chưa có phiên -> không render nội dung lẫn sidebar, chuyển /login', async () => {
    stubFetch(() => jsonResponse(401, errorBody('UNAUTHORIZED')));
    render(
      <AuthProvider>
        <AdminLayout>
          <p>Nội dung admin bí mật</p>
        </AdminLayout>
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/login/)));
    expect(screen.queryByText('Nội dung admin bí mật')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument();
  });
});
