import 'server-only';
import {
  cacheTags,
  type Level,
  type LevelSummary,
  levelSummarySchema,
  type PublicSheetList,
  type PublicSheetSort,
  publicSheetListSchema,
} from '@piano-daily/shared';
import { publicFetch } from './api';
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
