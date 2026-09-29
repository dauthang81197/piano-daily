import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Trịnh Công Sơn', 'trinh-cong-son'],
    ['Trinh Cong Son', 'trinh-cong-son'],
    ['Đàn Đá Đường Phố', 'dan-da-duong-pho'],
    ['  Nhạc   Phim -- OST!  ', 'nhac-phim-ost'],
    ['Chopin: Nocturne Op.9 No.2', 'chopin-nocturne-op-9-no-2'],
    ['Ả Ờ Ữ Ỵ ệ', 'a-o-u-y-e'],
    ['Beyoncé & Jay-Z', 'beyonce-jay-z'],
    ['!!!', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('chỉ gồm [a-z0-9-], tối đa 80 ký tự, không kết thúc bằng "-"', () => {
    const slug = slugify(`${'a'.repeat(79)} bbbb`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug).toBe('a'.repeat(79));
  });
});
