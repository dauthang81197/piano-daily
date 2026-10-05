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
): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_ACCESS_SECRET = TEST_JWT_ACCESS_SECRET;
  process.env.CORS_ADMIN_ORIGIN = TEST_CORS_ADMIN_ORIGIN;
  process.env.CORS_WEB_ORIGIN = TEST_CORS_WEB_ORIGIN;
  process.env.INTERNAL_API_SECRET = TEST_INTERNAL_API_SECRET;
  process.env.VIEW_SALT = TEST_VIEW_SALT;
  Object.assign(process.env, TEST_S3, { S3_PUBLIC_BASE_URL: TEST_S3_PUBLIC_BASE_URL });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/bootstrap.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...extraImports] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
