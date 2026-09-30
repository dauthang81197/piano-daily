import { describe, expect, it } from 'vitest';
import { localeAlternates } from './seo';

describe('localeAlternates', () => {
  it('trang chủ', () => {
    expect(localeAlternates('/', 'vi')).toEqual({
      canonical: '/vi',
      languages: { vi: '/vi', en: '/en', 'x-default': '/en' },
    });
  });
  it('path con', () => {
    const alt = localeAlternates('/level/beginner', 'en');
    expect(alt.canonical).toBe('/en/level/beginner');
    expect(alt.languages).toEqual({
      vi: '/vi/level/beginner',
      en: '/en/level/beginner',
      'x-default': '/en/level/beginner',
    });
  });
});
