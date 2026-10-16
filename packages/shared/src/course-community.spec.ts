import { describe, expect, it } from 'vitest';
import { adminCommentsQuerySchema, commentTextSchema, countLinks, createCommentSchema, editCommentSchema, ratingBodySchema } from './courses';

describe('countLinks', () => {
  it('đếm http(s):// và www.', () => {
    expect(countLinks('xem https://a.com và www.b.com, http://c.vn/x')).toBe(3);
    expect(countLinks('không có link')).toBe(0);
  });
});

describe('commentTextSchema', () => {
  it('trim, chuẩn hoá xuống dòng, gộp dòng trống thừa', () => {
    expect(commentTextSchema.parse('  a\r\n\r\n\r\n\r\nb  ')).toBe('a\n\nb');
  });
  it('từ chối rỗng, quá dài, NUL, quá 2 link, không phải chuỗi', () => {
    for (const bad of ['', '   ', 'x'.repeat(1001), 'a\u0000b', 'https://a.com https://b.com https://c.com', 5, null]) {
      expect(commentTextSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
    expect(commentTextSchema.safeParse('x'.repeat(1000)).success).toBe(true);
    expect(commentTextSchema.safeParse('https://a.com www.b.com').success).toBe(true);
  });
  it('giữ nguyên HTML/markdown như văn bản thuần (không xử lý)', () => {
    expect(commentTextSchema.parse('<script>x</script> **b**')).toBe('<script>x</script> **b**');
  });
});

describe('ratingBodySchema / createCommentSchema / editCommentSchema', () => {
  it('sao là số nguyên 1–5', () => {
    for (const ok of [1, 3, 5]) expect(ratingBodySchema.safeParse({ stars: ok }).success).toBe(true);
    for (const bad of [0, 6, 1.5, '3', null, undefined]) expect(ratingBodySchema.safeParse({ stars: bad }).success, String(bad)).toBe(false);
    expect(ratingBodySchema.safeParse({ stars: 3, x: 1 }).success).toBe(false);
  });
  it('parentId tuỳ chọn là uuid; trường thừa bị từ chối', () => {
    expect(createCommentSchema.parse({ body: 'hi' }).parentId).toBeNull();
    expect(createCommentSchema.parse({ body: 'hi', parentId: '0192A000-0000-7000-8000-0000000000A1' }).parentId).toBe('0192a000-0000-7000-8000-0000000000a1');
    expect(createCommentSchema.safeParse({ body: 'hi', parentId: 'x' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ body: 'hi', hidden: true }).success).toBe(false);
    expect(editCommentSchema.safeParse({ body: '' }).success).toBe(false);
  });
});

describe('adminCommentsQuerySchema', () => {
  it('mặc định limit, hidden chuỗi → boolean, lessonId sai bị từ chối', () => {
    expect(adminCommentsQuerySchema.parse({}).limit).toBe(30);
    expect(adminCommentsQuerySchema.parse({ hidden: 'true' }).hidden).toBe(true);
    expect(adminCommentsQuerySchema.safeParse({ hidden: 'yes' }).success).toBe(false);
    expect(adminCommentsQuerySchema.safeParse({ lessonId: 'x' }).success).toBe(false);
    expect(adminCommentsQuerySchema.safeParse({ limit: '100' }).success).toBe(false);
  });
});
