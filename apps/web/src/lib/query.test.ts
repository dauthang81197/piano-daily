import { describe, expect, it } from 'vitest';
import {
  levelHref,
  parseFormat,
  parseGenre,
  parseLevelParam,
  parseLevelSlug,
  parsePage,
  parseQuery,
  parseSearchSort,
  parseSort,
  searchHref,
} from './query';

describe('parsePage', () => {
  it('vắng -> 1; số nguyên >= 1 hợp lệ', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('3')).toBe(3);
  });
  it('trên PUBLIC_PAGE_MAX -> null', () => {
    expect(parsePage('10000')).toBe(10000);
    expect(parsePage('10001')).toBeNull();
  });
  it.each(['0', 'abc', '-1', '1.5', '', '1e3', ' 2'])('%j không hợp lệ -> null', (v) => {
    expect(parsePage(v)).toBeNull();
  });
});

describe('parseSort / parseGenre / parseLevelSlug', () => {
  it('sort sai về newest', () => {
    expect(parseSort('most_viewed')).toBe('most_viewed');
    expect(parseSort('x')).toBe('newest');
    expect(parseSort(undefined)).toBe('newest');
  });
  it('genre rỗng -> undefined', () => {
    expect(parseGenre('jazz')).toBe('jazz');
    expect(parseGenre('  ')).toBeUndefined();
    expect(parseGenre(['a', 'b'])).toBe('a');
  });
  it('level chỉ nhận chữ thường trong LEVELS', () => {
    expect(parseLevelSlug('beginner')).toBe('beginner');
    expect(parseLevelSlug('BEGINNER')).toBeNull();
    expect(parseLevelSlug('foo')).toBeNull();
  });
});

describe('levelHref', () => {
  it('bỏ giá trị mặc định', () => {
    expect(levelHref('beginner')).toBe('/level/beginner');
    expect(levelHref('beginner', { sort: 'newest', page: 1 })).toBe('/level/beginner');
  });
  it('giữ genre, sort, page', () => {
    expect(levelHref('expert', { genre: 'jazz', sort: 'most_viewed', page: 2 })).toBe(
      '/level/expert?genre=jazz&sort=most_viewed&page=2',
    );
  });
});

describe('parseQuery / parseFormat / parseLevelParam / parseSearchSort', () => {
  it('q: trim, cắt 100 ký tự, rỗng -> undefined', () => {
    expect(parseQuery('  elise ')).toBe('elise');
    expect(parseQuery('   ')).toBeUndefined();
    expect(parseQuery(undefined)).toBeUndefined();
    expect(parseQuery('a'.repeat(150))).toHaveLength(100);
    expect(parseQuery(['x', 'y'])).toBe('x');
  });
  it('format sai bị bỏ', () => {
    expect(parseFormat('midi')).toBe('midi');
    expect(parseFormat('pdf')).toBeUndefined();
    expect(parseFormat(undefined)).toBeUndefined();
  });
  it('level chỉ nhận slug chữ thường, sai bị bỏ', () => {
    expect(parseLevelParam('expert')).toBe('expert');
    expect(parseLevelParam('foo')).toBeUndefined();
    expect(parseLevelParam('EXPERT')).toBeUndefined();
    expect(parseLevelParam('')).toBeUndefined();
  });
  it('sort: relevance chỉ khi có q (và là mặc định của nó); sai giá trị về mặc định', () => {
    expect(parseSearchSort(undefined, true)).toBe('relevance');
    expect(parseSearchSort('relevance', true)).toBe('relevance');
    expect(parseSearchSort('relevance', false)).toBe('newest');
    expect(parseSearchSort('x', false)).toBe('newest');
    expect(parseSearchSort('most_viewed', true)).toBe('most_viewed');
    expect(parseSearchSort('newest', true)).toBe('newest');
  });
});

describe('searchHref', () => {
  it('bỏ giá trị mặc định', () => {
    expect(searchHref()).toBe('/search');
    expect(searchHref({ sort: 'newest', page: 1 })).toBe('/search');
    expect(searchHref({ q: 'elise', sort: 'relevance' })).toBe('/search?q=elise');
  });
  it('giữ q, level, genre, composer, format, sort, page theo thứ tự', () => {
    expect(
      searchHref({ q: 'dem thu', level: 'beginner', genre: 'jazz', composer: 'bach', format: 'midi', sort: 'most_viewed', page: 2 }),
    ).toBe('/search?q=dem+thu&level=beginner&genre=jazz&composer=bach&format=midi&sort=most_viewed&page=2');
    expect(searchHref({ q: 'x', sort: 'newest' })).toBe('/search?q=x&sort=newest');
  });
});
