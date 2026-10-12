import { describe, expect, it } from 'vitest';
import {
  AD_HTML_MAX,
  AD_ITEMS_MAX,
  AD_LABEL_MAX,
  AD_PLATFORM_LABELS,
  AdPlatform,
  AdPosition,
  adSlotSchema,
  createAdSlotBodySchema,
  hasAdContent,
  isAdUrl,
  publicAdSlotSchema,
  setAdSlotActiveBodySchema,
  updateAdSlotBodySchema,
} from './ads';

const item = (over: Record<string, unknown> = {}) => ({
  platform: 'SHOPEE',
  image: 'https://cdn.example.com/a.webp',
  link: 'https://s.shopee.vn/abc',
  ...over,
});

describe('isAdUrl', () => {
  it('chỉ nhận https không có thông tin đăng nhập', () => {
    expect(isAdUrl('https://example.com/a.png')).toBe(true);
    expect(isAdUrl('http://example.com')).toBe(false);
    expect(isAdUrl('javascript:alert(1)')).toBe(false);
    expect(isAdUrl('https://u:p@example.com')).toBe(false);
    expect(isAdUrl('not a url')).toBe(false);
    expect(isAdUrl(`https://example.com/${'a'.repeat(2048)}`)).toBe(false);
    expect(isAdUrl('https:example.com')).toBe(false);
  });
});

describe('AdPlatform', () => {
  it('có nhãn hiển thị cho mọi nền tảng', () => {
    expect(Object.keys(AD_PLATFORM_LABELS).sort()).toEqual(Object.values(AdPlatform).sort());
  });
});

describe('createAdSlotBodySchema', () => {
  it('nhận slot html', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: '<b>x</b>' }).success).toBe(true);
  });

  it('nhận slot nhiều sản phẩm, nhãn rỗng thành null', () => {
    const r = createAdSlotBodySchema.parse({
      position: AdPosition.IN_LIST,
      items: [item(), item({ platform: 'TIKTOK', label: '  ' }), item({ platform: 'OTHER', label: 'Đàn điện' })],
    });
    expect(r.items).toHaveLength(3);
    expect(r.items[1]!.label).toBeNull();
    expect(r.items[2]!.label).toBe('Đàn điện');
  });

  it('từ chối slot không có nội dung', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER' }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: '  ', items: [] }).success).toBe(false);
  });

  it('từ chối URL không phải https, thiếu ảnh/link, nền tảng và vị trí lạ', () => {
    const bad = (over: Record<string, unknown>) =>
      createAdSlotBodySchema.safeParse({ position: 'HEADER', items: [item(over)] }).success;
    expect(bad({ image: 'http://a.example/x.png' })).toBe(false);
    expect(bad({ link: 'javascript:1' })).toBe(false);
    expect(bad({ image: '' })).toBe(false);
    expect(bad({ link: undefined })).toBe(false);
    expect(bad({ platform: 'FACEBOOK' })).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'FOO', htmlCode: 'x' }).success).toBe(false);
  });

  it(`tối đa ${AD_ITEMS_MAX} sản phẩm, nhãn tối đa ${AD_LABEL_MAX} ký tự, html tối đa ${AD_HTML_MAX}`, () => {
    const many = (n: number) => ({ position: 'HEADER', items: Array.from({ length: n }, () => item()) });
    expect(createAdSlotBodySchema.safeParse(many(AD_ITEMS_MAX)).success).toBe(true);
    expect(createAdSlotBodySchema.safeParse(many(AD_ITEMS_MAX + 1)).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', items: [item({ label: 'a'.repeat(AD_LABEL_MAX + 1) })] }).success).toBe(false);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: 'a'.repeat(AD_HTML_MAX) }).success).toBe(true);
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', htmlCode: 'a'.repeat(AD_HTML_MAX + 1) }).success).toBe(false);
  });

  it('id sản phẩm (nếu có) phải là uuid', () => {
    expect(createAdSlotBodySchema.safeParse({ position: 'HEADER', items: [item({ id: 'abc' })] }).success).toBe(false);
  });
});

describe('updateAdSlotBodySchema / setAdSlotActiveBodySchema', () => {
  it('update cần nội dung; chuỗi rỗng thành null', () => {
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '', items: [] }).success).toBe(false);
    const r = updateAdSlotBodySchema.parse({ htmlCode: '', items: [item()] });
    expect(r.htmlCode).toBeNull();
  });

  it('PATCH thiếu khoá bị từ chối, rỗng thì hợp lệ khi vẫn còn nội dung', () => {
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '<b>x</b>' }).success).toBe(false);
    expect(updateAdSlotBodySchema.safeParse({ items: [item()] }).success).toBe(false);
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: '<b>x</b>', items: [] }).success).toBe(true);
    expect(updateAdSlotBodySchema.safeParse({ htmlCode: null, items: [item({ id: '0192a000-0000-7000-8000-000000000001' })] }).success).toBe(true);
  });

  it('active cần boolean', () => {
    expect(setAdSlotActiveBodySchema.safeParse({ isActive: true }).success).toBe(true);
    expect(setAdSlotActiveBodySchema.safeParse({ isActive: 'true' }).success).toBe(false);
  });
});

describe('hasAdContent', () => {
  it('html hoặc ít nhất một sản phẩm', () => {
    expect(hasAdContent({ htmlCode: '<b>x</b>' })).toBe(true);
    expect(hasAdContent({ htmlCode: ' ', items: [] })).toBe(false);
    expect(hasAdContent({ items: [{}] })).toBe(true);
  });
});

describe('schema trả về', () => {
  it('slot công khai không có số lượt bấm; admin có', () => {
    const pub = publicAdSlotSchema.parse({
      position: 'HEADER',
      htmlCode: null,
      items: [{ id: 'i1', platform: 'LAZADA', image: 'https://a.test/i.png', link: 'https://a.test', label: null, clicks7d: 9 }],
    });
    expect(JSON.stringify(pub)).not.toContain('clicks');
    const admin = adSlotSchema.parse({
      id: 's1',
      position: 'HEADER',
      htmlCode: null,
      items: [{ id: 'i1', platform: 'LAZADA', image: 'https://a.test/i.png', link: 'https://a.test', label: null, clicks7d: 1, clicks30d: 2, clicksTotal: 3 }],
      isActive: true,
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
    });
    expect(admin.items[0]!.clicksTotal).toBe(3);
  });
});
