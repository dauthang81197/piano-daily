import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema, levelSummarySchema, publicSheetListSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('API công khai Sheet (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });

  let composerId: string;
  let genres: { jazz: string; pop: string };
  let n = 0;

  const addSheet = async (
    data: {
      title: string;
      level?: 'BEGINNER' | 'INTERMEDIATE';
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      viewCount?: number;
      published?: string;
      genreIds?: string[];
      thumbnail?: boolean;
    },
  ) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: data.title,
        slug: `sheet-${n}`,
        composerId,
        level: data.level ?? 'BEGINNER',
        status: data.status ?? 'PUBLISHED',
        viewCount: data.viewCount ?? 0,
        hasMidi: true,
        pageCount: 2,
        firstPublishedAt: data.published ? new Date(data.published) : null,
        genres: { create: (data.genreIds ?? []).map((genreId) => ({ genreId })) },
      },
    });
    if (data.thumbnail !== false) {
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type: 'THUMBNAIL',
          storageKey: `public/sheets/${sheet.id}/thumb.webp`,
          size: 10,
          mimeType: 'image/webp',
          pageNumber: 1,
        },
      });
      // Thumbnail cũ đã bị thay: không được dùng.
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type: 'THUMBNAIL',
          storageKey: `public/sheets/${sheet.id}/old.webp`,
          size: 10,
          mimeType: 'image/webp',
          supersededAt: new Date(),
        },
      });
    }
    return sheet;
  };

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    genres = {
      jazz: (await prisma.genre.create({ data: { name: 'Jazz', slug: 'jazz' } })).id,
      pop: (await prisma.genre.create({ data: { name: 'Pop', slug: 'pop' } })).id,
    };
  });

  describe('GET /sheets', () => {
    it('mặc định: chỉ PUBLISHED đúng Level, newest, pageSize 12, có thumbnailUrl, không lộ storageKey', async () => {
      const a = await addSheet({ title: 'A', published: '2026-01-01' });
      const b = await addSheet({ title: 'B', published: '2026-02-01' });
      await addSheet({ title: 'Draft', status: 'DRAFT' });
      await addSheet({ title: 'Archived', status: 'ARCHIVED', published: '2026-03-01' });
      await addSheet({ title: 'Other level', level: 'INTERMEDIATE', published: '2026-03-01' });

      const res = await get('/sheets?level=BEGINNER').expect(200);
      const body = publicSheetListSchema.parse(res.body);
      expect(body).toMatchObject({ page: 1, pageSize: 12, total: 2 });
      expect(body.items.map((i) => i.title)).toEqual(['B', 'A']);
      expect(body.items[0]).toMatchObject({
        id: b.id,
        level: 'BEGINNER',
        composer: { id: composerId, name: 'Bach' },
        hasMidi: true,
        hasMp3: false,
        pageCount: 2,
        isHot: false,
      });
      expect(body.items[0]!.thumbnailUrl).toMatch(new RegExp(`/public/sheets/${b.id}/thumb\\.webp$`));
      expect(body.items[1]!.id).toBe(a.id);
      expect(JSON.stringify(res.body)).not.toMatch(/storageKey|private\/|old\.webp/);
    });

    it('newest: Sheet PUBLISHED có firstPublishedAt null xếp sau các Sheet có ngày', async () => {
      await addSheet({ title: 'Null date' });
      await addSheet({ title: 'Dated', published: '2026-01-01' });
      const body = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER').expect(200)).body);
      expect(body.items.map((i) => i.title)).toEqual(['Dated', 'Null date']);
    });

    it('Sheet chưa có thumbnail -> thumbnailUrl null', async () => {
      await addSheet({ title: 'No thumb', published: '2026-01-01', thumbnail: false });
      const body = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER').expect(200)).body);
      expect(body.items[0]!.thumbnailUrl).toBeNull();
    });

    it('lọc theo slug Genre; slug lạ -> 200 rỗng', async () => {
      await addSheet({ title: 'Jazz one', published: '2026-01-01', genreIds: [genres.jazz] });
      await addSheet({ title: 'Pop one', published: '2026-01-02', genreIds: [genres.pop] });
      const jazz = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER&genre=jazz').expect(200)).body);
      expect(jazz.items.map((i) => i.title)).toEqual(['Jazz one']);
      expect(jazz.total).toBe(1);
      const none = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER&genre=khong-co').expect(200)).body);
      expect(none).toMatchObject({ items: [], total: 0 });
    });

    it('most_viewed: viewCount giảm dần, tie-break ổn định', async () => {
      await addSheet({ title: 'Low', viewCount: 1, published: '2026-01-01' });
      await addSheet({ title: 'Tie old', viewCount: 5, published: '2026-01-01' });
      await addSheet({ title: 'Tie new', viewCount: 5, published: '2026-02-01' });
      await addSheet({ title: 'Top', viewCount: 9, published: '2026-01-15' });
      const body = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER&sort=most_viewed').expect(200)).body);
      expect(body.items.map((i) => i.title)).toEqual(['Top', 'Tie new', 'Tie old', 'Low']);
    });

    it('phân trang: đúng lát cắt và total', async () => {
      for (let i = 1; i <= 5; i += 1) await addSheet({ title: `S${i}`, published: `2026-01-0${i}` });
      const p2 = publicSheetListSchema.parse((await get('/sheets?level=BEGINNER&page=2&pageSize=2').expect(200)).body);
      expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 5 });
      expect(p2.items.map((i) => i.title)).toEqual(['S3', 'S2']);
    });

    it.each([
      '/sheets',
      '/sheets?level=FOO',
      '/sheets?level=BEGINNER&sort=bogus',
      '/sheets?level=BEGINNER&pageSize=49',
      '/sheets?level=BEGINNER&page=0',
    ])('%s -> 400 VALIDATION_FAILED', async (path) => {
      const res = await get(path).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /levels/:level/summary', () => {
    it('total, lastUpdatedAt và genres kèm count (chỉ PUBLISHED), sắp count desc rồi name asc', async () => {
      await addSheet({ title: '1', published: '2026-01-01', genreIds: [genres.jazz, genres.pop] });
      await addSheet({ title: '2', published: '2026-01-02', genreIds: [genres.pop] });
      await addSheet({ title: 'Draft', status: 'DRAFT', genreIds: [genres.jazz] });
      await addSheet({ title: 'Other', level: 'INTERMEDIATE', published: '2026-01-02', genreIds: [genres.jazz] });
      await prisma.genre.create({ data: { name: 'Empty', slug: 'empty' } });

      const body = levelSummarySchema.parse((await get('/levels/BEGINNER/summary').expect(200)).body);
      expect(body.total).toBe(2);
      expect(body.genres.map((g) => [g.slug, g.count])).toEqual([
        ['pop', 2],
        ['jazz', 1],
      ]);
      const max = await prisma.sheet.aggregate({
        where: { level: 'BEGINNER', status: 'PUBLISHED' },
        _max: { updatedAt: true },
      });
      expect(body.lastUpdatedAt).toBe(max._max.updatedAt!.toISOString());
    });

    it('Level rỗng -> total 0, lastUpdatedAt null, genres []', async () => {
      await addSheet({ title: 'Draft', status: 'DRAFT' });
      const body = levelSummarySchema.parse((await get('/levels/EXPERT/summary').expect(200)).body);
      expect(body).toEqual({ total: 0, lastUpdatedAt: null, genres: [] });
    });

    it('level sai -> 400', async () => {
      const res = await get('/levels/FOO/summary').expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });
  });
});
