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
