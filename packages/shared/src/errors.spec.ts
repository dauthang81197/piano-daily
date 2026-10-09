import { describe, expect, it } from 'vitest';
import { ErrorCode, errorResponseSchema } from './errors';

describe('errorResponseSchema', () => {
  it('chấp nhận lỗi đúng định dạng với mã trong danh mục', () => {
    const body = { error: { code: ErrorCode.NOT_FOUND, message: 'Không tìm thấy.' } };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('từ chối mã lỗi ngoài danh mục', () => {
    const result = errorResponseSchema.safeParse({ error: { code: 'SOMETHING_ELSE', message: 'x' } });
    expect(result.success).toBe(false);
  });
});

describe('mã lỗi thanh toán (Story 3.3)', () => {
  it('có PRICE_CHANGED và PAYMENTS_DISABLED', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'PRICE_CHANGED', message: 'x', details: {} } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'PAYMENTS_DISABLED', message: 'x' } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'PAYMENT_DECLINED', message: 'x' } }).success).toBe(true);
  });
});
