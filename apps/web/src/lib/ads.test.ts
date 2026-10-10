import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAds } from './ads';

describe('fetchAds', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    vi.stubEnv('INTERNAL_API_SECRET', 'secret');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  const data = [{ position: 'HEADER', htmlCode: '<b>x</b>', image: null, link: null }];

  it('gọi /ads với tag ads và trả dữ liệu', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(fetchAds()).resolves.toEqual(data);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/ads');
    expect(init.next.tags).toEqual(['ads']);
    expect(init.cache).not.toBe('no-store');
  });

  it('API trả lỗi -> []', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(fetchAds()).resolves.toEqual([]);
  });

  it('fetch ném lỗi -> []', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(fetchAds()).resolves.toEqual([]);
  });

  it('body sai schema -> []', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ position: 'NOPE' }]), { status: 200 }));
    await expect(fetchAds()).resolves.toEqual([]);
  });

  it('thiếu biến môi trường -> []', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    await expect(fetchAds()).resolves.toEqual([]);
  });
});
