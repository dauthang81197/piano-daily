import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchComposer,
  fetchComposerSheets,
  fetchFacets,
  fetchGenre,
  fetchGenreSheets,
  fetchLevelSheets,
  fetchLevelSummary,
  fetchSearch,
  fetchSheetDetail,
} from './catalog';

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

  it('fetchSearch gửi mọi bộ lọc, level viết hoa, tag search', async () => {
    fetchMock.mockResolvedValue(json({ items: [], page: 2, pageSize: 12, total: 0 }));
    await fetchSearch({ q: 'dem thu', level: 'expert', genre: 'jazz', composer: 'bach', format: 'midi', sort: 'relevance', page: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'http://api:4000/sheets?sort=relevance&page=2&q=dem+thu&level=EXPERT&genre=jazz&composer=bach&format=midi',
    );
    expect(init.next.tags).toEqual(['search']);
    expect(init.cache).toBe('force-cache');
  });

  it('fetchSearch không bộ lọc chỉ gửi sort và page', async () => {
    fetchMock.mockResolvedValue(json({ items: [], page: 1, pageSize: 12, total: 0 }));
    await fetchSearch({ sort: 'newest', page: 1 });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api:4000/sheets?sort=newest&page=1');
  });

  it('fetchFacets gọi /sheets/facets với tag search', async () => {
    fetchMock.mockResolvedValue(json({ genres: [{ id: 'g', slug: 'jazz', name: 'Jazz', count: 1 }], composers: [] }));
    const facets = await fetchFacets();
    expect(facets.genres[0]!.slug).toBe('jazz');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/sheets/facets');
    expect(init.next.tags).toEqual(['search']);
  });

  it('lỗi API được ném ra, không nuốt', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchLevelSheets('beginner', { page: 1, sort: 'newest' })).rejects.toThrow(/500/);
  });
  it('fetchComposer gắn tag search, mã hoá slug và parse kết quả', async () => {
    fetchMock.mockResolvedValue(json({ id: 'c1', slug: 'bach', name: 'Bach', bio: null, avatarUrl: null }));
    expect(await fetchComposer('bach')).toMatchObject({ id: 'c1', name: 'Bach' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/composers/bach');
    expect(init.next.tags).toEqual(['search']);
  });

  it('fetchComposer/fetchGenre: 404 và 400 (slug không hợp lệ) -> null; lỗi khác -> ném', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404));
    expect(await fetchComposer('zzz')).toBeNull();
    expect(await fetchGenre('zzz')).toBeNull();
    fetchMock.mockImplementation(async () => json({ error: { code: 'VALIDATION_FAILED', message: 'x' } }, 400));
    expect(await fetchComposer('a'.repeat(300))).toBeNull();
    expect(await fetchGenre('a'.repeat(300))).toBeNull();
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchComposer('bach')).rejects.toThrow('500');
  });

  it('fetchGenre parse icon', async () => {
    fetchMock.mockResolvedValue(json({ id: 'g1', slug: 'pop', name: 'Pop', icon: 'music' }));
    expect(await fetchGenre('pop')).toEqual({ id: 'g1', slug: 'pop', name: 'Pop', icon: 'music' });
  });

  it('danh sách Composer/Genre gắn tag theo id và gửi slug', async () => {
    fetchMock.mockImplementation(async () => json({ items: [], page: 2, pageSize: 12, total: 0 }));
    await fetchComposerSheets({ id: 'c1', slug: 'bach' }, { page: 2, sort: 'most_viewed' });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api:4000/sheets?composer=bach&sort=most_viewed&page=2');
    expect(fetchMock.mock.calls[0]![1].next.tags).toEqual(['list:composer:c1']);
    await fetchGenreSheets({ id: 'g1', slug: 'pop' }, { page: 1, sort: 'newest' });
    expect(fetchMock.mock.calls[1]![0]).toBe('http://api:4000/sheets?genre=pop&sort=newest&page=1');
    expect(fetchMock.mock.calls[1]![1].next.tags).toEqual(['list:genre:g1']);
  });
  it('fetchSheetDetail gắn tag search, mã hoá slug, parse; 404/400 -> null; lỗi khác -> ném', async () => {
    const detail = {
      id: 's', publicId: 1, slug: 'fur-elise', title: 'Für Elise', subtitle: null, level: 'BEGINNER',
      difficultyScore: null, difficultyNote: null, description: null,
      composer: { id: 'c', name: 'B', slug: 'b' }, series: null, genres: [], pageCount: 0, viewCount: 0,
      isHot: false, updatedAt: '2026-10-05T00:00:00.000Z', pages: [], midi: null, youtubeUrl: null,
      lyricsChords: null, seriesSheets: [], related: [],
    };
    fetchMock.mockImplementation(async () => json(detail));
    expect(await fetchSheetDetail('fur elise')).toMatchObject({ title: 'Für Elise' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/sheets/fur%20elise');
    expect(init.next.tags).toEqual(['search']);
    fetchMock.mockImplementation(async () => json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404));
    expect(await fetchSheetDetail('zzz')).toBeNull();
    fetchMock.mockImplementation(async () => json({ error: { code: 'VALIDATION_FAILED', message: 'x' } }, 400));
    expect(await fetchSheetDetail('a'.repeat(300))).toBeNull();
    fetchMock.mockImplementation(async () => json({}, 500));
    await expect(fetchSheetDetail('x')).rejects.toThrow('500');
  });
});
