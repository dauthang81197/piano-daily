import { describe, expect, it } from 'vitest';
import { bulkPriceApplySchema, bulkPricePreviewSchema } from './bulk-pricing';

const ID = '01920000-0000-7000-8000-000000000000';

describe('bulkPricePreviewSchema', () => {
  it('cần ít nhất một tiêu chí', () => {
    expect(bulkPricePreviewSchema.safeParse({ filter: {} }).success).toBe(false);
  });
  it('nhận Level + Genre', () => {
    expect(bulkPricePreviewSchema.safeParse({ filter: { level: 'BEGINNER', genreId: ID } }).success).toBe(true);
  });
  it('từ chối key lạ và Level sai', () => {
    expect(bulkPricePreviewSchema.safeParse({ filter: { level: 'X' } }).success).toBe(false);
    expect(bulkPricePreviewSchema.safeParse({ filter: { level: 'BEGINNER', all: true } }).success).toBe(false);
  });
});

describe('bulkPriceApplySchema', () => {
  const filter = { level: 'BEGINNER' };
  it('chỉ giá PDF: các ô khác vắng mặt, freeMode mặc định KEEP', () => {
    const r = bulkPriceApplySchema.parse({ filter, changes: { pricePdfCents: 300 }, expectedCount: 2 });
    expect(r.changes).toEqual({ freeMode: 'KEEP', pricePdfCents: 300 });
  });
  it('không nhập gì và Giữ nguyên bị từ chối', () => {
    expect(bulkPriceApplySchema.safeParse({ filter, changes: {}, expectedCount: 1 }).success).toBe(false);
  });
  it('chế độ Miễn phí không cần giá', () => {
    expect(bulkPriceApplySchema.safeParse({ filter, changes: { freeMode: 'FREE' }, expectedCount: 1 }).success).toBe(true);
  });
  it('giá ngoài khoảng, không nguyên hoặc null bị từ chối', () => {
    for (const bad of [100001, -1, 1.5, null]) {
      expect(bulkPriceApplySchema.safeParse({ filter, changes: { pricePdfCents: bad }, expectedCount: 1 }).success).toBe(false);
    }
  });
  it('giá 0 hợp lệ', () => {
    expect(bulkPriceApplySchema.safeParse({ filter, changes: { priceMp3Cents: 0 }, expectedCount: 1 }).success).toBe(true);
  });
  it('thiếu tiêu chí hoặc expectedCount bị từ chối', () => {
    expect(bulkPriceApplySchema.safeParse({ filter: {}, changes: { pricePdfCents: 1 }, expectedCount: 1 }).success).toBe(false);
    expect(bulkPriceApplySchema.safeParse({ filter, changes: { pricePdfCents: 1 } }).success).toBe(false);
  });
});
