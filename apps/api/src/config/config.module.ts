import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ENV_FILE_PATHS, validateEnv } from './env';

/**
 * Nguồn cấu hình duy nhất của API: chỉ đọc env qua ConfigService, đã validate bằng zod.
 * Khi chạy trên host, nạp thêm `.env` của app và `.env` ở gốc repo (không ghi đè biến đã có).
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ENV_FILE_PATHS,
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
