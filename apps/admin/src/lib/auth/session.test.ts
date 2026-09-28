import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callsTo,
  createFakeLocks,
  deferred,
  errorBody,
  jsonResponse,
  sessionBody,
  setNavigatorLocks,
  stubFetch,
  USER,
} from '../../test/helpers';
import {
  AUTH_CHANNEL_NAME,
  clearSession,
  getAccessToken,
  getSessionState,
  listenForLogout,
  login,
  logout,
  REFRESH_LOCK_NAME,
  refreshSession,
  resetSessionForTests,
} from './session';

beforeEach(() => {
  resetSessionForTests();
  setNavigatorLocks(undefined);
});

afterEach(() => {
  setNavigatorLocks(undefined);
});

describe('refreshSession', () => {
  it('thành công -> access token chỉ nằm trong bộ nhớ, request gửi credentials: include', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, sessionBody('tok-1')));
    await expect(refreshSession()).resolves.toBe(true);
    expect(getAccessToken()).toBe('tok-1');
    expect(getSessionState()).toEqual({ status: 'authenticated', user: USER, accessToken: 'tok-1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('401 -> false, phiên chuyển anonymous', async () => {
    stubFetch(() => jsonResponse(401, errorBody('UNAUTHORIZED')));
    await expect(refreshSession()).resolves.toBe(false);
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'unauthenticated' });
  });

  it('lỗi mạng -> ném ApiError NETWORK_ERROR, không đăng xuất', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(refreshSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    expect(getSessionState()).toEqual({ status: 'unknown' });
  });

  it('503 -> ném ApiError status 503, trạng thái giữ nguyên', async () => {
    stubFetch(() => jsonResponse(503, errorBody('SERVICE_UNAVAILABLE')));
    await expect(refreshSession()).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(getSessionState()).toEqual({ status: 'unknown' });
  });

  it('epoch guard: phiên bị xoá khi refresh đang chờ -> kết quả cũ không được áp, trả false', async () => {
    const held = deferred<Response>();
    stubFetch(() => held.promise);
    const pending = refreshSession();
    clearSession('logout');
    held.resolve(jsonResponse(200, sessionBody('stale')));
    await expect(pending).resolves.toBe(false);
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' });
    expect(getAccessToken()).toBeNull();
  });

  it('hai lời gọi đồng thời trong một tab -> chỉ một fetch /auth/refresh', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, sessionBody()));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect([a, b]).toEqual([true, true]);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
  });

  it('được bọc trong navigator.locks.request("pd-auth-refresh")', async () => {
    const locks = createFakeLocks();
    setNavigatorLocks(locks);
    const fetchMock = stubFetch(() => jsonResponse(200, sessionBody()));
    await refreshSession();
    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(locks.request.mock.calls[0]![0]).toBe(REFRESH_LOCK_NAME);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hai tab cùng refresh -> hai lời gọi /auth/refresh chạy tuần tự, cả hai giữ được phiên', async () => {
    const locks = createFakeLocks();
    setNavigatorLocks(locks);
    let active = 0;
    let maxActive = 0;
    let n = 0;
    stubFetch(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      n += 1;
      return jsonResponse(200, sessionBody(`tok-${n}`));
    });

    // Tab thứ hai = một bản module session độc lập (bộ nhớ riêng), dùng chung navigator.locks.
    vi.resetModules();
    const otherTab = await import('./session');

    const [a, b] = await Promise.all([refreshSession(), otherTab.refreshSession()]);
    expect([a, b]).toEqual([true, true]);
    expect(maxActive).toBe(1);
    expect(locks.request).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeTruthy();
    expect(otherTab.getAccessToken()).toBeTruthy();
  });
});

describe('login / logout', () => {
  it('login đúng -> phiên authenticated', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, sessionBody('tok-login')));
    await expect(login({ email: USER.email, password: 'pw' })).resolves.toEqual(USER);
    expect(getAccessToken()).toBe('tok-login');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('login sai -> ném ApiError INVALID_CREDENTIALS', async () => {
    stubFetch(() => jsonResponse(401, errorBody('INVALID_CREDENTIALS', 'Sai')));
    await expect(login({ email: USER.email, password: 'pw' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('logout gọi /auth/logout, xoá token và phát broadcast tới tab khác', async () => {
    stubFetch((url) => (url.endsWith('/auth/login') ? jsonResponse(200, sessionBody()) : jsonResponse(204)));
    await login({ email: USER.email, password: 'pw' });

    const received: unknown[] = [];
    const other = new BroadcastChannel(AUTH_CHANNEL_NAME);
    other.onmessage = (e) => received.push(e.data);

    await logout();
    expect(getAccessToken()).toBeNull();
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' });
    await vi.waitFor(() => expect(received).toEqual([{ type: 'logout', reason: 'logout' }]));
    other.close();
  });

  it('logout chờ refresh đang giữ khoá pd-auth-refresh xong rồi mới gọi /auth/logout', async () => {
    const locks = createFakeLocks();
    setNavigatorLocks(locks);
    const held = deferred<Response>();
    const fetchMock = stubFetch((url) => (url.endsWith('/auth/refresh') ? held.promise : jsonResponse(204)));

    // Refresh của "tab khác" (bản module riêng) đang giữ khoá.
    vi.resetModules();
    const otherTab = await import('./session');
    const refreshing = otherTab.refreshSession();
    const loggingOut = logout();

    await new Promise((r) => setTimeout(r, 20));
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(0);

    held.resolve(jsonResponse(200, sessionBody()));
    await refreshing;
    await loggingOut;
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(1);
    expect(locks.request.mock.calls.map(([name]) => name)).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME]);
    const order = fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/auth\//, ''));
    expect(order).toEqual(['refresh', 'logout']);
  });

  it('logout không có Web Locks -> chờ refresh đang chạy trong tab', async () => {
    const held = deferred<Response>();
    const fetchMock = stubFetch((url) => (url.endsWith('/auth/refresh') ? held.promise : jsonResponse(204)));
    const refreshing = refreshSession();
    const loggingOut = logout();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(0);
    held.resolve(jsonResponse(200, sessionBody()));
    await Promise.all([refreshing, loggingOut]);
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(1);
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' });
  });

  it('logout khi lỗi mạng vẫn xoá phiên cục bộ', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    await login({ email: USER.email, password: 'pw' });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(logout()).resolves.toBeUndefined();
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' });
  });

  it('nhận broadcast logout từ tab khác -> xoá phiên', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    await login({ email: USER.email, password: 'pw' });
    const stop = listenForLogout();
    const sender = new BroadcastChannel(AUTH_CHANNEL_NAME);
    sender.postMessage({ type: 'logout' });
    await vi.waitFor(() => expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'logout' }));
    sender.close();
    stop();
  });

  it('broadcast kèm reason password-changed -> tab khác kết thúc phiên với cùng lý do', async () => {
    stubFetch(() => jsonResponse(200, sessionBody()));
    await login({ email: USER.email, password: 'pw' });
    const stop = listenForLogout();
    const sender = new BroadcastChannel(AUTH_CHANNEL_NAME);
    sender.postMessage({ type: 'logout', reason: 'password-changed' });
    await vi.waitFor(() => expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'password-changed' }));
    sender.close();
    stop();
  });
});
