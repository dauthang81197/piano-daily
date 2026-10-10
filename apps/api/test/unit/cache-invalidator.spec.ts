import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { CacheInvalidator, type SheetCacheState } from '../../src/modules/catalog/cache-invalidator';
import type { PrismaService } from '../../src/prisma/prisma.service';

const SECRET = 'y'.repeat(32);

function makeInvalidator(webUrl: string | undefined, prisma: unknown = {}) {
  const config = { get: (key: string) => (key === 'WEB_INTERNAL_URL' ? webUrl : SECRET) } as unknown as ConfigService<Env, true>;
  return new CacheInvalidator(prisma as PrismaService, config);
}

const state = (over: Partial<SheetCacheState> = {}): SheetCacheState => ({
  id: 's1',
  status: 'PUBLISHED',
  level: 'BEGINNER',
  composerId: 'cA',
  seriesId: null,
  genreIds: [],
  ...over,
});

describe('CacheInvalidator.tagsFor', () => {
  const inv = makeInvalidator(undefined);

  it('đổi Level: có tag của cả level cũ và mới', () => {
    const tags = inv.tagsFor(state(), state({ level: 'INTERMEDIATE' }));
    expect(tags).toEqual(
      expect.arrayContaining(['sheet:s1', 'list:level:beginner', 'list:level:intermediate', 'list:composer:cA', 'search', 'sitemap']),
    );
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('đổi Composer, Series, Genre: tag của giá trị cũ và mới', () => {
    const tags = inv.tagsFor(
      state({ composerId: 'cA', seriesId: 'sr1', genreIds: ['g1', 'g2'] }),
      state({ composerId: 'cB', seriesId: 'sr2', genreIds: ['g2', 'g3'] }),
    );
    expect(tags).toEqual(
      expect.arrayContaining([
        'list:composer:cA',
        'list:composer:cB',
        'list:series:sr1',
        'list:series:sr2',
        'list:genre:g1',
        'list:genre:g2',
        'list:genre:g3',
      ]),
    );
    expect(tags.filter((t) => t === 'list:genre:g2')).toHaveLength(1);
  });

  it('publish: tag của trạng thái sau', () => {
    const tags = inv.tagsFor(state({ status: 'DRAFT' }), state({ seriesId: 'sr1', genreIds: ['g1'] }));
    expect(tags).toEqual(
      expect.arrayContaining(['sheet:s1', 'list:level:beginner', 'list:composer:cA', 'list:series:sr1', 'list:genre:g1', 'search', 'sitemap']),
    );
  });

  it('archive và xoá: tag của trạng thái trước', () => {
    const before = state({ genreIds: ['g1'] });
    for (const after of [state({ status: 'ARCHIVED', genreIds: ['g1'] }), null]) {
      expect(inv.tagsFor(before, after)).toEqual(
        expect.arrayContaining(['sheet:s1', 'list:level:beginner', 'list:genre:g1', 'search', 'sitemap']),
      );
    }
  });

  it('tạo mới PUBLISHED (before = null) có tag', () => {
    expect(inv.tagsFor(null, state())).toContain('sheet:s1');
  });

  it('Draft-only hoặc không tồn tại -> []', () => {
    expect(inv.tagsFor(state({ status: 'DRAFT' }), state({ status: 'DRAFT', level: 'EXPERT' }))).toEqual([]);
    expect(inv.tagsFor(state({ status: 'ARCHIVED' }), state({ status: 'DRAFT' }))).toEqual([]);
    expect(inv.tagsFor(null, null)).toEqual([]);
    expect(inv.tagsFor(null, state({ status: 'DRAFT' }))).toEqual([]);
  });
});

describe('CacheInvalidator.tagsForTaxonomy', () => {
  const inv = makeInvalidator(undefined);
  const levels = ['beginner', 'intermediate', 'advanced', 'expert'].map((l) => `list:level:${l}`);

  it.each(['composer', 'genre', 'series'] as const)('%s', (kind) => {
    const tags = inv.tagsForTaxonomy(kind, 'x1');
    expect(tags).toHaveLength(7);
    expect(tags).toEqual(expect.arrayContaining([`list:${kind}:x1`, ...levels, 'search', 'sitemap']));
  });
});

describe('CacheInvalidator.snapshot', () => {
  it('đọc từ DB; null nếu không có', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        id: 's1',
        status: 'PUBLISHED',
        level: 'BEGINNER',
        composerId: 'cA',
        seriesId: null,
        genres: [{ genreId: 'g1' }],
      })
      .mockResolvedValueOnce(null);
    const inv = makeInvalidator(undefined, { sheet: { findUnique } });
    expect(await inv.snapshot('s1')).toEqual(state({ genreIds: ['g1'] }));
    expect(await inv.snapshot('s2')).toBeNull();
  });
});

