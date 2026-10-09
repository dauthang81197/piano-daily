import 'reflect-metadata';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

export const TEST_JWT_ACCESS_SECRET = 'test-only-jwt-access-secret-0123456789abcdef';
export const TEST_CORS_ADMIN_ORIGIN = 'http://admin.piano-daily.test:3001';
export const TEST_CORS_WEB_ORIGIN = 'http://web.piano-daily.test:3000';
export const TEST_INTERNAL_API_SECRET = 'test-only-internal-api-secret-0123456789abcdef';
export const TEST_VIEW_SALT = 'test-only-view-salt-0123456789abcdef0123';

/**
 * S3 cho integration test: SeaweedFS local (`docker compose up -d seaweedfs`) với bucket riêng
 * `piano-daily-test-public/private` (tự tạo lúc khởi động). Ghi đè bằng `TEST_S3_ENDPOINT` nếu cần.
 */
export const TEST_S3 = {
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT || 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID || 'piano',
  S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY || 'piano-secret',
  S3_BUCKET_PUBLIC: 'piano-daily-test-public',
  S3_BUCKET_PRIVATE: 'piano-daily-test-private',
  S3_FORCE_PATH_STYLE: 'true',
  S3_AUTO_CREATE_BUCKETS: 'true',
} as const;
export const TEST_S3_PUBLIC_BASE_URL = `${TEST_S3.S3_ENDPOINT}/${TEST_S3.S3_BUCKET_PUBLIC}`;

/**
 * Dựng app Nest như production (`configureApp`) với DATABASE_URL cho trước.
 * AppModule được nạp động SAU khi đặt env, vì ConfigModule.forRoot validate env ngay lúc
 * module được nạp. Mỗi file test có module graph riêng (Vitest isolate) nên mỗi file dùng một URL.
 */
export async function createApp(
  databaseUrl: string,
  extraImports: (Type | DynamicModule)[] = [],
  /** Thay provider của module bằng giá trị giả (vd. `PAYMENT_PROVIDER`): `extraImports` không ghi đè được provider có sẵn. */
  overrides: { token: unknown; value: unknown }[] = [],
  /** Biến môi trường bổ sung (vd. `PAYPAL_WEBHOOK_ID`), đặt SAU các giá trị mặc định ở trên. */
  env: Record<string, string> = {},
): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_ACCESS_SECRET = TEST_JWT_ACCESS_SECRET;
  process.env.CORS_ADMIN_ORIGIN = TEST_CORS_ADMIN_ORIGIN;
  process.env.CORS_WEB_ORIGIN = TEST_CORS_WEB_ORIGIN;
  process.env.INTERNAL_API_SECRET = TEST_INTERNAL_API_SECRET;
  process.env.VIEW_SALT = TEST_VIEW_SALT;
  // PayPal: test không bao giờ gọi PayPal thật; để trống client id/secret (adapter thật sẽ trả 503).
  process.env.PAYPAL_MODE = 'sandbox';
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.PAYPAL_WEBHOOK_ID;
  // Email: test không gửi thật; thay EMAIL_PORT bằng bản giả khi cần (overrides). Để trống thì adapter thật bỏ qua.
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.SITE_URL;
  Object.assign(process.env, env);
  Object.assign(process.env, TEST_S3, { S3_PUBLIC_BASE_URL: TEST_S3_PUBLIC_BASE_URL });
  const { AppModule } = await import('../../src/app.module.js');
  const { APP_OPTIONS, configureApp } = await import('../../src/bootstrap.js');
  let builder = Test.createTestingModule({ imports: [AppModule, ...extraImports] });
  for (const { token, value } of overrides) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true, ...APP_OPTIONS });
  configureApp(app);
  await app.init();
  return app;
}
