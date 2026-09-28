import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callsTo, errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { getAccessToken, getSessionState, login, resetSessionForTests } from '../auth/session';
import { ApiError, apiFetch } from './client';

async function signIn(token = 'old-token') {
  stubFetch(() => jsonResponse(200, sessionBody(token)));
  await login({ email: USER.email, password: 'pw' });
}

beforeEach(() => {
  resetSessionForTests();
});

describe('apiFetch', () => {
  it('gắn Bearer token và trả JSON', async () => {
    await signIn('tok');
    const fetchMock = stubFetch(() => jsonResponse(200, { ok: 1 }));
    await expect(apiFetch('/admin/things')).resolves.toEqual({ ok: 1 });
    const headers = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('401 -> refresh MỘT lần rồi gửi lại với token mới; người dùng không thấy lỗi', async () => {
    await signIn('old-token');
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return jsonResponse(200, sessionBody('new-token'));
      const auth = new Headers(init.headers).get('Authorization');
      return auth === 'Bearer new-token' ? jsonResponse(200, { ok: true }) : jsonResponse(401, errorBody('UNAUTHORIZED'));
    });

    await expect(apiFetch('/admin/things')).resolves.toEqual({ ok: true });
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/admin/things')).toHaveLength(2);
    expect(getAccessToken()).toBe('new-token');
  });

  it('nhiều request 401 đồng thời -> chỉ một lần refresh', async () => {
    await signIn('old-token');
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return jsonResponse(200, sessionBody('new-token'));
      const auth = new Headers(init.headers).get('Authorization');
      return auth === 'Bearer new-token' ? jsonResponse(200, {}) : jsonResponse(401, errorBody('UNAUTHORIZED'));
    });
    await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
  });

  it('refresh thất bại -> ApiError 401, phiên hết (anonymous), không gửi lại', async () => {
    await signIn();
    const fetchMock = stubFetch(() => jsonResponse(401, errorBody('UNAUTHORIZED')));
    const err = await apiFetch('/admin/things').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(getSessionState()).toEqual({ status: 'anonymous', reason: 'unauthenticated' });
    expect(callsTo(fetchMock, '/admin/things')).toHaveLength(1);
  });

  it('401 cả sau khi refresh thành công -> không thử lại lần hai, hết phiên', async () => {
    await signIn();
    const fetchMock = stubFetch((url) =>
      url.endsWith('/auth/refresh') ? jsonResponse(200, sessionBody('new')) : jsonResponse(401, errorBody('UNAUTHORIZED')),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/x')).toHaveLength(2);
    expect(getSessionState().status).toBe('anonymous');
  });

  it('lỗi HTTP -> ApiError{status, code, message} theo errorResponseSchema', async () => {
    await signIn();
    stubFetch(() => jsonResponse(400, errorBody('INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng.')));
    await expect(apiFetch('/auth/change-password', { method: 'POST', json: {} })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CREDENTIALS',
      message: 'Mật khẩu hiện tại không đúng.',
    });
    expect(getSessionState().status).toBe('authenticated');
  });

  it('body lỗi không đúng định dạng -> mã dự phòng theo status', async () => {
    stubFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('lỗi mạng -> ApiError NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('/auth/* gửi credentials: include; json body được stringify', async () => {
    await signIn();
    const fetchMock = stubFetch(() => jsonResponse(204));
    await expect(apiFetch('/auth/change-password', { method: 'POST', json: { a: 1 } })).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0]![1];
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });
});
