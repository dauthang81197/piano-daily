import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, publicFetch } from './api';

describe('apiFetch (AD-18)', () => {
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000/');
    vi.stubEnv('INTERNAL_API_SECRET', 'super-secret-value-0123456789abcdef');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('gọi API_INTERNAL_URL kèm X-Internal-Secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/sheets', { headers: { Accept: 'application/json' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/sheets');
    const headers = init.headers as Headers;
    expect(headers.get('X-Internal-Secret')).toBe('super-secret-value-0123456789abcdef');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it.each(['API_INTERNAL_URL', 'INTERNAL_API_SECRET'])('thiếu %s -> lỗi nêu tên biến, không lộ secret', async (name) => {
    vi.stubEnv(name, '');
    const error = await apiFetch('/x').catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(name);
    expect((error as Error).message).not.toContain('super-secret-value');
  });
});

describe('publicFetch (AD-10)', () => {
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    vi.stubEnv('INTERNAL_API_SECRET', 'super-secret-value-0123456789abcdef');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('force-cache kèm tags và revalidate 600, vẫn gửi X-Internal-Secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await publicFetch('/sheets?level=BEGINNER', { tags: ['list:level:beginner'] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/sheets?level=BEGINNER');
    expect(init.cache).toBe('force-cache');
    expect(init.next).toEqual({ tags: ['list:level:beginner'], revalidate: 600 });
    expect((init.headers as Headers).get('X-Internal-Secret')).toBe('super-secret-value-0123456789abcdef');
  });
});
