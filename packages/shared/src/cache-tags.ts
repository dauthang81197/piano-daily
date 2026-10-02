import type { Level } from './sheet';

/**
 * Cache tag của web (AD-10): nguồn duy nhất cho chuỗi tag, dùng cả khi gắn tag vào fetch (web)
 * lẫn khi revalidate (api, Story 2.3). Level trong tag viết thường (`list:level:beginner`).
 */
export const cacheTags = {
  sheet: (id: string) => `sheet:${id}`,
  listLevel: (level: Level | string) => `list:level:${level.toLowerCase()}`,
  listComposer: (id: string) => `list:composer:${id}`,
  listGenre: (id: string) => `list:genre:${id}`,
  listSeries: (id: string) => `list:series:${id}`,
  search: 'search',
  sitemap: 'sitemap',
  ads: 'ads',
  settings: 'settings',
} as const;

const TAG_PATTERNS = [
  /^sheet:[^\s:]+$/,
  /^list:(level|composer|genre|series):[^\s:]+$/,
  /^(search|sitemap|ads|settings)$/,
];

/** `true` nếu chuỗi có đúng một dạng tag hợp lệ của `cacheTags` (web dùng để lọc body `/api/revalidate`). */
export function isCacheTag(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && TAG_PATTERNS.some((re) => re.test(value));
}
