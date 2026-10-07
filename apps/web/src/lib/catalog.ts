import 'server-only';
import {
  cacheTags,
  type Facets,
  facetsSchema,
  type Level,
  type LevelSummary,
  levelSummarySchema,
  type PublicComposer,
  publicComposerSchema,
  type PublicFormat,
  type PublicGenre,
  type PublicSheetDetail,
  publicSheetDetailSchema,
  type SitemapEntries,
  sitemapEntriesSchema,
  publicGenreSchema,
  type PublicSheetList,
  type PublicSheetSort,
  publicSheetListSchema,
} from '@piano-daily/shared';
import { apiFetch, publicFetch } from './api';
import type { LevelSlug } from './levels';

const toApiLevel = (level: LevelSlug) => level.toUpperCase() as Level;

async function getJson(path: string, tags: string[]): Promise<unknown> {
  const res = await publicFetch(path, { tags, headers: { Accept: 'application/json' } });
  // Không nuốt lỗi: để error boundary của Next hiển thị trang lỗi.
  if (!res.ok) throw new Error(`API ${path} trả ${res.status}`);
  return res.json();
}

export async function fetchLevelSummary(level: LevelSlug): Promise<LevelSummary> {
  return levelSummarySchema.parse(await getJson(`/levels/${toApiLevel(level)}/summary`, [cacheTags.listLevel(level)]));
}

export async function fetchLevelSheets(
  level: LevelSlug,
  opts: { page: number; sort: PublicSheetSort; genre?: { slug: string; id: string } | undefined },
): Promise<PublicSheetList> {
  const params = new URLSearchParams({ level: toApiLevel(level), sort: opts.sort, page: String(opts.page) });
  if (opts.genre) params.set('genre', opts.genre.slug);
  const tags = [cacheTags.listLevel(level)];
  if (opts.genre) tags.push(cacheTags.listGenre(opts.genre.id));
  return publicSheetListSchema.parse(await getJson(`/sheets?${params}`, tags));
}

export interface SearchOptions {
  q?: string | undefined;
  level?: LevelSlug | undefined;
  genre?: string | undefined;
  composer?: string | undefined;
  format?: PublicFormat | undefined;
  sort: PublicSheetSort;
  page: number;
}

/** Tìm kiếm và lọc (trang Search). `genre`/`composer` là slug đã đối chiếu với facets. */
export async function fetchSearch(opts: SearchOptions): Promise<PublicSheetList> {
  const params = new URLSearchParams({ sort: opts.sort, page: String(opts.page) });
  if (opts.q) params.set('q', opts.q);
  if (opts.level) params.set('level', toApiLevel(opts.level));
  if (opts.genre) params.set('genre', opts.genre);
  if (opts.composer) params.set('composer', opts.composer);
  if (opts.format) params.set('format', opts.format);
  return publicSheetListSchema.parse(await getJson(`/sheets?${params}`, [cacheTags.search]));
}

export async function fetchFacets(): Promise<Facets> {
  return facetsSchema.parse(await getJson('/sheets/facets', [cacheTags.search]));
}

/**
 * Như `getJson` nhưng 404 trả `null` (slug không tồn tại -> trang `notFound()`); lỗi khác vẫn ném.
 * 400 cũng là `null`: endpoint theo slug chỉ trả 400 khi slug không hợp lệ (ví dụ quá dài), tức không có trang.
 */
async function getJsonOrNull(path: string, tags: string[]): Promise<unknown | null> {
  const res = await publicFetch(path, { tags, headers: { Accept: 'application/json' } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${path} trả ${res.status}`);
  return res.json();
}

// Thông tin theo slug gắn tag `search`: id chưa biết trước khi gọi, còn mọi thao tác Sheet và CRUD
// Composer/Genre đều phát tag này nên đổi tên/bio/slug có hiệu lực ngay.
export async function fetchComposer(slug: string): Promise<PublicComposer | null> {
  const body = await getJsonOrNull(`/composers/${encodeURIComponent(slug)}`, [cacheTags.search]);
  return body === null ? null : publicComposerSchema.parse(body);
}

export async function fetchGenre(slug: string): Promise<PublicGenre | null> {
  const body = await getJsonOrNull(`/genres/${encodeURIComponent(slug)}`, [cacheTags.search]);
  return body === null ? null : publicGenreSchema.parse(body);
}

export async function fetchComposerSheets(
  composer: { id: string; slug: string },
  opts: { page: number; sort: PublicSheetSort },
): Promise<PublicSheetList> {
  const params = new URLSearchParams({ composer: composer.slug, sort: opts.sort, page: String(opts.page) });
  return publicSheetListSchema.parse(await getJson(`/sheets?${params}`, [cacheTags.listComposer(composer.id)]));
}

export async function fetchGenreSheets(
  genre: { id: string; slug: string },
  opts: { page: number; sort: PublicSheetSort },
): Promise<PublicSheetList> {
  const params = new URLSearchParams({ genre: genre.slug, sort: opts.sort, page: String(opts.page) });
  return publicSheetListSchema.parse(await getJson(`/sheets?${params}`, [cacheTags.listGenre(genre.id)]));
}

/** Chi tiết Sheet theo slug; slug không tồn tại hoặc không hợp lệ (404/400) thì `null`. Gắn tag `search` (id chưa biết trước). */
export async function fetchSheetDetail(slug: string): Promise<PublicSheetDetail | null> {
  const body = await getJsonOrNull(`/sheets/${encodeURIComponent(slug)}`, [cacheTags.search]);
  return body === null ? null : publicSheetDetailSchema.parse(body);
}

/**
 * Chi tiết Sheet ở mọi trạng thái cho route preview của admin (Story 2.10, AD-19). KHÔNG cache (`no-store`, không
 * `publicFetch`/tag) và token đi trong header, không vào URL. 404/400/401 (token thiếu/sai/hết hạn/khác Sheet,
 * Sheet không tồn tại) đều là `null`; lỗi khác ném.
 */
export async function fetchPreviewSheet(id: string, token: string): Promise<PublicSheetDetail | null> {
  const res = await apiFetch(`/sheets/${encodeURIComponent(id)}/preview`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'X-Preview-Token': token },
  });
  if (res.status === 404 || res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`API preview trả ${res.status}`);
  return publicSheetDetailSchema.parse(await res.json());
}

/** Dữ liệu dựng `sitemap.xml`; gắn tag `sitemap` nên `revalidateTag('sitemap')` (Story 2.3) làm mới ngay. */
export async function fetchSitemapEntries(): Promise<SitemapEntries> {
  return sitemapEntriesSchema.parse(await getJson('/sitemap-entries', [cacheTags.sitemap]));
}
