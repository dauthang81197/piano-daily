import { describe, expect, it } from 'vitest';
import { createDonorBodySchema, updateDonorBodySchema } from './donor';

describe('createDonorBodySchema', () => {
  it('chỉ cần tên; cắt khoảng trắng', () => {
    expect(createDonorBodySchema.parse({ name: '  Lan  ' })).toEqual({ name: 'Lan' });
  });

  it('nhận số tiền, lời nhắn, ngày; lời nhắn rỗng thành null', () => {
    const body = createDonorBodySchema.parse({ name: 'An', amount: 50000, message: ' ', donatedAt: '2026-10-01', isVisible: false });
    expect(body).toEqual({ name: 'An', amount: 50000, message: null, donatedAt: '2026-10-01', isVisible: false });
  });

  it.each([
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(81) },
    { name: 'An', amount: -1 },
    { name: 'An', amount: 0 },
    { name: 'An', amount: 1.5 },
    { name: 'An', amount: 3_000_000_000 },
    { name: 'An', message: 'x'.repeat(201) },
    { name: 'An', donatedAt: '01/10/2026' },
    { name: 'An', extra: 1 },
  ])('từ chối %j', (input) => {
    expect(createDonorBodySchema.safeParse(input).success).toBe(false);
  });
});

describe('updateDonorBodySchema', () => {
  it('cho phép xoá số tiền bằng null', () => {
    expect(updateDonorBodySchema.parse({ amount: null })).toEqual({ amount: null });
  });

  it('từ chối body rỗng', () => {
    expect(updateDonorBodySchema.safeParse({}).success).toBe(false);
  });
});
