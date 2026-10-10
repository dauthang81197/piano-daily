import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://piano:piano@localhost:5432/piano_daily',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  CORS_ADMIN_ORIGIN: 'http://localhost:3001',
  CORS_WEB_ORIGIN: 'http://localhost:4100',
  INTERNAL_API_SECRET: 'y'.repeat(32),
  VIEW_SALT: 'z'.repeat(32),
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'piano',
  S3_SECRET_ACCESS_KEY: 'piano-secret',
  S3_BUCKET_PUBLIC: 'piano-daily-public',
  S3_BUCKET_PRIVATE: 'piano-daily-private',
  S3_PUBLIC_BASE_URL: 'http://localhost:8333/piano-daily-public',
};

describe('validateEnv', () => {
  it('áp dụng giá trị mặc định', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      REFRESH_TOKEN_TTL_DAYS: 30,
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_AUTO_CREATE_BUCKETS: false,
      PAYPAL_MODE: 'sandbox',
    });
  });

  it('Email: RESEND_API_KEY, EMAIL_FROM, SITE_URL đều tuỳ chọn; SITE_URL phải là URL và bỏ dấu / cuối', () => {
    const env = validateEnv({ ...valid, RESEND_API_KEY: '', EMAIL_FROM: '' });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBeUndefined();
    expect(env.SITE_URL).toBeUndefined();
    expect(
      validateEnv({ ...valid, RESEND_API_KEY: 're_x', EMAIL_FROM: 'Piano <a@b.co>', SITE_URL: 'https://piano.test/' }),
    ).toMatchObject({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Piano <a@b.co>', SITE_URL: 'https://piano.test' });
    expect(() => validateEnv({ ...valid, SITE_URL: 'not a url' })).toThrow(EnvValidationError);
  });

  it('PayPal: PAYPAL_MODE sandbox|live, client id/secret tuỳ chọn', () => {
    expect(() => validateEnv({ ...valid, PAYPAL_MODE: 'live' })).toThrow(EnvValidationError);
    expect(
      validateEnv({ ...valid, PAYPAL_MODE: 'live', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' }).PAYPAL_MODE,
    ).toBe('live');
    expect(validateEnv({ ...valid, PAYPAL_MODE: '' }).PAYPAL_MODE).toBe('sandbox');
    expect(() => validateEnv({ ...valid, PAYPAL_MODE: 'prod' })).toThrow(EnvValidationError);
    const env = validateEnv({ ...valid, PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: '' });
    expect(env.PAYPAL_CLIENT_ID).toBe('id');
    expect(env.PAYPAL_CLIENT_SECRET).toBeUndefined();
  });

  it('WEB_INTERNAL_URL: tuỳ chọn, bỏ / cuối, từ chối URL sai', () => {
    expect(validateEnv(valid).WEB_INTERNAL_URL).toBeUndefined();
    expect(validateEnv({ ...valid, WEB_INTERNAL_URL: '' }).WEB_INTERNAL_URL).toBeUndefined();
    expect(validateEnv({ ...valid, WEB_INTERNAL_URL: 'http://web:4100/' }).WEB_INTERNAL_URL).toBe('http://web:4100');
    expect(() => validateEnv({ ...valid, WEB_INTERNAL_URL: 'web:4100' })).toThrow(EnvValidationError);
  });

  it('S3: cờ boolean, bỏ / cuối của S3_PUBLIC_BASE_URL', () => {
    const env = validateEnv({
      ...valid,
      S3_FORCE_PATH_STYLE: 'false',
      S3_AUTO_CREATE_BUCKETS: 'TRUE',
      S3_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    });
    expect(env).toMatchObject({ S3_FORCE_PATH_STYLE: false, S3_AUTO_CREATE_BUCKETS: true, S3_PUBLIC_BASE_URL: 'https://cdn.example.com' });
    expect(validateEnv({ ...valid, S3_AUTO_CREATE_BUCKETS: '1' }).S3_AUTO_CREATE_BUCKETS).toBe(true);
    expect(validateEnv({ ...valid, S3_AUTO_CREATE_BUCKETS: '' }).S3_AUTO_CREATE_BUCKETS).toBe(false);
  });

  it.each([
    ['S3_AUTO_CREATE_BUCKETS', 'maybe'],
    ['S3_FORCE_PATH_STYLE', 'x'],
    ['S3_ENDPOINT', 'localhost:8333'],
    ['S3_PUBLIC_BASE_URL', 'ftp://x'],
    ['S3_BUCKET_PUBLIC', 'Bad_Bucket'],
    ['S3_SECRET_ACCESS_KEY', ''],
    ['S3_BUCKET_PRIVATE', 'piano-daily-public'],
  ])('%s = %j -> lỗi nêu tên biến, không lộ giá trị', (variable, value) => {
    try {
      validateEnv({ ...valid, [variable]: value });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables).toEqual([variable]);
      if (value) expect((err as Error).message).not.toContain(value);
    }
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

  it('CORS_ADMIN_ORIGIN chuẩn hoá về origin (bỏ path và dấu / cuối)', () => {
    expect(validateEnv({ ...valid, CORS_ADMIN_ORIGIN: 'https://admin.example.com/' }).CORS_ADMIN_ORIGIN).toBe(
      'https://admin.example.com',
    );
    expect(validateEnv({ ...valid, CORS_ADMIN_ORIGIN: 'http://localhost:3001/login' }).CORS_ADMIN_ORIGIN).toBe(
      'http://localhost:3001',
    );
  });

  it.each([
    ['thiếu', undefined, 'CORS_ADMIN_ORIGIN (thiếu)'],
    ['không phải URL', 'localhost:3001', 'CORS_ADMIN_ORIGIN'],
    ['không phải http(s)', 'ftp://admin.example.com', 'CORS_ADMIN_ORIGIN'],
  ])('CORS_ADMIN_ORIGIN %s -> lỗi nêu tên biến', (_label, origin, expected) => {
    try {
      validateEnv({ ...valid, CORS_ADMIN_ORIGIN: origin });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables).toEqual(['CORS_ADMIN_ORIGIN']);
      expect((err as Error).message).toContain(expected);
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
      const { DATABASE_URL: _omit, ...rest } = valid;
      validateEnv({ ...rest, ...raw });
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
      const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_PUBLIC, S3_BUCKET_PRIVATE, S3_PUBLIC_BASE_URL } = valid;
      const s3 = { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_PUBLIC, S3_BUCKET_PRIVATE, S3_PUBLIC_BASE_URL };
      validateEnv({ ...s3, PORT: 'abc', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables.sort()).toEqual([
        'CORS_ADMIN_ORIGIN',
        'CORS_WEB_ORIGIN',
        'DATABASE_URL',
        'INTERNAL_API_SECRET',
        'JWT_ACCESS_SECRET',
        'LOG_LEVEL',
        'PORT',
        'VIEW_SALT',
      ]);
    }
  });
});

describe('validateEnv — NODE_ENV=production', () => {
  const prod = {
    ...valid,
    NODE_ENV: 'production',
    PAYPAL_CLIENT_ID: 'id',
    PAYPAL_CLIENT_SECRET: 'paypal-secret',
    PAYPAL_WEBHOOK_ID: 'wh',
    RESEND_API_KEY: 're_x',
    EMAIL_FROM: 'Piano <a@b.co>',
  };

  it('đủ secret thì khởi động', () => {
    expect(validateEnv(prod).NODE_ENV).toBe('production');
  });

  it.each(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'RESEND_API_KEY', 'EMAIL_FROM'])(
    'thiếu %s -> lỗi nêu đúng tên biến',
    (variable) => {
      for (const value of [undefined, '']) {
        try {
          validateEnv({ ...prod, [variable]: value });
          expect.unreachable();
        } catch (err) {
          expect((err as EnvValidationError).variables).toEqual([variable]);
          expect((err as Error).message).toContain(`${variable} (thiếu)`);
        }
      }
    },
  );

  it.each(['JWT_ACCESS_SECRET', 'INTERNAL_API_SECRET', 'VIEW_SALT', 'S3_ENDPOINT', 'S3_SECRET_ACCESS_KEY'])(
    'thiếu %s -> lỗi nêu đúng tên biến',
    (variable) => {
      try {
        validateEnv({ ...prod, [variable]: undefined });
        expect.unreachable();
      } catch (err) {
        expect((err as EnvValidationError).variables).toEqual([variable]);
      }
    },
  );

  it('liệt kê mọi biến thiếu cùng lúc', () => {
    try {
      validateEnv({ ...valid, NODE_ENV: 'production' });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables.sort()).toEqual([
        'EMAIL_FROM',
        'PAYPAL_CLIENT_ID',
        'PAYPAL_CLIENT_SECRET',
        'PAYPAL_WEBHOOK_ID',
        'RESEND_API_KEY',
      ]);
    }
  });

  it('ngoài production vẫn tuỳ chọn', () => {
    for (const NODE_ENV of ['development', 'test']) {
      expect(() => validateEnv({ ...valid, NODE_ENV })).not.toThrow();
    }
  });
});

describe('validateEnv — INTERNAL_API_SECRET, VIEW_SALT và CORS_WEB_ORIGIN', () => {
  it.each([
    ['INTERNAL_API_SECRET', ''],
    ['INTERNAL_API_SECRET', 'short'],
    ['INTERNAL_API_SECRET', `change-me-${'x'.repeat(40)}`],
    ['VIEW_SALT', ''],
    ['VIEW_SALT', 'short'],
    ['VIEW_SALT', `change-me-${'x'.repeat(40)}`],
    ['CORS_WEB_ORIGIN', ''],
    ['CORS_WEB_ORIGIN', 'localhost:4100'],
  ])('%s = %j -> lỗi nêu tên biến, không lộ giá trị', (variable, value) => {
    try {
      validateEnv({ ...valid, [variable]: value });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvValidationError).variables).toEqual([variable]);
      if (value) expect((err as Error).message).not.toContain(value);
    }
  });

  it('chuẩn hoá CORS_WEB_ORIGIN về origin', () => {
    expect(validateEnv({ ...valid, CORS_WEB_ORIGIN: 'http://localhost:4100/abc/' }).CORS_WEB_ORIGIN).toBe(
      'http://localhost:4100',
    );
  });
});
