import { PUBLIC_PAGE_MAX, type PublicSheetSort } from '@piano-daily/shared';
import { LEVELS, type LevelSlug } from './levels';

type Raw = string | string[] | undefined;

const first = (raw: Raw) => (Array.isArray(raw) ? raw[0] : raw);

export function parseLevelSlug(raw: string): LevelSlug | null {
  return (LEVELS as readonly string[]).includes(raw) ? (raw as LevelSlug) : null;
}

/** `page`: vắng thì 1; không phải số nguyên >= 1 thì `null` (trang trả 404). */
export function parsePage(raw: Raw): number | null {
  const value = first(raw);
  if (value === undefined) return 1;
  if (!/^[0-9]+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= PUBLIC_PAGE_MAX ? page : null;
}

/** `sort` sai giá trị thì về mặc định `newest`. */
export function parseSort(raw: Raw): PublicSheetSort {
  return first(raw) === 'most_viewed' ? 'most_viewed' : 'newest';
}

/** `genre` là slug; rỗng thì `undefined` (có hợp lệ hay không do trang đối chiếu với summary). */
export function parseGenre(raw: Raw): string | undefined {
  return first(raw)?.trim() || undefined;
}

export interface LevelQueryState {
  genre?: string | undefined;
  sort?: PublicSheetSort | undefined;
  page?: number | undefined;
}

/** Href (không kèm locale; `Link` của next-intl tự thêm) tới trang Level; bỏ giá trị mặc định khỏi query. */
export function levelHref(level: LevelSlug, { genre, sort, page }: LevelQueryState = {}): string {
  const params = new URLSearchParams();
  if (genre) params.set('genre', genre);
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/level/${level}${qs ? `?${qs}` : ''}`;
}
