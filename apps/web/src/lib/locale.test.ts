import { describe, expect, it } from 'vitest';
import { hasLocalePrefix, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('cookie hợp lệ thắng IP', () => {
    expect(resolveLocale({ cookie: 'en', country: 'VN' })).toBe('en');
    expect(resolveLocale({ cookie: 'vi', country: 'US' })).toBe('vi');
  });
  it('không cookie: VN -> vi', () => expect(resolveLocale({ country: 'VN' })).toBe('vi'));
  it('không cookie: IP khác hoặc thiếu header -> en', () => {
    expect(resolveLocale({ country: 'US' })).toBe('en');
    expect(resolveLocale({})).toBe('en');
  });
  it('cookie sai giá trị bị bỏ qua, chọn theo IP', () => {
    expect(resolveLocale({ cookie: 'fr', country: 'VN' })).toBe('vi');
    expect(resolveLocale({ cookie: 'fr', country: 'US' })).toBe('en');
  });
});

describe('hasLocalePrefix', () => {
  it.each([
    ['/vi', true],
    ['/en/level/beginner', true],
    ['/', false],
    ['/level/beginner', false],
    ['/vietnam', false],
    ['/fr', false],
  ])('%s -> %s', (pathname, expected) => expect(hasLocalePrefix(pathname)).toBe(expected));
});
