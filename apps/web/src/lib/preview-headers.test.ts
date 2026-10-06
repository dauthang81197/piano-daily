import { describe, expect, it } from 'vitest';
import { PREVIEW_HEADERS, PREVIEW_SOURCE } from './preview-headers';

const value = (key: string) => PREVIEW_HEADERS.find((h) => h.key === key)?.value;

describe('header của route preview', () => {
  it('không cache, không index, không gửi Referer (token nằm trong URL)', () => {
    expect(value('Cache-Control')).toContain('no-store');
    expect(value('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(value('Referrer-Policy')).toBe('no-referrer');
  });

  it('áp cho mọi locale và mọi đường dẫn con dưới /preview', () => {
    expect(PREVIEW_SOURCE).toBe('/:locale/preview/:path*');
    // Next dùng path-to-regexp: kiểm tra tương đương bằng regex đơn giản.
    const re = /^\/[^/]+\/preview(\/.*)?$/;
    for (const ok of ['/vi/preview/sheet/abc', '/en/preview/sheet/abc/x']) expect(re.test(ok)).toBe(true);
    for (const no of ['/vi/sheet/abc', '/vi/level/beginner']) expect(re.test(no)).toBe(false);
  });
});
