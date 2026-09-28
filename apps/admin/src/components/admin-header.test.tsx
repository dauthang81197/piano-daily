import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { getSessionState, login, resetSessionForTests } from '@/lib/auth/session';
import { callsTo, jsonResponse, sessionBody, stubFetch, USER } from '../test/helpers';
import { AdminHeader } from './admin-header';

beforeEach(() => {
  resetSessionForTests();
});

describe('AdminHeader', () => {
  it('hiện tên admin, link đổi mật khẩu; bấm "Đăng xuất" gọi /auth/logout và kết thúc phiên', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    await login({ email: USER.email, password: 'pw' });
    const fetchMock = stubFetch(() => jsonResponse(204));
    render(
      <AuthProvider>
        <AdminHeader />
      </AuthProvider>,
    );

    expect(screen.getByText(USER.name)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đổi mật khẩu' })).toHaveAttribute('href', '/account/password');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' }));
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });
});
