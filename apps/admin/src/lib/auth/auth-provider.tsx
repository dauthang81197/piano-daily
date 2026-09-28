'use client';

import type { AuthUser, ChangePasswordRequest, LoginRequest } from '@piano-daily/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { apiFetch } from '../api/client';
import {
  broadcastLogout,
  clearSession,
  getServerSessionState,
  getSessionState,
  listenForLogout,
  login,
  logout,
  refreshSession,
  type SessionState,
  subscribeSession,
} from './session';

export type AuthContextValue = {
  state: SessionState;
  user: AuthUser | null;
  login: (body: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (body: ChangePasswordRequest) => Promise<void>;
  /** Khôi phục phiên bằng `/auth/refresh` (dùng khi tải lại trang). */
  restore: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Đổi mật khẩu: API thu hồi mọi refresh token và xoá cookie -> xoá phiên cục bộ, báo các tab khác;
 * `AuthGate` đưa về `/login?reason=password-changed`. Sai mật khẩu hiện tại (400) thì ném `ApiError`, phiên giữ nguyên.
 */
async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await apiFetch<void>('/auth/change-password', { method: 'POST', json: body });
  clearSession('password-changed');
  broadcastLogout('password-changed');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeSession, getSessionState, getServerSessionState);

  useEffect(() => listenForLogout(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state.status === 'authenticated' ? state.user : null,
      login,
      logout,
      changePassword,
      restore: refreshSession,
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() phải được dùng bên trong <AuthProvider>.');
  return value;
}
