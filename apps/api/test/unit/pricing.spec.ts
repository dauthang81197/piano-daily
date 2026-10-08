import { describe, expect, it } from 'vitest';
import { computeQuote, isMonetisable, type PriceColumns } from '../../src/modules/catalog/pricing.service';

const PRICES: PriceColumns = {
  isFree: false,
  pricePdfCents: 299,
  priceMidiCents: 199,
  priceMp3Cents: 199,
  priceBundleCents: 499,
};
const ALL = new Set(['PDF', 'MIDI', 'MP3']);

describe('computeQuote (AD-17)', () => {
  it('đủ 3 type: 3 mục và bundle gồm cả 3', () => {
    const q = computeQuote('s', PRICES, ALL);
    expect(q.items).toEqual([
      { fileType: 'PDF', priceCents: 299 },
      { fileType: 'MIDI', priceCents: 199 },
      { fileType: 'MP3', priceCents: 199 },
    ]);
    expect(q.bundle).toEqual({ priceCents: 499, fileTypes: ['PDF', 'MIDI', 'MP3'] });
    expect(q).toMatchObject({ currency: 'USD', free: false });
  });

  it('thiếu file MP3: MP3 bị loại dù có giá, bundle gồm PDF+MIDI', () => {
    const q = computeQuote('s', PRICES, new Set(['PDF', 'MIDI']));
    expect(q.items.map((i) => i.fileType)).toEqual(['PDF', 'MIDI']);
    expect(q.bundle?.fileTypes).toEqual(['PDF', 'MIDI']);
  });

  it('chỉ 1 type mua được: không có bundle dù có giá bundle', () => {
    const q = computeQuote('s', PRICES, new Set(['PDF']));
    expect(q.items).toHaveLength(1);
    expect(q.bundle).toBeNull();
  });

  it('Sheet free: free, không mục, không bundle, bỏ qua giá riêng', () => {
    const q = computeQuote('s', { ...PRICES, isFree: true }, ALL);
    expect(q).toEqual({ sheetId: 's', currency: 'USD', free: true, items: [], bundle: null });
  });

  it('giá 0 hoặc null: type bị loại', () => {
    const q = computeQuote('s', { ...PRICES, pricePdfCents: 0, priceMidiCents: null }, ALL);
    expect(q.items.map((i) => i.fileType)).toEqual(['MP3']);
    expect(q.bundle).toBeNull();
  });

  it('giá bundle 0/null: không bundle', () => {
    expect(computeQuote('s', { ...PRICES, priceBundleCents: 0 }, ALL).bundle).toBeNull();
    expect(computeQuote('s', { ...PRICES, priceBundleCents: null }, ALL).bundle).toBeNull();
  });
});

describe('isMonetisable', () => {
  it('free hoặc có ít nhất một mục', () => {
    expect(isMonetisable(computeQuote('s', { ...PRICES, isFree: true }, new Set()))).toBe(true);
    expect(isMonetisable(computeQuote('s', PRICES, new Set(['MP3'])))).toBe(true);
    expect(isMonetisable(computeQuote('s', PRICES, new Set()))).toBe(false);
    expect(isMonetisable(computeQuote('s', { ...PRICES, pricePdfCents: null }, new Set(['PDF'])))).toBe(false);
  });
});
