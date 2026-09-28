import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from '../../src/config/env';

const valid = { DATABASE_URL: 'postgresql://piano:piano@localhost:5432/piano_daily' };

describe('validateEnv', () => {
  it('áp dụng giá trị mặc định', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('ép kiểu PORT sang số', () => {
    expect(validateEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });

  it.each([
    ['thiếu hẳn', {}],
    ['rỗng', { DATABASE_URL: '' }],
  ])('DATABASE_URL %s -> lỗi nêu tên biến', (_label, raw) => {
    try {
      validateEnv(raw);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).variables).toEqual(['DATABASE_URL']);
      expect((err as Error).message).toContain('DATABASE_URL (thiếu)');
    }
  });

  it('từ chối URL không phải postgres và không lộ giá trị trong thông báo', () => {
    const secret = 'mysql://root:s3cret@db/x';
    expect(() => validateEnv({ DATABASE_URL: secret })).toThrow(EnvValidationError);
    try {
      validateEnv({ DATABASE_URL: secret });
    } catch (err) {
      expect((err as Error).message).not.toContain('s3cret');
    }
  });

  it('liệt kê mọi biến sai cùng lúc', () => {
    try {
      validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables.sort()).toEqual(['DATABASE_URL', 'LOG_LEVEL', 'PORT']);
    }
  });
});
