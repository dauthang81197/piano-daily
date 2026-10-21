import { type FacetItem, PUBLIC_FORMATS, type PublicFormat } from '@piano-daily/shared';
import { LEVELS, type LevelSlug } from './levels';
import { searchHref, type SearchQueryState } from './query';

export interface FilterItem {
  key: string;
  label: string;
  /** Số Sheet (khi API có); thiếu thì không hiện số. */
  count?: number | undefined;
  href: string;
  selected: boolean;
}

export interface FilterGroup {
  id: 'level' | 'genre' | 'composer' | 'format';
  title: string;
  items: FilterItem[];
}

export interface FilterGroupLabels {
  titles: Record<FilterGroup['id'], string>;
  level: (slug: LevelSlug) => string;
  format: (format: PublicFormat) => string;
}

/**
 * Các nhóm lọc của trang Bản nhạc. Mỗi nhóm chọn tối đa một mục: bấm mục đang chọn thì bỏ lọc nhóm đó, bấm mục khác thì đổi;
 * các nhóm còn lại và `q`, `sort` được giữ, `page` về 1. Nhóm không có mục thì bỏ khỏi kết quả.
 */
export function buildFilterGroups({
  state,
  facets,
  levelCounts,
  labels,
}: {
  state: SearchQueryState;
  facets: { genres: FacetItem[]; composers: FacetItem[] } | null;
  levelCounts: Partial<Record<LevelSlug, number>>;
  labels: FilterGroupLabels;
}): FilterGroup[] {
  const toggle = <K extends 'level' | 'genre' | 'composer' | 'format'>(key: K, value: NonNullable<SearchQueryState[K]>) => {
    const { page: _page, ...rest } = state;
    void _page;
    return searchHref({ ...rest, [key]: state[key] === value ? undefined : value });
  };
  const groups: FilterGroup[] = [
    {
      id: 'level',
      title: labels.titles.level,
      items: LEVELS.map((slug) => ({ key: slug, label: labels.level(slug), count: levelCounts[slug], href: toggle('level', slug), selected: state.level === slug })),
    },
    {
      id: 'genre',
      title: labels.titles.genre,
      items: (facets?.genres ?? []).map((g) => ({ key: g.slug, label: g.name, count: g.count, href: toggle('genre', g.slug), selected: state.genre === g.slug })),
    },
    {
      id: 'composer',
      title: labels.titles.composer,
      items: (facets?.composers ?? []).map((c) => ({ key: c.slug, label: c.name, count: c.count, href: toggle('composer', c.slug), selected: state.composer === c.slug })),
    },
    {
      id: 'format',
      title: labels.titles.format,
      items: PUBLIC_FORMATS.map((f) => ({ key: f, label: labels.format(f), href: toggle('format', f), selected: state.format === f })),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** Số bộ lọc đang áp dụng (không tính từ khoá và sắp xếp). */
export const activeFilterCount = (state: SearchQueryState): number =>
  [state.level, state.genre, state.composer, state.format].filter(Boolean).length;
