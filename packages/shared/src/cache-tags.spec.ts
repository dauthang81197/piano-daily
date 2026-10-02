import { describe, expect, it } from 'vitest';
import { cacheTags, isCacheTag } from './cache-tags';

describe('cacheTags (AD-10)', () => {
  it('sinh đúng chuỗi tag', () => {
    expect(cacheTags.sheet('abc')).toBe('sheet:abc');
    expect(cacheTags.listComposer('c1')).toBe('list:composer:c1');
    expect(cacheTags.listGenre('g1')).toBe('list:genre:g1');
    expect(cacheTags.listSeries('s1')).toBe('list:series:s1');
    expect(cacheTags.search).toBe('search');
    expect(cacheTags.sitemap).toBe('sitemap');
    expect(cacheTags.ads).toBe('ads');
    expect(cacheTags.settings).toBe('settings');
  });

  it('level trong tag luôn viết thường', () => {
    expect(cacheTags.listLevel('BEGINNER')).toBe('list:level:beginner');
    expect(cacheTags.listLevel('expert')).toBe('list:level:expert');
  });

  it('isCacheTag chấp nhận mọi tag do cacheTags sinh ra', () => {
    for (const tag of [
      cacheTags.sheet('abc'),
      cacheTags.listLevel('BEGINNER'),
      cacheTags.listComposer('c1'),
      cacheTags.listGenre('g1'),
      cacheTags.listSeries('s1'),
      cacheTags.search,
      cacheTags.sitemap,
      cacheTags.ads,
      cacheTags.settings,
    ]) {
      expect(isCacheTag(tag)).toBe(true);
    }
  });

  it('isCacheTag từ chối tag lạ', () => {
    for (const tag of ['', 'foo', 'sheet:', 'list:level:', 'list:other:1', 'search:x', 'sheet:a b', 'Search', 42, null]) {
      expect(isCacheTag(tag)).toBe(false);
    }
  });
});
