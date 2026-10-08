import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/client';
import { computeQuote } from '../../src/modules/catalog/pricing.service';
import { SEED_SHEETS } from '../../prisma/seed-data';
import { TEST_S3, TEST_S3_PUBLIC_BASE_URL } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const apiDir = path.resolve(__dirname, '../..');
const tsxBin = path.join(apiDir, 'node_modules/.bin/tsx');

/** Chạy `tsx prisma/seed.ts` với env tối thiểu (không kế thừa ADMIN_* từ shell/.env của dev). */
function runSeed(env: Record<string, string>) {
  return spawnSync(tsxBin, ['prisma/seed.ts'], {
    cwd: apiDir,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
}

describe('prisma/seed.ts (db:seed)', { timeout: 180_000 }, () => {
  const url = resolveTestDatabaseUrl();
  const baseEnv = {
    DATABASE_URL: url,
    ADMIN_EMAIL: '  Founder@Piano-Daily.TEST ',
    ADMIN_PASSWORD: 'seed-password-123',
    ADMIN_NAME: 'Founder',
    ...TEST_S3,
    S3_PUBLIC_BASE_URL: TEST_S3_PUBLIC_BASE_URL,
  };
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });

  const CLEAN = 'TRUNCATE TABLE refresh_tokens, users, sheet_files, sheet_genres, sheets, series, genres, composers CASCADE';
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(CLEAN);
  });

  afterAll(async () => {
    // Không để dữ liệu mẫu lại cho các spec khác dùng chung DB test.
    await prisma?.$executeRawUnsafe(CLEAN);
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

  it('DB trống -> 4 Composer, 4 Genre, Series, 10 Sheet đủ file, đủ 4 Level, 8 PUBLISHED (2 HOT) + 2 DRAFT', async () => {
    const result = runSeed(baseEnv);
    expect(result.status, result.stderr).toBe(0);
    expect(await prisma.composer.count()).toBe(4);
    expect(await prisma.genre.count()).toBe(4);
    expect(await prisma.series.count()).toBe(3);
    expect(await prisma.sheetGenre.count()).toBe(SEED_SHEETS.reduce((n, x) => n + x.genres.length, 0));
    const sheets = await prisma.sheet.findMany();
    expect(sheets).toHaveLength(10);
    for (const sheet of sheets) {
      const item = SEED_SHEETS.find((x) => x.title === sheet.title)!;
      expect(sheet.seriesId !== null, sheet.title).toBe(item.series !== undefined);
    }
    for (const sheet of sheets) {
      expect(sheet).toMatchObject({ hasSheet: true, hasMidi: true, hasMp3: true });
      expect(sheet.pageCount).toBeGreaterThanOrEqual(1);
    }
    const levels = new Set(sheets.map((x) => x.level));
    expect([...levels].sort()).toEqual(['ADVANCED', 'BEGINNER', 'EXPERT', 'INTERMEDIATE']);
    expect(sheets.filter((x) => x.status === 'PUBLISHED')).toHaveLength(8);
    expect(sheets.filter((x) => x.status === 'PUBLISHED' && x.isHot)).toHaveLength(2);
    expect(sheets.filter((x) => x.status === 'DRAFT')).toHaveLength(2);
    expect(sheets.filter((x) => x.status === 'PUBLISHED').every((x) => x.firstPublishedAt)).toBe(true);
    expect(await prisma.sheetFile.count({ where: { type: 'THUMBNAIL' } })).toBe(10);
    // Giá mẫu (Story 3.1): mọi Sheet PUBLISHED đều miễn phí hoặc có ít nhất một type mua được.
    const types = new Set(['PDF', 'MIDI', 'MP3']);
    for (const sheet of sheets.filter((x) => x.status === 'PUBLISHED')) {
      expect(computeQuote(sheet.id, sheet, types).free || computeQuote(sheet.id, sheet, types).items.length > 0, sheet.title).toBe(true);
    }
    expect(sheets.some((x) => x.isFree)).toBe(true);
    expect(sheets.some((x) => !x.isFree && x.pricePdfCents === 299 && x.priceBundleCents === 499)).toBe(true);
  });

  it('chạy lại -> số bản ghi và số sheet_files không đổi', async () => {
    expect(runSeed(baseEnv).status).toBe(0);
    const count = async () => [
      await prisma.composer.count(),
      await prisma.genre.count(),
      await prisma.series.count(),
      await prisma.sheet.count(),
      await prisma.sheetFile.count(),
    ];
    const published = await prisma.sheet.findMany({ where: { status: 'PUBLISHED' }, orderBy: { title: 'asc' } });
    const archived = published[0]!;
    const flipped = published[1]!;
    await prisma.sheet.update({ where: { id: archived.id }, data: { status: 'ARCHIVED' } });
    await prisma.sheet.update({ where: { id: flipped.id }, data: { isHot: !flipped.isHot } });
    const before = await count();
    const second = runSeed(baseEnv);
    expect(second.status, second.stderr).toBe(0);
    expect(await count()).toEqual(before);
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: archived.id } })).status).toBe('ARCHIVED');
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: flipped.id } })).isHot).toBe(!flipped.isHot);
  });

  it('Sheet dở dang thiếu MIDI -> chạy lại chỉ đính MIDI, không nhân đôi PDF/MP3', async () => {
    expect(runSeed(baseEnv).status).toBe(0);
    const sheet = await prisma.sheet.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
    await prisma.sheetFile.updateMany({
      where: { sheetId: sheet.id, type: { in: ['MIDI', 'MIDI_JSON'] } },
      data: { supersededAt: new Date() },
    });
    const currentCount = (type: 'PDF' | 'MP3' | 'MIDI') =>
      prisma.sheetFile.count({ where: { sheetId: sheet.id, type, supersededAt: null } });
    const total = await prisma.sheetFile.count({ where: { sheetId: sheet.id } });
    const result = runSeed(baseEnv);
    expect(result.status, result.stderr).toBe(0);
    expect(await currentCount('PDF')).toBe(1);
    expect(await currentCount('MP3')).toBe(1);
    expect(await currentCount('MIDI')).toBe(1);
    // Chỉ thêm 2 dòng mới (MIDI + MIDI_JSON); PDF/MP3 không được upload lại.
    expect(await prisma.sheetFile.count({ where: { sheetId: sheet.id } })).toBe(total + 2);
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).hasMidi).toBe(true);
  });

  it('thiếu S3_ENDPOINT -> thoát mã ≠ 0, nêu tên biến, không ghi gì', async () => {
    const result = runSeed({ ...baseEnv, S3_ENDPOINT: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('S3_ENDPOINT (thiếu)');
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.composer.count()).toBe(0);
  });

  it('thiếu pdftoppm -> thoát mã ≠ 0 với thông báo rõ, không có Sheet PUBLISHED thiếu PDF', async () => {
    // PATH chỉ chứa `node` (tsx cần), không có poppler.
    const bin = mkdtempSync(path.join(tmpdir(), 'seed-nopath-'));
    symlinkSync(process.execPath, path.join(bin, 'node'));
    const result = runSeed({ ...baseEnv, PATH: bin });
    rmSync(bin, { recursive: true, force: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pdftoppm');
    expect(await prisma.sheet.count({ where: { status: 'PUBLISHED', hasSheet: false } })).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.composer.count()).toBe(0);
  });
});
