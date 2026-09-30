import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { type Env, storageEnvSchema } from '../src/config/env';
import { ComposersService } from '../src/modules/catalog/composers.service';
import { GenresService } from '../src/modules/catalog/genres.service';
import { SeriesService } from '../src/modules/catalog/series.service';
import { SheetsService } from '../src/modules/catalog/sheets.service';
import { PdfProcessor } from '../src/modules/media/pdf-processor';
import { SheetMediaService } from '../src/modules/media/sheet-media.service';
import { StorageService } from '../src/modules/media/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeMidi } from './fixtures/midi';
import { makeMp3 } from './fixtures/mp3';
import { makePdf } from './fixtures/pdf';
import { SEED_COMPOSERS, SEED_GENRES, SEED_SERIES, SEED_SHEETS } from './seed-data';

/**
 * Seed idempotent:
 * 1. SUPER_ADMIN từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` (đã tồn tại thì giữ nguyên, không đổi mật khẩu).
 * 2. Composer/Genre/Series và 10 Sheet mẫu; PDF/MIDI/MP3 sinh bằng code rồi đi qua `SheetsService.attachFile`.
 * Chạy lại không tạo trùng và tự đính bù file còn thiếu. Cần DB đã migrate, S3 đang chạy và `pdftoppm`.
 * Chạy: `pnpm db:seed` (gốc repo) hoặc `pnpm --filter @piano-daily/api db:seed` (= `prisma db seed`).
 */

loadDotenv({ path: path.join(__dirname, '../.env'), quiet: true });
loadDotenv({ path: path.join(__dirname, '../../../.env'), quiet: true });

const BCRYPT_COST = 12;

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const seedEnvSchema = z.object({
  DATABASE_URL: z.preprocess(emptyAsUndefined, z.string()),
  ADMIN_EMAIL: z.preprocess(emptyAsUndefined, z.string().trim().toLowerCase().pipe(z.email())),
  ADMIN_PASSWORD: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(12, { error: 'cần ít nhất 12 ký tự' })
      .max(128)
      .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu' }),
  ),
  ADMIN_NAME: z.preprocess(emptyAsUndefined, z.string().trim().min(1)),
});

type SeedEnv = z.infer<typeof seedEnvSchema> & z.infer<typeof storageEnvSchema>;

function readEnv(): SeedEnv {
  const admin = seedEnvSchema.safeParse(process.env);
  const storage = storageEnvSchema.safeParse(process.env);
  if (admin.success && storage.success) return { ...admin.data, ...storage.data };
  const issues = [...(admin.success ? [] : admin.error.issues), ...(storage.success ? [] : storage.error.issues)];
  const problems = issues.map((issue) => {
    const variable = String(issue.path[0] ?? '(unknown)');
    const raw = process.env[variable];
    return `${variable} (${raw === undefined || raw === '' ? 'thiếu' : issue.message})`;
  });
  throw new Error(`Không thể seed: biến môi trường không hợp lệ: ${problems.join(', ')}`);
}

/** `pdftoppm` (poppler) là bắt buộc để xử lý PDF; kiểm tra trước khi ghi bất cứ thứ gì. */
function assertPdftoppm(): void {
  const probe = spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' });
  if (probe.error) {
    throw new Error(
      'Không thể seed: không chạy được `pdftoppm` (cài poppler-utils: `brew install poppler` hoặc `apt-get install poppler-utils`).',
    );
  }
}

/** Che email khi log: `ad***@example.com`. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

async function seedAdmin(prisma: PrismaService, env: SeedEnv): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: env.ADMIN_EMAIL },
    select: { role: true, isActive: true },
  });
  if (existing) {
    if (existing.role !== 'SUPER_ADMIN' || !existing.isActive) {
      console.warn(
        `Seed: CẢNH BÁO — user ${maskEmail(env.ADMIN_EMAIL)} đã tồn tại nhưng không phải SUPER_ADMIN đang hoạt động ` +
          `(role=${existing.role}, is_active=${existing.isActive}); seed không sửa user này.`,
      );
    } else {
      console.log(`Seed: SUPER_ADMIN ${maskEmail(env.ADMIN_EMAIL)} đã tồn tại, giữ nguyên.`);
    }
    return;
  }
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_COST);
  // upsert (update rỗng) để an toàn khi hai lần seed chạy đồng thời.
  await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    update: {},
    create: { email: env.ADMIN_EMAIL, passwordHash, name: env.ADMIN_NAME, role: 'SUPER_ADMIN' },
  });
  console.log(`Seed: đã tạo SUPER_ADMIN ${maskEmail(env.ADMIN_EMAIL)}.`);
}

interface Services {
  prisma: PrismaService;
  composers: ComposersService;
  genres: GenresService;
  series: SeriesService;
  sheets: SheetsService;
}

/** Composer/Genre/Series: nhận diện theo tên (Series theo tên + composer); có rồi thì bỏ qua. Trả về map tên -> id. */
async function seedTaxonomy({ prisma, composers, genres, series }: Services) {
  const composerIds = new Map<string, string>();
  const genreIds = new Map<string, string>();
  const seriesIds = new Map<string, string>();
  let created = 0;

  for (const item of SEED_COMPOSERS) {
    const found = await prisma.composer.findFirst({ where: { name: item.name }, select: { id: true } });
    if (found) composerIds.set(item.name, found.id);
    else {
      composerIds.set(item.name, (await composers.create({ name: item.name, bio: item.bio })).id);
      created++;
    }
  }
  for (const item of SEED_GENRES) {
    const found = await prisma.genre.findFirst({ where: { name: item.name }, select: { id: true } });
    if (found) genreIds.set(item.name, found.id);
    else {
      genreIds.set(item.name, (await genres.create({ name: item.name, icon: item.icon })).id);
      created++;
    }
  }
  for (const item of SEED_SERIES) {
    const composerId = composerIds.get(item.composer)!;
    const found = await prisma.series.findFirst({ where: { name: item.name, composerId }, select: { id: true } });
    if (found) seriesIds.set(item.name, found.id);
    else {
      seriesIds.set(item.name, (await series.create({ name: item.name, composerId })).id);
      created++;
    }
  }
  console.log(`Seed: taxonomy — tạo mới ${created}, đã có ${composerIds.size + genreIds.size + seriesIds.size - created}.`);
  return { composerIds, genreIds, seriesIds };
}

