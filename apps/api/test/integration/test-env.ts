import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://piano:piano@localhost:5433/piano_daily_test';

/** URL DB test: env `TEST_DATABASE_URL` (hoặc trong .env của app / gốc repo), mặc định trỏ tới `postgres-test`. */
export function resolveTestDatabaseUrl(): string {
  const apiDir = path.resolve(__dirname, '../..');
  loadDotenv({ path: path.join(apiDir, '.env'), quiet: true });
  loadDotenv({ path: path.join(apiDir, '../../.env'), quiet: true });
  return process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}
