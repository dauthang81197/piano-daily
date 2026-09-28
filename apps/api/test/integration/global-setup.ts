import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveTestDatabaseUrl } from './test-env';

/** Migrate DB test trước khi chạy integration test (giống `start` của production). */
export default function setup(): void {
  const apiDir = path.resolve(__dirname, '../..');
  const url = resolveTestDatabaseUrl();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
