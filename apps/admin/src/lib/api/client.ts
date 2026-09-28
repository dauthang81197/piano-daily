import { clearSession, getAccessToken, refreshSession } from '../auth/session';
import { ApiError, sendRequest, toApiError } from './http';

export { ApiError, isApiError } from './http';

export type ApiFetchInit = Omit<RequestInit, 'body'> & {
  /** Body JSON (tự `JSON.stringify` và đặt `Content-Type`). */
  json?: unknown;
  body?: RequestInit['body'];
};

const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

function buildInit(path: string, init: ApiFetchInit, token: string | null): RequestInit {
  const { json, headers: rawHeaders, ...rest } = init;
  const headers = new Headers(rawHeaders);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = rest.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  return {
    ...rest,
    body,
    headers,
    // Cookie refresh (`Path=/auth`) chỉ cần gửi kèm cho /auth/*.
    credentials: path.startsWith('/auth/') ? 'include' : (rest.credentials ?? 'same-origin'),
  };
}

async function parseBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Gọi API của admin (chỉ phía client).
 * - Gắn `Authorization: Bearer <access token trong bộ nhớ>`.
 * - Gặp 401: gọi `refreshSession()` MỘT lần rồi gửi lại. Refresh thất bại -> phiên đã bị xoá, ném `ApiError` 401.
 * - Lỗi HTTP -> `ApiError{status, code, message}` theo `errorResponseSchema`; lỗi mạng -> `NETWORK_ERROR`.
 */
export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  let res = await sendRequest(path, buildInit(path, init, getAccessToken()));

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new ApiError(401, 'UNAUTHORIZED', SESSION_EXPIRED_MESSAGE);
    res = await sendRequest(path, buildInit(path, init, getAccessToken()));
    if (res.status === 401) {
      // Token mới vẫn bị từ chối: coi như hết phiên, không thử lại lần nữa.
      clearSession('unauthenticated');
      throw await toApiError(res);
    }
  }

  if (!res.ok) throw await toApiError(res);
  return parseBody<T>(res);
}
