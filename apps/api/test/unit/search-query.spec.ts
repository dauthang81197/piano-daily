import { describe, expect, it } from 'vitest';
import { buildSearchQuery, parsePublicIdQuery } from '../../src/modules/catalog/search-query';

describe('buildSearchQuery', () => {
  it('một từ: tiền tố; nhiều từ: AND; lowercase', () => {
    expect(buildSearchQuery('Elise')).toBe('elise:*');
    expect(buildSearchQuery('Fur  ELISE')).toBe('fur:* & elise:*');
  });

  it('giữ dấu tiếng Việt (bỏ dấu do SQL đảm nhiệm) và chuẩn hoá NFC', () => {
    expect(buildSearchQuery('Đêm thu')).toBe('đêm:* & thu:*');
    expect(buildSearchQuery('e\u0302m')).toBe('\u00eam:*');
  });

  it('loại mọi ký tự toán tử tsquery và SQL', () => {
    const out = buildSearchQuery("& | ! ( ) :* '; drop table sheets --")!;
    expect(out).toBe('drop:* & table:* & sheets:*');
    expect(out).not.toMatch(/[|!()';]|\\/);
    expect(buildSearchQuery('a\\b')).toBe('a:* & b:*');
  });

  it('không còn từ nào thì null', () => {
    expect(buildSearchQuery('')).toBeNull();
    expect(buildSearchQuery('   ')).toBeNull();
    expect(buildSearchQuery('!!!')).toBeNull();
    expect(buildSearchQuery(':*&|')).toBeNull();
  });

  it('tối đa 8 từ, mỗi từ ≤ 50 ký tự', () => {
    expect(buildSearchQuery('a b c d e f g h i j')).toBe('a:* & b:* & c:* & d:* & e:* & f:* & g:* & h:*');
    expect(buildSearchQuery('x'.repeat(80))).toBe(`${'x'.repeat(50)}:*`);
  });
});

describe('parsePublicIdQuery', () => {
  it('toàn số 1–9 chữ số', () => {
    expect(parsePublicIdQuery('12')).toBe(12);
    expect(parsePublicIdQuery(' 007 ')).toBe(7);
    expect(parsePublicIdQuery('123456789')).toBe(123456789);
  });
  it.each(['', '1234567890', '12a', '1 2', '-1'])('%j -> null', (v) => {
    expect(parsePublicIdQuery(v)).toBeNull();
  });
});
