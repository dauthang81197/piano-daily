import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 không tự nạp .env: nạp .env của app rồi .env ở gốc repo (không ghi đè biến đã có).
loadDotenv({ path: path.join(__dirname, '.env'), quiet: true });
loadDotenv({ path: path.join(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma/migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` không cần URL; `migrate deploy` sẽ báo lỗi rõ nếu thiếu.
    url: process.env.DATABASE_URL ?? '',
  },
});
