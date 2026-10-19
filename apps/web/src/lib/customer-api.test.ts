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
