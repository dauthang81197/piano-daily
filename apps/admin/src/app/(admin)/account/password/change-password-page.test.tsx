import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { getSessionState, login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../../../test/helpers';
import ChangePasswordPage from './page';

async function renderSignedIn(onChange: () => Response) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  const fetchMock = stubFetch((url) => (url.endsWith('/auth/change-password') ? onChange() : jsonResponse(404)));
  render(
    <AuthProvider>
      <ChangePasswordPage />
    </AuthProvider>,
  );
  return fetchMock;
}

async function fill(current: string, next: string, confirm = next) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), current);
  await user.type(screen.getByLabelText('Mật khẩu mới'), next);
  await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), confirm);
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
}

beforeEach(() => {
  resetSessionForTests();
});

describe('Trang đổi mật khẩu', () => {
  it('thành công -> xoá phiên với lý do password-changed, báo các tab khác', async () => {
    const fetchMock = await renderSignedIn(() => jsonResponse(204));
    const received: unknown[] = [];
    const otherTab = new BroadcastChannel('pd-auth');
    otherTab.onmessage = (e) => received.push(e.data);
    await fill('mat-khau-cu', 'mat-khau-moi-du-dai');
    await vi.waitFor(() => expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'password-changed' }));
    await vi.waitFor(() => expect(received).toEqual([{ type: 'logout', reason: 'password-changed' }]));
    otherTab.close();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'mat-khau-cu', newPassword: 'mat-khau-moi-du-dai' });
  });

  it('sai mật khẩu hiện tại (400 INVALID_CREDENTIALS) -> FormError, vẫn giữ phiên', async () => {
    await renderSignedIn(() => jsonResponse(400, errorBody('INVALID_CREDENTIALS', 'x')));
    await fill('sai', 'mat-khau-moi-du-dai');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu hiện tại không đúng.');
    expect(getSessionState().status).toBe('authenticated');
  });

  it('mật khẩu mới quá ngắn / nhập lại không khớp -> lỗi tại trường, không gọi API', async () => {
    const fetchMock = await renderSignedIn(() => jsonResponse(204));
    await fill('mat-khau-cu', 'ngan', 'khac');
    expect(await screen.findByText('Mật khẩu mới cần ít nhất 12 ký tự.')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu nhập lại không khớp với mật khẩu mới.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
