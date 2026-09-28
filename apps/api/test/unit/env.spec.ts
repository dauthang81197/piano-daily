import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://piano:piano@localhost:5432/piano_daily',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('áp dụng giá trị mặc định', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('ép kiểu REFRESH_TOKEN_TTL_DAYS và từ chối giá trị không phải số nguyên dương', () => {
    expect(validateEnv({ ...valid, REFRESH_TOKEN_TTL_DAYS: '7' }).REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(validateEnv({ ...valid, REFRESH_TOKEN_TTL_DAYS: '365' }).REFRESH_TOKEN_TTL_DAYS).toBe(365);
    for (const bad of ['0', '-1', '1.5', 'abc', '366', '1e9']) {
      expect(() => validateEnv({ ...valid, REFRESH_TOKEN_TTL_DAYS: bad }), bad).toThrow(EnvValidationError);
    }
  });

  it.each([
    ['thiếu', undefined, 'JWT_ACCESS_SECRET (thiếu)'],
    ['ngắn hơn 32 ký tự', 'short-secret', 'JWT_ACCESS_SECRET'],
    ['là giá trị mẫu change-me…', 'change-me-to-a-random-string-of-at-least-32-chars', 'JWT_ACCESS_SECRET (vẫn là giá trị mẫu'],
  ])('JWT_ACCESS_SECRET %s -> lỗi nêu tên biến, không lộ giá trị', (_label, secret, expected) => {
    try {
      validateEnv({ ...valid, JWT_ACCESS_SECRET: secret });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables).toEqual(['JWT_ACCESS_SECRET']);
      expect((err as Error).message).toContain(expected);
      expect((err as Error).message).not.toContain('short-secret');
      expect((err as Error).message).not.toContain('random-string');
    }
  });

  it('ép kiểu PORT sang số', () => {
    expect(validateEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });

  it.each([
    ['thiếu hẳn', {}],
    ['rỗng', { DATABASE_URL: '' }],
  ])('DATABASE_URL %s -> lỗi nêu tên biến', (_label, raw) => {
    try {
      validateEnv({ JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET, ...raw });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).variables).toEqual(['DATABASE_URL']);
      expect((err as Error).message).toContain('DATABASE_URL (thiếu)');
    }
  });

  it('từ chối URL không phải postgres và không lộ giá trị trong thông báo', () => {
    const secret = 'mysql://root:s3cret@db/x';
    expect(() => validateEnv({ ...valid, DATABASE_URL: secret })).toThrow(EnvValidationError);
    try {
      validateEnv({ ...valid, DATABASE_URL: secret });
    } catch (err) {
      expect((err as Error).message).not.toContain('s3cret');
    }
  });

  it('liệt kê mọi biến sai cùng lúc', () => {
    try {
      validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables.sort()).toEqual([
        'DATABASE_URL',
        'JWT_ACCESS_SECRET',
        'LOG_LEVEL',
        'PORT',
      ]);
    }
  });
});
