import {
  PUBLIC_FORMATS,
  PUBLIC_PAGE_MAX,
  PUBLIC_SEARCH_MAX_LENGTH,
  type PublicFormat,
  type PublicSheetSort,
} from '@piano-daily/shared';
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

/** `sort` sai giá trị thì về mặc định `newest` (trang Level không có `relevance`). */
export function parseSort(raw: Raw): PublicSheetSort {
  return first(raw) === 'most_viewed' ? 'most_viewed' : 'newest';
}

/** `sort` của trang Search: `relevance` chỉ hợp lệ khi có `q` và là mặc định của nó; còn lại mặc định `newest`. */
export function parseSearchSort(raw: Raw, hasQuery: boolean): PublicSheetSort {
  const value = first(raw);
  if (value === 'newest' || value === 'most_viewed') return value;
  return hasQuery ? 'relevance' : 'newest';
}

/** `q`: trim và cắt về tối đa 100 ký tự (giới hạn API); rỗng thì `undefined`. */
export function parseQuery(raw: Raw): string | undefined {
  const value = first(raw)?.trim().slice(0, PUBLIC_SEARCH_MAX_LENGTH).trim();
  return value || undefined;
}

/** `format` sai giá trị bị bỏ. */
export function parseFormat(raw: Raw): PublicFormat | undefined {
  const value = first(raw);
  return (PUBLIC_FORMATS as readonly string[]).includes(value ?? '') ? (value as PublicFormat) : undefined;
}

/** `level` ở trang Search: slug chữ thường, sai giá trị bị bỏ. */
export function parseLevelParam(raw: Raw): LevelSlug | undefined {
  const value = first(raw);
  return value ? (parseLevelSlug(value) ?? undefined) : undefined;
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

export interface SearchQueryState {
  q?: string | undefined;
  level?: LevelSlug | undefined;
  genre?: string | undefined;
  composer?: string | undefined;
  format?: PublicFormat | undefined;
  sort?: PublicSheetSort | undefined;
  page?: number | undefined;
}

/** Href (không kèm locale) tới trang Search; bỏ giá trị mặc định (`sort` mặc định phụ thuộc có `q` hay không). */
export function searchHref({ q, level, genre, composer, format, sort, page }: SearchQueryState = {}): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (level) params.set('level', level);
  if (genre) params.set('genre', genre);
  if (composer) params.set('composer', composer);
  if (format) params.set('format', format);
  if (sort && sort !== (q ? 'relevance' : 'newest')) params.set('sort', sort);
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export interface ListQueryState {
  sort?: PublicSheetSort | undefined;
  page?: number | undefined;
}

function listHref(base: string, { sort, page }: ListQueryState): string {
  const params = new URLSearchParams();
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

/** Href (không kèm locale) tới trang Composer; bỏ giá trị mặc định khỏi query. */
export const composerHref = (slug: string, state: ListQueryState = {}) =>
  listHref(`/composer/${encodeURIComponent(slug)}`, state);

/** Href (không kèm locale) tới trang Genre; bỏ giá trị mặc định khỏi query. */
export const genreHref = (slug: string, state: ListQueryState = {}) =>
  listHref(`/genre/${encodeURIComponent(slug)}`, state);
