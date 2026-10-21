import { describe, expect, it } from 'vitest';
import { activeFilterCount, buildFilterGroups, type FilterGroupLabels } from './filter-groups';

const labels: FilterGroupLabels = {
  titles: { level: 'Level', genre: 'Genre', composer: 'Composer', format: 'Format' },
  level: (slug) => `L:${slug}`,
  format: (f) => `F:${f}`,
};
const facets = {
  genres: [{ id: 'g1', slug: 'jazz', name: 'Jazz', count: 3 }, { id: 'g2', slug: 'pop', name: 'Pop', count: 1 }],
  composers: [{ id: 'c1', slug: 'bach', name: 'Bach', count: 2 }],
};
const build = (state = {}, extra: Partial<Parameters<typeof buildFilterGroups>[0]> = {}) =>
  buildFilterGroups({ state, facets, levelCounts: { beginner: 12, advanced: 4 }, labels, ...extra });
const group = (groups: ReturnType<typeof build>, id: string) => groups.find((g) => g.id === id)!;

describe('buildFilterGroups', () => {
  it('đủ bốn nhóm theo thứ tự Độ khó, Thể loại, Tác giả, Định dạng; số lượng lấy từ facets và level', () => {
    const groups = build();
    expect(groups.map((g) => g.id)).toEqual(['level', 'genre', 'composer', 'format']);
    expect(group(groups, 'level').items.map((i) => [i.label, i.count])).toEqual([
      ['L:beginner', 12],
      ['L:intermediate', undefined],
      ['L:advanced', 4],
      ['L:expert', undefined],
    ]);
    expect(group(groups, 'genre').items.map((i) => [i.label, i.count])).toEqual([['Jazz', 3], ['Pop', 1]]);
    expect(group(groups, 'format').items.every((i) => i.count === undefined)).toBe(true);
  });

  it('chọn một mục: link tới /search kèm tham số; mục đang chọn được đánh dấu và bấm lại thì bỏ lọc nhóm đó', () => {
    const groups = build({ level: 'beginner' });
    const level = group(groups, 'level').items;
    expect(level.find((i) => i.key === 'beginner')).toMatchObject({ selected: true, href: '/search' });
    expect(level.find((i) => i.key === 'advanced')).toMatchObject({ selected: false, href: '/search?level=advanced' });
    expect(group(groups, 'genre').items[0]!.href).toBe('/search?level=beginner&genre=jazz');
  });

  it('kết hợp nhiều nhóm giữ nguyên các nhóm khác, giữ q và sort, bỏ page', () => {
    const state = { q: 'elise', level: 'beginner', genre: 'jazz', composer: 'bach', format: 'midi', sort: 'most_viewed', page: 3 } as const;
    const groups = build({ ...state });
    expect(group(groups, 'genre').items.find((i) => i.key === 'jazz')!.href).toBe('/search?q=elise&level=beginner&composer=bach&format=midi&sort=most_viewed');
    expect(group(groups, 'composer').items[0]!.href).toBe('/search?q=elise&level=beginner&genre=jazz&format=midi&sort=most_viewed');
    expect(group(groups, 'level').items.find((i) => i.key === 'advanced')!.href).toBe('/search?q=elise&level=advanced&genre=jazz&composer=bach&format=midi&sort=most_viewed');
    expect(groups.flatMap((g) => g.items).every((i) => !i.href.includes('page='))).toBe(true);
  });

  it('thiếu facets (API lỗi): bỏ nhóm Thể loại và Tác giả, còn Độ khó và Định dạng; thiếu số thì không có số', () => {
    const groups = build({}, { facets: null, levelCounts: {} });
    expect(groups.map((g) => g.id)).toEqual(['level', 'format']);
    expect(group(groups, 'level').items.every((i) => i.count === undefined)).toBe(true);
  });

  it('activeFilterCount chỉ đếm Level, Genre, Composer, định dạng (không đếm q, sort, page)', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ q: 'x', sort: 'newest', page: 2 })).toBe(0);
    expect(activeFilterCount({ level: 'beginner', genre: 'jazz', composer: 'bach', format: 'midi' })).toBe(4);
  });
});
