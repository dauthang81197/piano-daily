import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

/**
 * Dựng app Nest như production (`configureApp`) với DATABASE_URL cho trước.
 * AppModule được nạp động SAU khi đặt env, vì ConfigModule.forRoot validate env ngay lúc
 * module được nạp. Mỗi file test có module graph riêng (Vitest isolate) nên mỗi file dùng một URL.
 */
export async function createApp(databaseUrl: string): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_LEVEL = 'silent';
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/bootstrap.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
