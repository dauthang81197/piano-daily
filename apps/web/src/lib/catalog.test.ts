import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLevelSheets, fetchLevelSummary } from './catalog';

describe('catalog fetchers', () => {
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

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('summary gọi level viết hoa và gắn tag list:level', async () => {
    fetchMock.mockResolvedValue(json({ total: 0, lastUpdatedAt: null, genres: [] }));
    await fetchLevelSummary('beginner');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/levels/BEGINNER/summary');
    expect(init.next.tags).toEqual(['list:level:beginner']);
  });

  it('danh sách có genre thêm tag list:genre và gửi slug', async () => {
    fetchMock.mockResolvedValue(json({ items: [], page: 2, pageSize: 12, total: 0 }));
    await fetchLevelSheets('expert', { page: 2, sort: 'most_viewed', genre: { slug: 'jazz', id: 'g1' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/sheets?level=EXPERT&sort=most_viewed&page=2&genre=jazz');
    expect(init.next.tags).toEqual(['list:level:expert', 'list:genre:g1']);
  });

  it('danh sách không genre chỉ có tag list:level', async () => {
    fetchMock.mockResolvedValue(json({ items: [], page: 1, pageSize: 12, total: 0 }));
    await fetchLevelSheets('beginner', { page: 1, sort: 'newest' });
    expect(fetchMock.mock.calls[0]![1].next.tags).toEqual(['list:level:beginner']);
  });

  it('lỗi API được ném ra, không nuốt', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchLevelSheets('beginner', { page: 1, sort: 'newest' })).rejects.toThrow(/500/);
  });
});
