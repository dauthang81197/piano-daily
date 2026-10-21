import 'server-only';
import type { Facets } from '@piano-daily/shared';
import { getTranslations } from 'next-intl/server';
import { fetchFacets, fetchLevelSummary } from './catalog';
import { buildFilterGroups, type FilterGroup } from './filter-groups';
import { LEVELS, type LevelSlug } from './levels';
import type { SearchQueryState } from './query';

/** Lỗi API không được làm hỏng trang: ghi log và dùng giá trị thay thế (nhóm/số lượng tương ứng ẩn đi). */
async function orElse<T>(promise: Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`Không tải được ${what} cho bộ lọc`, error);
    return fallback;
  }
}

/** Dựng các nhóm lọc cho một trạng thái tìm kiếm. `facets` đã có (trang tìm kiếm) thì dùng lại, tránh gọi lần nữa. */
export async function loadFilterGroups(state: SearchQueryState, facets?: Facets): Promise<FilterGroup[]> {
  const [nav, card, t, loadedFacets, counts] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Card'),
    getTranslations('Filters'),
    facets ? Promise.resolve(facets) : orElse(fetchFacets(), null, 'facets'),
    Promise.all(LEVELS.map(async (level) => [level, await orElse(fetchLevelSummary(level).then((s) => s.total as number | undefined), undefined, `số Sheet level ${level}`)] as const)),
  ]);
  const levelCounts: Partial<Record<LevelSlug, number>> = {};
  for (const [level, total] of counts) if (total !== undefined) levelCounts[level] = total;
  return buildFilterGroups({
    state,
    facets: loadedFacets,
    levelCounts,
    labels: {
      titles: { level: t('groupLevel'), genre: t('groupGenre'), composer: t('groupComposer'), format: t('groupFormat') },
      level: (slug) => nav(`levels.${slug}`),
      format: (format) => card(`formats.${format}`),
    },
  });
}
