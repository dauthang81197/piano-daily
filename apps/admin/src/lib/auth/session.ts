import { type AuthUser, type LoginRequest, loginResponseSchema, type LoginResponse } from '@piano-daily/shared';
import { ApiError, sendRequest, toApiError } from '../api/http';

/**
 * Phiên admin phía client.
 * - Access token CHỈ nằm trong bộ nhớ JS của tab (không localStorage/sessionStorage/cookie JS).
 * - Refresh token là cookie httpOnly do API quản lý (`Path=/auth`): mọi request `/auth/*` dùng `credentials: 'include'`.
 * - `refreshSession()` tuần tự hoá giữa các tab bằng Web Locks: hai lời gọi `/auth/refresh` không bao giờ chạy đồng thời
 *   (request thua trong cuộc đua sẽ xoá cookie mới — deferred-work Story 1.2).
 * - Đăng xuất được phát tới mọi tab qua `BroadcastChannel('pd-auth')`.
 */

/** Lý do phiên kết thúc — quyết định trang login được mở kèm tham số gì. */
export type SessionEndReason = 'unauthenticated' | 'logout' | 'password-changed';

export type SessionState =
  | { status: 'unknown' }
  | { status: 'authenticated'; user: AuthUser; accessToken: string }
  | { status: 'anonymous'; reason: SessionEndReason };

export const REFRESH_LOCK_NAME = 'pd-auth-refresh';
export const AUTH_CHANNEL_NAME = 'pd-auth';

type AuthBroadcast = { type: 'logout'; reason?: SessionEndReason };

const INITIAL_STATE: SessionState = { status: 'unknown' };

let state: SessionState = INITIAL_STATE;
/** Tăng mỗi khi phiên bị xoá: kết quả refresh bắt đầu trước đó bị bỏ qua (không "hồi sinh" phiên đã đăng xuất). */
let epoch = 0;
let inflightRefresh: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getSessionState(): SessionState {
  return state;
}

/** Snapshot phía server: phiên không tồn tại ở server, luôn là `unknown`. */
export function getServerSessionState(): SessionState {
  return INITIAL_STATE;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccessToken(): string | null {
  return state.status === 'authenticated' ? state.accessToken : null;
}

function applySession(body: LoginResponse): void {
  setState({ status: 'authenticated', user: body.user, accessToken: body.accessToken });
}

/** Xoá phiên trong bộ nhớ của tab hiện tại (không gọi API, không phát broadcast). */
export function clearSession(reason: SessionEndReason = 'unauthenticated'): void {
  epoch += 1;
  setState({ status: 'anonymous', reason });
}

/** Chỉ dùng trong test: đưa store về trạng thái ban đầu. */
export function resetSessionForTests(): void {
  epoch += 1;
  inflightRefresh = null;
  state = INITIAL_STATE;
  listeners.clear();
}

async function doRefresh(): Promise<boolean> {
  const startedAt = epoch;
  const res = await sendRequest('/auth/refresh', { method: 'POST', credentials: 'include' });
  if (res.ok) {
    const body = loginResponseSchema.parse(await res.json());
    // Phiên đã đổi trong lúc chờ (login/đăng xuất): không áp kết quả cũ, trả theo phiên hiện tại.
    if (epoch !== startedAt) return state.status === 'authenticated';
    applySession(body);
    return true;
  }
  // 4xx: cookie thiếu / hết hạn / đã thu hồi -> hết phiên. 5xx: lỗi tạm thời, không đăng xuất.
  if (res.status >= 400 && res.status < 500) {
    if (epoch !== startedAt) return state.status === 'authenticated';
    clearSession('unauthenticated');
    return false;
  }
  throw await toApiError(res);
}

/**
 * Chạy `fn` trong khoá `pd-auth-refresh` (độc quyền giữa các tab). Không có Web Locks (trình duyệt cũ):
 * chỉ tuần tự hoá trong tab — chờ refresh đang chạy (promise dùng chung) rồi mới chạy `fn`.
 */
function withRefreshLock<T>(fn: () => Promise<T>, waitForInflight: boolean): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) return locks.request(REFRESH_LOCK_NAME, fn);
  if (waitForInflight && inflightRefresh) {
    return inflightRefresh.then(fn, fn);
  }
  return fn();
}

function runRefreshExclusive(): Promise<boolean> {
  return withRefreshLock(doRefresh, false);
}

/**
 * Xoay vòng refresh token và lấy access token mới (kèm user).
 * - `true`: có phiên; `false`: hết phiên (trạng thái đã chuyển `anonymous`).
 * - Ném `ApiError` khi lỗi mạng/5xx (phiên giữ nguyên).
 * Các lời gọi đồng thời trong cùng tab dùng chung một promise; giữa các tab tuần tự qua Web Locks.
 */
export function refreshSession(): Promise<boolean> {
  inflightRefresh ??= runRefreshExclusive().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/** `POST /auth/login`. Ném `ApiError` (401 INVALID_CREDENTIALS, 429, NETWORK_ERROR…). */
export async function login(body: LoginRequest): Promise<AuthUser> {
  const res = await sendRequest('/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  const data = loginResponseSchema.parse(await res.json());
  epoch += 1;
  applySession(data);
  return data.user;
}

/** Phát sự kiện đăng xuất tới các tab khác. */
export function broadcastLogout(reason: SessionEndReason = 'logout'): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.postMessage({ type: 'logout', reason } satisfies AuthBroadcast);
  channel.close();
}

/** Lắng nghe đăng xuất từ tab khác; trả hàm huỷ. */
export function listenForLogout(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<AuthBroadcast | undefined>) => {
    if (event.data?.type === 'logout' && state.status !== 'anonymous') clearSession(event.data.reason ?? 'logout');
  };
  return () => channel.close();
}

/**
 * Đăng xuất: gọi `/auth/logout` (thu hồi refresh token, xoá cookie), xoá token trong bộ nhớ, báo mọi tab.
 * Chạy trong cùng khoá với refresh: nếu tab khác đang xoay vòng C1→C2, logout chờ xong rồi mới gửi (với cookie C2),
 * tránh việc response refresh tới sau `clearCookie` và để lại cookie C2 còn hiệu lực.
 * Lỗi mạng hay lỗi API vẫn xoá phiên cục bộ.
 */
export async function logout(): Promise<void> {
  try {
    await withRefreshLock(() => sendRequest('/auth/logout', { method: 'POST', credentials: 'include' }), true);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  } finally {
    clearSession('logout');
    broadcastLogout();
  }
}
