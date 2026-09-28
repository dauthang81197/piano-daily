import { vi } from 'vitest';

export const USER = { id: 'u-1', email: 'admin@piano-daily.test', name: 'Founder', role: 'SUPER_ADMIN' } as const;

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });
}

export function sessionBody(accessToken = 'access-1') {
  return { accessToken, expiresIn: 900, user: USER };
}

export function errorBody(code: string, message = 'x') {
  return { error: { code, message } };
}

/** Lời gọi fetch tới `path` (so khớp đuôi URL). */
export function callsTo(fetchMock: ReturnType<typeof stubFetch>, path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
}

export function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init: RequestInit) => Promise<Response>>((input, init = {}) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Web Locks giả: khoá độc quyền theo tên, chạy tuần tự như trình duyệt. */
export function createFakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
    const previous = queues.get(name) ?? Promise.resolve();
    const run = previous.then(() => callback());
    queues.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  });
  return { request } as unknown as LockManager & { request: typeof request };
}

export function setNavigatorLocks(locks: LockManager | undefined) {
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

/** Promise điều khiển được từ ngoài (giữ response fetch lại cho tới khi test cho phép). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