describe('CacheInvalidator.notify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const ok = () => new Response('{}', { status: 200 });

  it('gửi POST với header secret và body {tags}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await makeInvalidator('http://web:4100').notify(['search', 'sitemap']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://web:4100/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Internal-Secret']).toBe(SECRET);
    expect(JSON.parse(init.body)).toEqual({ tags: ['search', 'sitemap'] });
  });

  it('bỏ qua khi tags rỗng hoặc thiếu WEB_INTERNAL_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await makeInvalidator('http://web:4100').notify([]);
    await makeInvalidator(undefined).notify(['search']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lỗi liên tục: đúng 3 lần thử (chờ 250ms, 500ms), không ném, log error không chứa secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const inv = makeInvalidator('http://web:4100');
    const logError = vi.spyOn((inv as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => {});
    const done = inv.notify(['search']);
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(done).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(SECRET);
  });

  it('thành công ở lần thử sau thì dừng, không log error', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const inv = makeInvalidator('http://web:4100');
    const logError = vi.spyOn((inv as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => {});
    const done = inv.notify(['search']);
    await vi.advanceTimersByTimeAsync(250);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it('timeout 5 giây mỗi lần thử (abort signal)', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signals.push(init.signal);
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const inv = makeInvalidator('http://web:4100');
    vi.spyOn((inv as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => {});
    const done = inv.notify(['search']);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signals[0]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250 + 5_000 + 500 + 5_000);
    await expect(done).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('CacheInvalidator.track / trackTaxonomy', () => {
  const published = (id: string) => ({ id, status: 'PUBLISHED', level: 'BEGINNER', composerId: 'cA', seriesId: null, genres: [] });
  const make = (findUnique: ReturnType<typeof vi.fn>) => {
    const inv = makeInvalidator('http://web:4100', { sheet: { findUnique } });
    const notify = vi.spyOn(inv, 'notify').mockResolvedValue();
    const logError = vi.spyOn((inv as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => {});
    return { inv, notify, logError };
  };

  it('track: op ném lỗi -> lỗi lan ra, không notify', async () => {
    const { inv, notify } = make(vi.fn().mockResolvedValue(published('s1')));
    await expect(inv.track('s1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(notify).not.toHaveBeenCalled();
  });

  it('track: snapshot lỗi không làm hỏng thao tác, chỉ log', async () => {
    const { inv, notify, logError } = make(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(inv.track('s1', async () => 'ok')).resolves.toBe('ok');
    expect(logError).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith([]);
  });

  it('track(null, op, resultId): lấy snapshot sau theo resultId', async () => {
    const findUnique = vi.fn().mockResolvedValue(published('new1'));
    const { inv, notify } = make(findUnique);
    await expect(inv.track(null, async () => ({ id: 'new1' }), (r) => r.id)).resolves.toEqual({ id: 'new1' });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0]![0].where).toEqual({ id: 'new1' });
    expect(notify.mock.calls[0]![0]).toContain('sheet:new1');
  });

  it('trackTaxonomy: id null dùng resultId', async () => {
    const { inv, notify } = make(vi.fn());
    await inv.trackTaxonomy('genre', null, async () => ({ id: 'g9' }), (r) => r.id);
    expect(notify).toHaveBeenCalledWith(inv.tagsForTaxonomy('genre', 'g9'));
  });

  it('trackTaxonomy: op ném lỗi -> không notify', async () => {
    const { inv, notify } = make(vi.fn());
    await expect(inv.trackTaxonomy('series', 's1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('CacheInvalidator.notifySheets (đặt giá hàng loạt)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const row = (id: string, status = 'PUBLISHED') => ({
    id,
    status,
    level: 'BEGINNER',
    composerId: 'cA',
    seriesId: null,
    genres: [{ genreId: 'g1' }],
  });

  it('gom tag của mọi Sheet PUBLISHED, bỏ Draft, chia lô <= 100 tag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const published = Array.from({ length: 120 }, (_, i) => row(`s${i}`));
    const findMany = vi.fn().mockResolvedValue([...published, row('draft', 'DRAFT')]);
    await makeInvalidator('http://web:4100', { sheet: { findMany } }).notifySheets([...published.map((r) => r.id), 'draft']);
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).tags as string[]);
    expect(sent.length).toBeGreaterThan(1);
    for (const tags of sent) expect(tags.length).toBeLessThanOrEqual(100);
    const all = sent.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(['sheet:s0', 'sheet:s119', 'list:genre:g1', 'search', 'sitemap']));
    expect(all).not.toContain('sheet:draft');
  });

  it('không ném khi đọc DB hoặc gọi web lỗi', async () => {
    const inv = makeInvalidator('http://web:4100', { sheet: { findMany: vi.fn().mockRejectedValue(new Error('db down')) } });
    vi.spyOn((inv as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => {});
    await expect(inv.notifySheets(['s1'])).resolves.toBeUndefined();
  });
});
