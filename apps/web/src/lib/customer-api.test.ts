import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customerApi } from './customer-api';

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const called = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, auth: (init.headers as Record<string, string>).Authorization };
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test/');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('customerApi: khoá học C5 (nội dung đầy đủ)', () => {
  const full = { youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', content: 'x', midi: null };

  it('lessonFull gọi đúng đường dẫn, Bearer token, locale en/vi và parse kết quả', async () => {
    fetchMock.mockResolvedValue(json(200, full));
    expect(await customerApi.lessonFull('tok', 'a b', 'en')).toEqual(full);
    expect(called()).toMatchObject({ url: 'https://api.test/customer/courses/lessons/a%20b/full?locale=en', auth: 'Bearer tok' });
    expect(called().init.method).toBe('GET');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json(200, full));
    await customerApi.lessonFull('tok', 'l1', 'fr');
    expect(called().url).toBe('https://api.test/customer/courses/lessons/l1/full?locale=vi');
  });

  it('402 thành ApiError mang mã PLAN_REQUIRED; phản hồi sai dạng bị từ chối', async () => {
    fetchMock.mockResolvedValue(json(402, { error: { code: 'PLAN_REQUIRED', message: 'cần gói', details: { reason: 'PLAN_REQUIRED' } } }));
    await expect(customerApi.lessonFull('tok', 'l1', 'vi')).rejects.toMatchObject({ status: 402, code: 'PLAN_REQUIRED' });
    fetchMock.mockResolvedValue(json(200, { content: 5 }));
    await expect(customerApi.lessonFull('tok', 'l1', 'vi')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('customerApi: chuyển nhạc sang MIDI', () => {
  const job = { id: '0195b0f0-0000-7000-8000-000000000000', status: 'PENDING', originalName: 'a.pdf', transpose: 2, createdAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-10-20T06:00:00.000Z', result: null, error: null };

  it('createScore gửi multipart (không ép Content-Type JSON), kèm transpose, Bearer; parse việc PENDING', async () => {
    fetchMock.mockResolvedValue(json(202, job));
    const file = new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' });
    expect((await customerApi.createScore('tok', file, 2)).status).toBe('PENDING');
    const { url, init, auth } = called();
    expect(url).toBe('https://api.test/customer/scores');
    expect(auth).toBe('Bearer tok');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('transpose')).toBe('2');
    expect((form.get('file') as File).name).toBe('a.pdf');
  });

  it('getScore / deleteScore đúng đường dẫn; 429 mang mã và details', async () => {
    fetchMock.mockResolvedValue(json(200, job));
    await customerApi.getScore('tok', job.id);
    expect(called().url).toBe(`https://api.test/customer/scores/${job.id}`);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await customerApi.deleteScore('tok', job.id);
    expect(called().init.method).toBe('DELETE');
    fetchMock.mockResolvedValue(json(429, { error: { code: 'SCORE_DAILY_LIMIT', message: 'hết lượt', details: { retryAfterSeconds: 90 } } }));
    await expect(customerApi.getScore('tok', job.id)).rejects.toMatchObject({ status: 429, code: 'SCORE_DAILY_LIMIT', details: { retryAfterSeconds: 90 } });
  });
});

describe('customerApi.createScore: báo tiến độ tải lên (XMLHttpRequest)', () => {
  const job = { id: '0195b0f0-0000-7000-8000-000000000000', status: 'PENDING', originalName: 'a.pdf', transpose: 0, createdAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-10-20T06:00:00.000Z', result: null, error: null };

  class FakeXhr {
    static last: FakeXhr;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    withCredentials = false;
    headers: Record<string, string> = {};
    status = 0;
    responseText = '';
    method = '';
    url = '';
    body: unknown;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send(body: unknown) {
      this.body = body;
    }
    reply(status: number, body: unknown) {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    }
  }
  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));

  it('có onProgress: dùng XHR (không dùng fetch), gửi Bearer + credentials, báo tỉ lệ 0..1 rồi parse kết quả', async () => {
    const file = new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' });
    const seen: number[] = [];
    const promise = customerApi.createScore('tok', file, 3, (f) => seen.push(f));
    const xhr = FakeXhr.last;
    expect(xhr).toMatchObject({ method: 'POST', url: 'https://api.test/customer/scores', withCredentials: true });
    expect(xhr.headers.Authorization).toBe('Bearer tok');
    expect((xhr.body as FormData).get('transpose')).toBe('3');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.reply(202, job);
    expect((await promise).status).toBe('PENDING');
    expect(seen).toEqual([0.25, 1]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lỗi HTTP thành ApiError mang mã và details (giống đường fetch); lỗi mạng thành NETWORK_ERROR', async () => {
    const file = new File(['x'], 'a.pdf');
    const limited = customerApi.createScore('tok', file, 0, () => undefined);
    FakeXhr.last.reply(429, { error: { code: 'SCORE_DAILY_LIMIT', message: 'hết lượt', details: { retryAfterSeconds: 60 } } });
    await expect(limited).rejects.toMatchObject({ status: 429, code: 'SCORE_DAILY_LIMIT', details: { retryAfterSeconds: 60 } });

    const offline = customerApi.createScore('tok', file, 0, () => undefined);
    FakeXhr.last.onerror?.();
    await expect(offline).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
