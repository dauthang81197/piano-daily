import { describe, expect, it } from 'vitest';
import { formatUsd, MAX_PRICE_CENTS, parseUsdToCents, priceCentsSchema, quoteSchema } from './pricing';
import { createSheetSchema, updateSheetSchema } from './sheet';

describe('parseUsdToCents', () => {
  it.each([
    ['4.99', 499],
    ['5', 500],
    ['0.5', 50],
    ['0', 0],
    ['1000', MAX_PRICE_CENTS],
    ['1000.00', MAX_PRICE_CENTS],
    ['  2.10 ', 210],
    ['19.99', 1999],
  ])('%s -> %i cents', (input, cents) => expect(parseUsdToCents(input)).toBe(cents));

  it('ô trống là null', () => {
    expect(parseUsdToCents('')).toBeNull();
    expect(parseUsdToCents('   ')).toBeNull();
  });

  it.each(['4,5', '-1', '1.234', '1000.01', '1001', 'abc', '1e3', '.5', '5.'])('%s không hợp lệ', (input) =>
    expect(parseUsdToCents(input)).toBeUndefined(),
  );
});

describe('formatUsd', () => {
  it.each([
    [499, '4.99'],
    [500, '5.00'],
    [5, '0.05'],
    [0, '0.00'],
    [MAX_PRICE_CENTS, '1000.00'],
  ])('%i -> %s', (cents, text) => expect(formatUsd(cents)).toBe(text));

  it('đảo ngược parse', () => {
    for (const cents of [0, 1, 99, 100, 1999, MAX_PRICE_CENTS]) {
      expect(parseUsdToCents(formatUsd(cents))).toBe(cents);
    }
  });
});

describe('priceCentsSchema', () => {
  it('chỉ nhận số nguyên 0..MAX', () => {
    expect(priceCentsSchema.safeParse(0).success).toBe(true);
    expect(priceCentsSchema.safeParse(MAX_PRICE_CENTS).success).toBe(true);
    for (const bad of [-1, 1.5, MAX_PRICE_CENTS + 1, '5', Number.NaN]) {
      expect(priceCentsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('DTO Sheet có trường giá', () => {
  const base = { title: 'A', composerId: '01920000-0000-7000-8000-000000000001', level: 'BEGINNER' };
  it('create/update nhận giá cents, isFree và null', () => {
    const body = { pricePdfCents: 299, priceBundleCents: null, isFree: true };
    expect(createSheetSchema.parse({ ...base, ...body })).toMatchObject(body);
    expect(updateSheetSchema.parse(body)).toMatchObject(body);
  });
  it('từ chối giá float / âm / quá trần', () => {
    for (const price of [2.5, -1, MAX_PRICE_CENTS + 1]) {
      expect(updateSheetSchema.safeParse({ pricePdfCents: price }).success).toBe(false);
    }
  });
});

describe('quoteSchema', () => {
  it('bundle cần ít nhất 2 type', () => {
    const base = { sheetId: 's', currency: 'USD', free: false, items: [{ fileType: 'PDF', priceCents: 100 }] };
    expect(quoteSchema.safeParse({ ...base, bundle: null }).success).toBe(true);
    expect(quoteSchema.safeParse({ ...base, bundle: { priceCents: 100, fileTypes: ['PDF'] } }).success).toBe(false);
  });
});
