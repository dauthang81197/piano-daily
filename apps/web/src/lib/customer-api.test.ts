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
