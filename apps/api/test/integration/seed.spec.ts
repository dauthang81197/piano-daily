import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/client';
import { resolveTestDatabaseUrl } from './test-env';

const apiDir = path.resolve(__dirname, '../..');
const tsxBin = path.join(apiDir, 'node_modules/.bin/tsx');

/** Chạy `tsx prisma/seed.ts` với env tối thiểu (không kế thừa ADMIN_* từ shell/.env của dev). */
function runSeed(env: Record<string, string>) {
  return spawnSync(tsxBin, ['prisma/seed.ts'], {
    cwd: apiDir,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('prisma/seed.ts (db:seed)', () => {
  const url = resolveTestDatabaseUrl();
  const baseEnv = {
    DATABASE_URL: url,
    ADMIN_EMAIL: '  Founder@Piano-Daily.TEST ',
    ADMIN_PASSWORD: 'seed-password-123',
    ADMIN_NAME: 'Founder',
  };
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('idempotent: chạy 2 lần -> một SUPER_ADMIN, email chữ thường, không đổi mật khẩu', async () => {
    const first = runSeed(baseEnv);
    expect(first.status, first.stderr).toBe(0);
    const [created] = await prisma.user.findMany();
    expect(created).toMatchObject({ email: 'founder@piano-daily.test', role: 'SUPER_ADMIN', isActive: true });

    const second = runSeed({ ...baseEnv, ADMIN_PASSWORD: 'another-password-456' });
    expect(second.status, second.stderr).toBe(0);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]?.passwordHash).toBe(created?.passwordHash);
    // Log không chứa email đầy đủ hay mật khẩu.
    expect(first.stdout + second.stdout).not.toMatch(/founder@|seed-password|another-password/i);
  });

  it('user đã tồn tại nhưng bị vô hiệu -> cảnh báo, không sửa', async () => {
    runSeed(baseEnv);
    await prisma.user.updateMany({ data: { isActive: false } });
    const result = runSeed(baseEnv);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('CẢNH BÁO');
    expect((await prisma.user.findMany())[0]?.isActive).toBe(false);
  });

  it('thiếu ADMIN_EMAIL -> thoát mã ≠ 0, nêu tên biến, không tạo user', async () => {
    // Rỗng thay vì bỏ hẳn: dotenv không ghi đè biến đã có, nên ADMIN_EMAIL trong .env của dev không lọt vào.
    const result = runSeed({ ...baseEnv, ADMIN_EMAIL: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ADMIN_EMAIL (thiếu)');
    expect(await prisma.user.count()).toBe(0);
  });

  it('ADMIN_PASSWORD là giá trị mẫu change-me… -> bị từ chối', async () => {
    const result = runSeed({ ...baseEnv, ADMIN_PASSWORD: 'change-me-please' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ADMIN_PASSWORD');
    expect(await prisma.user.count()).toBe(0);
  });
});