async function seedSheets(services: Services, ids: Awaited<ReturnType<typeof seedTaxonomy>>): Promise<void> {
  const { prisma, sheets } = services;
  let createdSheets = 0;
  let attached = 0;
  let published = 0;

  for (const [index, item] of SEED_SHEETS.entries()) {
    const composerId = ids.composerIds.get(item.composer)!;
    const label = `seed-sheet-${index + 1}`;
    let sheet = await prisma.sheet.findFirst({
      where: { title: item.title, composerId },
      select: { id: true, status: true, firstPublishedAt: true },
    });
    if (!sheet) {
      const body = await sheets.create({
        title: item.title,
        subtitle: item.subtitle,
        composerId,
        seriesId: item.series ? ids.seriesIds.get(item.series) : undefined,
        level: item.level,
        difficultyScore: item.difficultyScore,
        description: item.description,
        lyricsChords: item.lyricsChords,
        youtubeUrl: item.youtubeUrl,
        genreIds: item.genres.map((name) => ids.genreIds.get(name)!),
      });
      sheet = { id: body.id, status: 'DRAFT', firstPublishedAt: null };
      createdSheets++;
    }

    const current = await prisma.sheetFile.findMany({
      where: { sheetId: sheet.id, supersededAt: null, type: { in: ['PDF', 'MIDI', 'MP3'] } },
      select: { type: true },
    });
    const has = new Set(current.map((f) => f.type));
    if (!has.has('PDF')) {
      await sheets.attachFile(sheet.id, 'PDF', { buffer: makePdf(item.pages, label), originalName: `${label}.pdf` });
      has.add('PDF');
      attached++;
    }
    if (!has.has('MIDI')) {
      await sheets.attachFile(sheet.id, 'MIDI', {
        buffer: makeMidi(3 + (index % 6)),
        originalName: `${label}.mid`,
      });
      attached++;
    }
    if (!has.has('MP3')) {
      await sheets.attachFile(sheet.id, 'MP3', { buffer: makeMp3(label), originalName: `${label}.mp3` });
      attached++;
    }

    // Story 1.8 (publish) chưa vào develop: ghi thẳng trạng thái, và chỉ khi đã có PDF hiện hành.
    if (item.status === 'PUBLISHED' && sheet.status === 'DRAFT' && sheet.firstPublishedAt === null && has.has('PDF')) {
      await prisma.sheet.update({
        where: { id: sheet.id },
        data: { status: 'PUBLISHED', isHot: item.isHot === true, firstPublishedAt: new Date() },
      });
      published++;
    }
  }
  console.log(
    `Seed: sheet — tạo mới ${createdSheets}, đính ${attached} file, publish ${published} (tổng ${SEED_SHEETS.length} sheet mẫu).`,
  );
}

async function main(): Promise<void> {
  const env = readEnv();
  assertPdftoppm();

  const config = new ConfigService({ ...env }) as unknown as ConfigService<Env, true>;
  // Dựng tay thay vì Nest DI: tsx (esbuild) không emit decorator metadata.
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  try {
    if (env.S3_AUTO_CREATE_BUCKETS) await storage.ensureBuckets();
    const media = new SheetMediaService(new PdfProcessor(), storage);
    const services: Services = {
      prisma,
      composers: new ComposersService(prisma),
      genres: new GenresService(prisma),
      series: new SeriesService(prisma),
      sheets: new SheetsService(prisma, media, storage),
    };
    await seedAdmin(prisma, env);
    const ids = await seedTaxonomy(services);
    await seedSheets(services, ids);
  } finally {
    await prisma.$disconnect();
    storage.onModuleDestroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
