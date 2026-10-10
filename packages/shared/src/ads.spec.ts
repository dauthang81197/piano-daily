import { describe, expect, it } from 'vitest';
import {
  AD_HTML_MAX,
  AdPosition,
  createAdSlotBodySchema,
  isAdUrl,
  setAdSlotActiveBodySchema,
  updateAdSlotBodySchema,
} from './ads';

describe('isAdUrl', () => {
  it('chỉ nhận https không có thông tin đăng nhập', () => {
    expect(isAdUrl('https://example.com/a.png')).toBe(true);
    expect(isAdUrl('http://example.com')).toBe(false);
    expect(isAdUrl('javascript:alert(1)')).toBe(false);
    expect(isAdUrl('https://u:p@example.com')).toBe(false);
    expect(isAdUrl('not a url')).toBe(false);
    expect(isAdUrl(`https://example.com/${'a'.repeat(2048)}`)).toBe(false);
  });
});

describe('createAdSlotBodySchema', () => {
  it('nhận slot html', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: '<b>x</b>' }).success).toBe(true);
  });

  it('nhận slot ảnh + link', () => {
    const r = createAdSlotBodySchema.safeParse({
      position: AdPosition.SIDEBAR_LEFT,
      image: 'https://cdn.example.com/a.png',
      link: 'https://example.com',
    });
    expect(r.success).toBe(true);
  });

  it('từ chối khi thiếu nội dung', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER' }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: '  ' }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', image: 'https://a.example/x.png' }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', link: 'https://a.example' }).success).toBe(false);
  });

  it('từ chối URL không phải https và vị trí lạ', () => {
    const base = { position: 'HEADER', image: 'http://a.example/x.png', link: 'https://a.example' };
    expect(createAdSlotBodySchema.safeParse(base).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ ...base, image: 'https://a.example/x.png', link: 'javascript:1' }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'FOO', htmlCode: 'x' }).success).toBe(false);
  });

  it('html tối đa 20000 ký tự', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: 'a'.repeat(AD_HTML_MAX) }).success).toBe(true);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: 'a'.repeat(AD_HTML_MAX + 1) }).success).toBe(false);
  });
});

describe('updateAdSlotBodySchema / setAdSlotActiveBodySchema', () => {
  it('update cần nội dung; chuỗi rỗng thành null', () => {
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '', image: '', link: '' }).success).toBe(false);
    const r = updateAdSlotBodySchema.parse({ htmlCode: '<i>x</i>', image: '', link: '' });
    expect(r.image).toBeNull();
  });

  it('active cần boolean', () => {
    expect(setAdSlotActiveBodySchema.safeParse({ isActive: true }).success).toBe(true);
    expect(setAdSlotActiveBodySchema.safeParse({ isActive: 'true' }).success).toBe(false);
  });
});

describe('ads: ràng buộc bổ sung sau review', () => {
  it('isAdUrl từ chối https không có //', () => {
    expect(isAdUrl('https:example.com')).toBe(false);
    expect(isAdUrl('https://example.com/a')).toBe(true);
  });

  it('một nửa cặp image/link bị từ chối kể cả khi đã có htmlCode', () => {
    const r = createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: '<b>x</b>', image: 'https://a.test/i.png' });
    expect(r.success).toBe(false);
  });

  it('PATCH thiếu khoá bị từ chối, null/rỗng thì hợp lệ', () => {
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '<b>x</b>' }).success).toBe(false);
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '<b>x</b>', image: null, link: '' }).success).toBe(true);
  });
});
