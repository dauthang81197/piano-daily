import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_SITE_SETTINGS, fetchSiteSettings } from './site-settings';

describe('fetchSiteSettings', () => {
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

  const data = { siteName: 'Studio', logoUrl: 'https://m.test/logo.webp', seoDescription: 'Mô tả', youtubeUrl: 'https://youtu.be/x' };

  it('gọi /settings/site với tag settings và trả dữ liệu', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(fetchSiteSettings()).resolves.toEqual(data);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/settings/site');
    expect(init.next.tags).toEqual(['settings']);
  });

  it('API trả lỗi -> mặc định cũ', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(fetchSiteSettings()).resolves.toEqual(FALLBACK_SITE_SETTINGS);
  });

  it('fetch ném lỗi -> mặc định cũ', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(fetchSiteSettings()).resolves.toEqual(FALLBACK_SITE_SETTINGS);
  });

  it('body sai schema -> mặc định cũ', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ siteName: 1 }), { status: 200 }));
    await expect(fetchSiteSettings()).resolves.toEqual(FALLBACK_SITE_SETTINGS);
  });

  it('thiếu biến môi trường -> mặc định cũ', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    await expect(fetchSiteSettings()).resolves.toEqual(FALLBACK_SITE_SETTINGS);
  });
});
