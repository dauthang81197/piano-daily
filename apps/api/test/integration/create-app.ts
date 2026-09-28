import 'reflect-metadata';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

export const TEST_JWT_ACCESS_SECRET = 'test-only-jwt-access-secret-0123456789abcdef';
export const TEST_CORS_ADMIN_ORIGIN = 'http://admin.piano-daily.test:3001';

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
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/bootstrap.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...extraImports] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
