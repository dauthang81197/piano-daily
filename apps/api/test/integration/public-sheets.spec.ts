import type { INestApplication } from '@nestjs/common';
import {
  errorResponseSchema,
  facetsSchema,
  levelSummarySchema,
  publicComposerSchema,
  publicGenreSchema,
  publicSheetListSchema,
} from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const parseList = (res: { body: unknown }) => publicSheetListSchema.parse(res.body);

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
      lyrics?: string;
      composerId?: string;
      hasMidi?: boolean;
      hasMp3?: boolean;
    },
  ) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: data.title,
        slug: `sheet-${n}`,
        composerId: data.composerId ?? composerId,
        lyricsChords: data.lyrics ?? null,
        level: data.level ?? 'BEGINNER',
        status: data.status ?? 'PUBLISHED',
        viewCount: data.viewCount ?? 0,
        hasMidi: data.hasMidi ?? true,
        hasMp3: data.hasMp3 ?? false,
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

    it('không level: mọi Sheet PUBLISHED của mọi Level', async () => {
      await addSheet({ title: 'A', published: '2026-01-01' });
      await addSheet({ title: 'B', level: 'INTERMEDIATE', published: '2026-01-02' });
      await addSheet({ title: 'Draft', status: 'DRAFT' });
      const body = parseList(await get('/sheets').expect(200));
      expect(body.items.map((i) => i.title)).toEqual(['B', 'A']);
      expect(body.total).toBe(2);
    });

    it('lọc composer (slug) và format, kết hợp AND không q', async () => {
      const other = (await prisma.composer.create({ data: { name: 'Chopin', slug: 'chopin' } })).id;
      await addSheet({ title: 'Bach midi', published: '2026-01-01' });
      await addSheet({ title: 'Bach mp3', published: '2026-01-02', hasMidi: false, hasMp3: true });
      await addSheet({ title: 'Chopin midi', published: '2026-01-03', composerId: other });
      const byComposer = parseList(await get('/sheets?composer=chopin').expect(200));
      expect(byComposer.items.map((i) => i.title)).toEqual(['Chopin midi']);
      const byFormat = parseList(await get('/sheets?format=mp3').expect(200));
      expect(byFormat.items.map((i) => i.title)).toEqual(['Bach mp3']);
      const both = parseList(await get('/sheets?composer=bach&format=midi').expect(200));
      expect(both.items.map((i) => i.title)).toEqual(['Bach midi']);
      const none = parseList(await get('/sheets?composer=zzz').expect(200));
      expect(none).toMatchObject({ items: [], total: 0 });
    });

    it.each([
      `/sheets?q=${'a'.repeat(101)}`,
      '/sheets?format=pdf',
      '/sheets?level=FOO',
      '/sheets?level=BEGINNER&sort=bogus',
      '/sheets?level=BEGINNER&pageSize=49',
      '/sheets?level=BEGINNER&page=0',
    ])('%s -> 400 VALIDATION_FAILED', async (path) => {
      const res = await get(path).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /sheets?q= (tìm kiếm toàn văn)', () => {
    let beethoven: string;
    const titles = async (path: string) => parseList(await get(path).expect(200)).items.map((i) => i.title);

    beforeEach(async () => {
      beethoven = (await prisma.composer.create({ data: { name: 'Beethoven', slug: 'beethoven' } })).id;
    });

    it('khớp tiêu đề, không dấu, tiền tố và nhiều từ (AND)', async () => {
      await addSheet({ title: 'Für Elise', published: '2026-01-01', composerId: beethoven });
      await addSheet({ title: 'Đêm thu mẫu', published: '2026-01-02' });
      await addSheet({ title: 'Moonlight Sonata', published: '2026-01-03' });
      await addSheet({ title: 'Elise in Paris', published: '2026-01-04' });
      expect(await titles('/sheets?q=elise')).toEqual(['Elise in Paris', 'Für Elise']);
      expect(await titles('/sheets?q=fur')).toEqual(['Für Elise']);
      expect(await titles('/sheets?q=dem%20thu')).toEqual(['Đêm thu mẫu']);
      expect(await titles('/sheets?q=%C4%90%C3%8AM')).toEqual(['Đêm thu mẫu']);
      expect(await titles('/sheets?q=moon')).toEqual(['Moonlight Sonata']);
      expect(await titles('/sheets?q=fur%20elise')).toEqual(['Für Elise']);
      expect(await titles('/sheets?q=fur%20paris')).toEqual([]);
    });

    it('khớp tên Composer và lyrics; đổi tên Composer cập nhật kết quả', async () => {
      await addSheet({ title: 'Pieces', published: '2026-01-01', composerId: beethoven });
      await addSheet({ title: 'Song', published: '2026-01-02', lyrics: 'Twinkle little star\nC G Am' });
      expect(await titles('/sheets?q=beethoven')).toEqual(['Pieces']);
      expect(await titles('/sheets?q=twinkle')).toEqual(['Song']);
      await prisma.composer.update({ where: { id: beethoven }, data: { name: 'Ludwig' } });
      expect(await titles('/sheets?q=beethoven')).toEqual([]);
      expect(await titles('/sheets?q=ludwig')).toEqual(['Pieces']);
    });

    it('q toàn số khớp thêm public_id, cùng các Sheet khớp văn bản; Draft không lộ qua ID', async () => {
      const target = await addSheet({ title: 'Target', published: '2026-01-01' });
      const draft = await addSheet({ title: 'Hidden', status: 'DRAFT' });
      await addSheet({ title: 'Op 12 sonata', published: '2026-01-02' });
      const byId = await titles(`/sheets?q=${target.publicId}`);
      expect(byId).toContain('Target');
      expect(await titles(`/sheets?q=${draft.publicId}`)).not.toContain('Hidden');
      const withText = `/sheets?q=${target.publicId}`;
      const res = parseList(await get(withText).expect(200));
      expect(res.items[0]!.title).toBe('Target');
      expect(res.total).toBe(res.items.length);
    });

    it('Draft/Archived không bao giờ xuất hiện (items và total)', async () => {
      await addSheet({ title: 'Nocturne', published: '2026-01-01' });
      await addSheet({ title: 'Nocturne draft', status: 'DRAFT' });
      await addSheet({ title: 'Nocturne archived', status: 'ARCHIVED', published: '2026-01-02' });
      const body = parseList(await get('/sheets?q=nocturne').expect(200));
      expect(body.items.map((i) => i.title)).toEqual(['Nocturne']);
      expect(body.total).toBe(1);
    });

    it('bộ lọc level/genre/composer/format kết hợp AND với q', async () => {
      await addSheet({ title: 'Waltz A', published: '2026-01-01', genreIds: [genres.jazz], composerId: beethoven });
      await addSheet({ title: 'Waltz B', published: '2026-01-02', level: 'INTERMEDIATE', genreIds: [genres.jazz] });
      await addSheet({ title: 'Waltz C', published: '2026-01-03', genreIds: [genres.pop], hasMidi: false, hasMp3: true });
      expect(await titles('/sheets?q=waltz')).toHaveLength(3);
      expect(await titles('/sheets?q=waltz&level=BEGINNER')).toEqual(['Waltz C', 'Waltz A']);
      expect(await titles('/sheets?q=waltz&genre=jazz')).toEqual(['Waltz B', 'Waltz A']);
      expect(await titles('/sheets?q=waltz&composer=beethoven')).toEqual(['Waltz A']);
      expect(await titles('/sheets?q=waltz&format=mp3')).toEqual(['Waltz C']);
      expect(await titles('/sheets?q=waltz&level=BEGINNER&genre=jazz&composer=beethoven&format=midi')).toEqual(['Waltz A']);
      expect(await titles('/sheets?q=waltz&genre=khong-co')).toEqual([]);
    });

    it('xếp theo độ liên quan rồi mới nhất; sort=newest/most_viewed đổi thứ tự; phân trang giữ total', async () => {
      await addSheet({ title: 'Rain', published: '2026-01-01', viewCount: 9 });
      await addSheet({ title: 'Rain', published: '2026-01-02', lyrics: 'rain rain rain rain', viewCount: 1 });
      await addSheet({ title: 'Other', published: '2026-03-01', lyrics: 'rain', viewCount: 5 });
      const rel = parseList(await get('/sheets?q=rain').expect(200));
      expect(rel.total).toBe(3);
      // Khớp dày nhất đứng đầu; hai khớp còn lại hoà điểm nên mới nhất trước.
      expect(rel.items.map((i) => [i.title, i.viewCount])).toEqual([
        ['Rain', 1],
        ['Other', 5],
        ['Rain', 9],
      ]);
      expect(await titles('/sheets?q=rain&sort=newest')).toEqual(['Other', 'Rain', 'Rain']);
      expect(parseList(await get('/sheets?q=rain&sort=most_viewed').expect(200)).items.map((i) => i.viewCount)).toEqual([
        9, 5, 1,
      ]);
      const p2 = parseList(await get('/sheets?q=rain&page=2&pageSize=2').expect(200));
      expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(p2.items).toHaveLength(1);
    });

    it('hoà điểm thì mới nhất trước', async () => {
      await addSheet({ title: 'Tie', published: '2026-01-01' });
      await addSheet({ title: 'Tie', published: '2026-02-01' });
      const items = parseList(await get('/sheets?q=tie').expect(200)).items;
      expect(items.map((i) => i.id)).toEqual(
        (await prisma.sheet.findMany({ orderBy: { firstPublishedAt: 'desc' } })).map((s) => s.id),
      );
    });

    it('ký tự đặc biệt: 200, không lỗi SQL/tsquery, bảng nguyên vẹn', async () => {
      await addSheet({ title: 'Safe', published: '2026-01-01' });
      const q = encodeURIComponent("& | ! ( ) :* '; drop table sheets --");
      await get(`/sheets?q=${q}`).expect(200);
      await get(`/sheets?q=${encodeURIComponent("'); DROP TABLE sheets; --")}`).expect(200);
      await get(`/sheets?q=${encodeURIComponent('a\\b:*&|!')}`).expect(200);
      expect(await prisma.sheet.count()).toBe(1);
    });

    it('q trống hoặc chỉ ký tự đặc biệt: như không có q', async () => {
      await addSheet({ title: 'One', published: '2026-01-01' });
      await addSheet({ title: 'Two', published: '2026-01-02' });
      expect(await titles('/sheets?q=%20')).toEqual(['Two', 'One']);
      expect(await titles('/sheets?q=!!!')).toEqual(['Two', 'One']);
    });
  });

  describe('GET /sheets/facets', () => {
    it('genres và composers kèm count, chỉ PUBLISHED, bỏ count 0, sắp count desc rồi name asc', async () => {
      const zed = (await prisma.composer.create({ data: { name: 'Zed', slug: 'zed' } })).id;
      await prisma.composer.create({ data: { name: 'Empty', slug: 'empty' } });
      await addSheet({ title: '1', published: '2026-01-01', genreIds: [genres.jazz, genres.pop] });
      await addSheet({ title: '2', published: '2026-01-02', genreIds: [genres.pop], composerId: zed });
      await addSheet({ title: 'Draft', status: 'DRAFT', genreIds: [genres.jazz] });
      await prisma.genre.create({ data: { name: 'Unused', slug: 'unused' } });
      const body = facetsSchema.parse((await get('/sheets/facets').expect(200)).body);
      expect(body.genres.map((g) => [g.slug, g.count])).toEqual([
        ['pop', 2],
        ['jazz', 1],
      ]);
      expect(body.composers.map((c) => [c.slug, c.count])).toEqual([
        ['bach', 1],
        ['zed', 1],
      ]);
    });

    it('không có Sheet nào: rỗng', async () => {
      expect(facetsSchema.parse((await get('/sheets/facets').expect(200)).body)).toEqual({ genres: [], composers: [] });
    });
  });

  describe('GET /composers/:slug và /genres/:slug', () => {
    it('Composer: trả tên, bio, avatarUrl public; thẻ Sheet có composer.slug', async () => {
      await prisma.composer.update({
        where: { id: composerId },
        data: { bio: 'Nhà soạn nhạc Baroque', avatar: 'public/composers/bach/avatar.webp' },
      });
      await addSheet({ title: 'A', published: '2026-01-01' });
      const body = publicComposerSchema.parse((await get('/composers/bach').expect(200)).body);
      expect(body).toMatchObject({ id: composerId, slug: 'bach', name: 'Bach', bio: 'Nhà soạn nhạc Baroque' });
      expect(body.avatarUrl).toMatch(/\/public\/composers\/bach\/avatar\.webp$/);
      const list = publicSheetListSchema.parse((await get('/sheets?composer=bach').expect(200)).body);
      expect(list.items[0]!.composer).toEqual({ id: composerId, name: 'Bach', slug: 'bach' });
    });

    it('Composer: avatar key private -> avatarUrl null, không lộ key', async () => {
      await prisma.composer.update({ where: { id: composerId }, data: { avatar: 'private/composers/bach/a.webp' } });
      const res = await get('/composers/bach').expect(200);
      expect(publicComposerSchema.parse(res.body).avatarUrl).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('private/');
    });

    it('Composer: avatar key sai dạng (không public/ hay private/) -> 200, avatarUrl null', async () => {
      await prisma.composer.update({ where: { id: composerId }, data: { avatar: 'legacy/avatar.png' } });
      expect(publicComposerSchema.parse((await get('/composers/bach').expect(200)).body).avatarUrl).toBeNull();
    });

    it('Composer chưa có avatar/bài PUBLISHED vẫn 200', async () => {
      await addSheet({ title: 'Draft', status: 'DRAFT' });
      const body = publicComposerSchema.parse((await get('/composers/bach').expect(200)).body);
      expect(body).toMatchObject({ bio: null, avatarUrl: null });
      const list = publicSheetListSchema.parse((await get('/sheets?composer=bach').expect(200)).body);
      expect(list.total).toBe(0);
    });

    it('Genre: trả tên và icon (null được)', async () => {
      await prisma.genre.update({ where: { id: genres.jazz }, data: { icon: 'music' } });
      expect(publicGenreSchema.parse((await get('/genres/jazz').expect(200)).body)).toEqual({
        id: genres.jazz,
        slug: 'jazz',
        name: 'Jazz',
        icon: 'music',
      });
      expect(publicGenreSchema.parse((await get('/genres/pop').expect(200)).body).icon).toBeNull();
    });

    it('slug quá dài (> 200 ký tự) -> 400 VALIDATION_FAILED', async () => {
      const res = await get(`/composers/${'a'.repeat(201)}`).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('slug không tồn tại -> 404 theo định dạng lỗi chung', async () => {
      for (const path of ['/composers/khong-co', '/genres/khong-co']) {
        const res = await get(path).expect(404);
        expect(errorResponseSchema.parse(res.body).error.code).toBeTruthy();
      }
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
