import type {
  Composer,
  CreateComposerRequest,
  CreateGenreRequest,
  CreateSeriesRequest,
  Genre,
  ListQueryInput,
  Page,
  Series,
  UpdateComposerRequest,
  UpdateGenreRequest,
  UpdateSeriesRequest,
} from '@piano-daily/shared';
import { apiFetch } from './client';

/** Query string từ `ListQueryInput` (bỏ giá trị rỗng). */
export function toQueryString(query: ListQueryInput): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface ResourceApi<T, C, U> {
  list(query?: ListQueryInput, signal?: AbortSignal): Promise<Page<T>>;
  get(id: string): Promise<T>;
  create(body: C): Promise<T>;
  update(id: string, body: U): Promise<T>;
  remove(id: string): Promise<void>;
}

function resource<T, C, U>(path: string): ResourceApi<T, C, U> {
  const item = (id: string) => `${path}/${encodeURIComponent(id)}`;
  return {
    list: (query = {}, signal) => apiFetch<Page<T>>(`${path}${toQueryString(query)}`, { signal }),
    get: (id) => apiFetch<T>(item(id)),
    create: (body) => apiFetch<T>(path, { method: 'POST', json: body }),
    update: (id, body) => apiFetch<T>(item(id), { method: 'PATCH', json: body }),
    remove: (id) => apiFetch<void>(item(id), { method: 'DELETE' }),
  };
}

export type ComposersApi = ResourceApi<Composer, CreateComposerRequest, UpdateComposerRequest>;
export type GenresApi = ResourceApi<Genre, CreateGenreRequest, UpdateGenreRequest>;
export type SeriesApi = ResourceApi<Series, CreateSeriesRequest, UpdateSeriesRequest>;

export const composersApi: ComposersApi = resource('/admin/composers');
export const genresApi: GenresApi = resource('/admin/genres');
export const seriesApi: SeriesApi = resource('/admin/series');
