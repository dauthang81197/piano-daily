import { describe, expect, it } from 'vitest';
import { levelHref, parseGenre, parseLevelSlug, parsePage, parseSort } from './query';

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
