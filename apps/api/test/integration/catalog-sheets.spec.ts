import type { INestApplication } from '@nestjs/common';
import {
  composerSchema,
  errorResponseSchema,
  genreSchema,
  loginResponseSchema,
  pageSchema,
  seriesSchema,
  sheetListItemSchema,
  sheetSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';
const VIDEO_ID = 'dQw4w9WgXcQ';
const CANONICAL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

describe('/admin/sheets (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const get = (path: string) => auth(http().get(path));
  const post = (path: string, body: object) => auth(http().post(path)).send(body);
  const patch = (path: string, body: object) => auth(http().patch(path)).send(body);
  const del = (path: string) => auth(http().delete(path));

  const errorOf = (res: request.Response) => errorResponseSchema.parse(res.body).error;

  const createComposer = async (name: string) =>
    composerSchema.parse((await post('/admin/composers', { name }).expect(201)).body);
  const createGenre = async (name: string) => genreSchema.parse((await post('/admin/genres', { name }).expect(201)).body);
  const createSeries = async (name: string, composerId: string) =>
    seriesSchema.parse((await post('/admin/series', { name, composerId }).expect(201)).body);
  const createSheet = async (body: object) => sheetSchema.parse((await post('/admin/sheets', body).expect(201)).body);

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await http()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.201')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheets, series, composers, genres CASCADE');
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Tạo', () => {
    it('đủ trường -> 201 DRAFT, slug bỏ dấu, publicId tăng dần, has* dẫn xuất, youtube dạng chuẩn', async () => {
      const beethoven = await createComposer('Beethoven');
      const classical = await createGenre('Cổ điển');
      const romantic = await createGenre('Lãng mạn');
      const bagatelles = await createSeries('Bagatelles', beethoven.id);
      const body = {
        title: 'Für Elise',
        subtitle: 'Bagatelle No. 25',
        composerId: beethoven.id,
        seriesId: bagatelles.id,
        level: 'BEGINNER',
        difficultyScore: 35,
        difficultyNote: 'Tay trái rải hợp âm',
        description: 'Bản nhạc quen thuộc.',
        lyricsChords: '## Đoạn A\n\n[Am] E D# E',
        youtubeUrl: `youtu.be/${VIDEO_ID}`,
        genreIds: [classical.id, romantic.id],
      };
      const first = await createSheet(body);
      expect(first).toMatchObject({
        title: 'Für Elise',
        subtitle: 'Bagatelle No. 25',
        slug: 'fur-elise',
        status: 'DRAFT',
        composer: { id: beethoven.id, name: 'Beethoven' },
        series: { id: bagatelles.id, name: 'Bagatelles' },
        level: 'BEGINNER',
        difficultyScore: 35,
        difficultyNote: 'Tay trái rải hợp âm',
        lyricsChords: body.lyricsChords,
        youtubeUrl: CANONICAL,
        hasChords: true,
        hasVideo: true,
        hasSheet: false,
        hasMidi: false,
        hasMp3: false,
        pageCount: 0,
        viewCount: 0,
        isHot: false,
        firstPublishedAt: null,
      });
      expect(first.genres.map((g) => g.id).sort()).toEqual([classical.id, romantic.id].sort());

      const second = await createSheet({ ...body, genreIds: [] });
      expect(second.slug).toBe('fur-elise-2');
      expect(second.publicId).toBeGreaterThan(first.publicId);

      expect((await get(`/admin/sheets/${first.id}`).expect(200)).body).toEqual(first);
    });

    it('tối thiểu -> has* false, genres rỗng, series null', async () => {
      const chopin = await createComposer('Chopin');
      const sheet = await createSheet({ title: 'Nocturne', composerId: chopin.id, level: 'ADVANCED' });
      expect(sheet).toMatchObject({
        hasChords: false,
        hasVideo: false,
        genres: [],
        series: null,
        subtitle: null,
        lyricsChords: null,
        youtubeUrl: null,
        difficultyScore: null,
      });
    });

    it('tiêu đề không sinh được slug -> slug dự phòng "sheet"', async () => {
      const c = await createComposer('X');
      expect((await createSheet({ title: '!!!', composerId: c.id, level: 'EXPERT' })).slug).toBe('sheet');
    });

    it.each([
      ['hasSheet', { hasSheet: true }],
      ['pageCount', { pageCount: 5 }],
      ['status', { status: 'PUBLISHED' }],
      ['slug', { slug: 'tu-dat' }],
      ['isHot', { isHot: true }],
      ['viewCount', { viewCount: 1 }],
      ['thumbnail', { thumbnail: 'x.webp' }],
    ])('gửi trường %s -> 400 VALIDATION_FAILED, không ghi gì', async (_label, extra) => {
      const c = await createComposer('Bach');
      const error = errorOf(await post('/admin/sheets', { title: 'A', composerId: c.id, level: 'BEGINNER', ...extra }).expect(400));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.sheet.count()).toBe(0);
    });

    it('thiếu trường bắt buộc -> 400 kèm details theo trường', async () => {
      const error = errorOf(await post('/admin/sheets', {}).expect(400));
      const paths = (error.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['title', 'composerId', 'level']));
    });

    it('youtube sai -> 400 details youtubeUrl', async () => {
      const c = await createComposer('Bach');
      const error = errorOf(
        await post('/admin/sheets', { title: 'A', composerId: c.id, level: 'BEGINNER', youtubeUrl: 'https://vimeo.com/1' }).expect(400),
      );
      expect(error.details).toEqual([{ path: 'youtubeUrl', message: expect.any(String) }]);
    });

    it('composerId/seriesId viết hoa -> chuẩn hoá, Series đúng Composer -> 201', async () => {
      const c = await createComposer('Beethoven');
      const s = await createSeries('Bagatelles', c.id);
      const sheet = await createSheet({
        title: 'X',
        composerId: c.id.toUpperCase(),
        seriesId: s.id.toUpperCase(),
        level: 'BEGINNER',
      });
      expect(sheet).toMatchObject({ composer: { id: c.id }, series: { id: s.id } });
    });

    it('Series thuộc Composer khác -> 400 details seriesId', async () => {
      const a = await createComposer('A');
      const b = await createComposer('B');
      const seriesOfB = await createSeries('S', b.id);
      const error = errorOf(
        await post('/admin/sheets', { title: 'X', composerId: a.id, seriesId: seriesOfB.id, level: 'BEGINNER' }).expect(400),
      );
      expect(error.details).toEqual([{ path: 'seriesId', message: expect.any(String) }]);
      expect(await prisma.sheet.count()).toBe(0);
    });

    it.each([
      ['composerId', (_composerId: string) => ({ composerId: MISSING_ID })],
      ['seriesId', (composerId: string) => ({ composerId, seriesId: MISSING_ID })],
      ['genreIds', (composerId: string) => ({ composerId, genreIds: [MISSING_ID] })],
    ])('%s không tồn tại -> 400 details đúng trường', async (field, build) => {
      const c = await createComposer('A');
      const error = errorOf(await post('/admin/sheets', { title: 'X', level: 'BEGINNER', ...build(c.id) }).expect(400));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([{ path: field, message: expect.any(String) }]);
    });
  });

  describe('Sửa', () => {
    async function seed() {
      const composer = await createComposer('Beethoven');
      const [g1, g2, g3] = [await createGenre('G1'), await createGenre('G2'), await createGenre('G3')];
      const sheet = await createSheet({
        title: 'Für Elise',
        composerId: composer.id,
        level: 'BEGINNER',
        lyricsChords: '[Am] la',
        youtubeUrl: `https://www.youtube.com/embed/${VIDEO_ID}`,
        genreIds: [g1.id, g2.id],
      });
      return { composer, g1, g2, g3, sheet };
    }

    it('đổi tiêu đề khi còn Draft -> slug sinh lại; tiêu đề giữ slug cơ sở -> không thêm hậu tố', async () => {
      const { sheet } = await seed();
      const renamed = sheetSchema.parse((await patch(`/admin/sheets/${sheet.id}`, { title: 'Bagatelle số 25' }).expect(200)).body);
      expect(renamed.slug).toBe('bagatelle-so-25');
      const back = sheetSchema.parse((await patch(`/admin/sheets/${sheet.id}`, { title: 'Bagatelle So 25!' }).expect(200)).body);
      expect(back.slug).toBe('bagatelle-so-25');
    });

    it('đã publish (first_published_at có giá trị) -> đổi tiêu đề không đổi slug', async () => {
      const { sheet } = await seed();
      await prisma.sheet.update({ where: { id: sheet.id }, data: { firstPublishedAt: new Date() } });
      const res = sheetSchema.parse((await patch(`/admin/sheets/${sheet.id}`, { title: 'Tên mới' }).expect(200)).body);
      expect(res).toMatchObject({ title: 'Tên mới', slug: 'fur-elise' });
    });

    it('xoá lyrics và youtube -> hasChords/hasVideo false', async () => {
      const { sheet } = await seed();
      expect(sheet).toMatchObject({ hasChords: true, hasVideo: true, youtubeUrl: CANONICAL });
      const res = sheetSchema.parse(
        (await patch(`/admin/sheets/${sheet.id}`, { lyricsChords: null, youtubeUrl: null }).expect(200)).body,
      );
      expect(res).toMatchObject({ hasChords: false, hasVideo: false, lyricsChords: null, youtubeUrl: null });
    });

    it('thay danh sách genre -> chỉ còn g3; không gửi genreIds -> giữ nguyên', async () => {
      const { sheet, g3 } = await seed();
      const res = sheetSchema.parse((await patch(`/admin/sheets/${sheet.id}`, { genreIds: [g3.id] }).expect(200)).body);
      expect(res.genres).toEqual([{ id: g3.id, name: 'G3' }]);
      const kept = sheetSchema.parse((await patch(`/admin/sheets/${sheet.id}`, { level: 'EXPERT' }).expect(200)).body);
      expect(kept).toMatchObject({ level: 'EXPERT', genres: [{ id: g3.id, name: 'G3' }] });
    });

    it('trường dẫn xuất / key lạ -> 400, không đổi gì', async () => {
      const { sheet } = await seed();
      for (const body of [{ hasSheet: true }, { pageCount: 5 }, { status: 'PUBLISHED' }, { title: 'B', isHot: true }]) {
        expect(errorOf(await patch(`/admin/sheets/${sheet.id}`, body).expect(400)).code).toBe('VALIDATION_FAILED');
      }
      expect((await get(`/admin/sheets/${sheet.id}`).expect(200)).body).toEqual(sheet);
    });

    it('đổi Composer mà Series cũ thuộc Composer khác -> 400 seriesId; bỏ Series cùng lúc -> 200', async () => {
      const { composer, sheet } = await seed();
      const series = await createSeries('Bagatelles', composer.id);
      await patch(`/admin/sheets/${sheet.id}`, { seriesId: series.id }).expect(200);
      const other = await createComposer('Chopin');
      const error = errorOf(await patch(`/admin/sheets/${sheet.id}`, { composerId: other.id }).expect(400));
      expect(error.details).toEqual([{ path: 'seriesId', message: expect.any(String) }]);
      const res = sheetSchema.parse(
        (await patch(`/admin/sheets/${sheet.id}`, { composerId: other.id, seriesId: null }).expect(200)).body,
      );
      expect(res).toMatchObject({ composer: { id: other.id, name: 'Chopin' }, series: null });
    });

    it('genreIds không tồn tại -> 400 details genreIds', async () => {
      const { sheet } = await seed();
      const error = errorOf(await patch(`/admin/sheets/${sheet.id}`, { genreIds: [MISSING_ID] }).expect(400));
      expect(error.details).toEqual([{ path: 'genreIds', message: expect.any(String) }]);
    });
  });

  describe('Xoá phân loại đang được Sheet dùng -> 409 RESOURCE_IN_USE', () => {
    it('Genre', async () => {
      const c = await createComposer('A');
      const g = await createGenre('Pop');
      await createSheet({ title: 'X', composerId: c.id, level: 'BEGINNER', genreIds: [g.id] });
      expect(errorOf(await del(`/admin/genres/${g.id}`).expect(409)).code).toBe('RESOURCE_IN_USE');
      await get(`/admin/genres/${g.id}`).expect(200);
    });

    it('Composer có Sheet', async () => {
      const c = await createComposer('A');
      await createSheet({ title: 'X', composerId: c.id, level: 'BEGINNER' });
      const error = errorOf(await del(`/admin/composers/${c.id}`).expect(409));
      expect(error.code).toBe('RESOURCE_IN_USE');
      expect(error.message).toMatch(/^Composer đang có 1 Sheet/);
      await get(`/admin/composers/${c.id}`).expect(200);
    });

    it('Composer có cả Series và Sheet -> thông điệp nêu cả hai', async () => {
      const c = await createComposer('A');
      await createSeries('S', c.id);
      await createSheet({ title: 'X', composerId: c.id, level: 'BEGINNER' });
      const error = errorOf(await del(`/admin/composers/${c.id}`).expect(409));
      expect(error.message).toBe(
        'Composer đang có 1 Series và 1 Sheet nên không thể xoá. Hãy xoá hoặc chuyển các Series và Sheet đó sang Composer khác trước.',
      );
    });

    it('Series có Sheet', async () => {
      const c = await createComposer('A');
      const s = await createSeries('S', c.id);
      await createSheet({ title: 'X', composerId: c.id, seriesId: s.id, level: 'BEGINNER' });
      expect(errorOf(await del(`/admin/series/${s.id}`).expect(409)).code).toBe('RESOURCE_IN_USE');
    });
  });

  describe('List', () => {
    it('lọc + tìm: chỉ Sheet khớp mọi điều kiện; sắp xếp updated_at giảm dần', async () => {
      const beethoven = await createComposer('Beethoven');
      const chopin = await createComposer('Chopin');
      const elise = await createSheet({ title: 'Für Elise', composerId: beethoven.id, level: 'BEGINNER' });
      await createSheet({ title: 'Für Elise (nâng cao)', composerId: beethoven.id, level: 'ADVANCED' });
      await createSheet({ title: 'Nocturne', composerId: chopin.id, level: 'BEGINNER' });
      const eliseChopin = await createSheet({ title: 'Elise khác', composerId: chopin.id, level: 'BEGINNER' });

      const listOf = async (qs: string) =>
        pageSchema(sheetListItemSchema).parse((await get(`/admin/sheets?${qs}`).expect(200)).body);

      const filtered = await listOf('q=elise&level=BEGINNER&status=DRAFT');
      expect(filtered.items.map((s) => s.title)).toEqual(['Elise khác', 'Für Elise']);
      expect(filtered.total).toBe(2);
      expect(filtered.items[1]).toEqual({
        id: elise.id,
        publicId: elise.publicId,
        title: 'Für Elise',
        slug: 'fur-elise',
        level: 'BEGINNER',
        status: 'DRAFT',
        composer: { id: beethoven.id, name: 'Beethoven' },
        isHot: false,
        updatedAt: elise.updatedAt,
      });

      // Không dấu / có dấu / hoa thường.
      for (const q of ['FÜR', 'fur elise', 'für']) {
        expect((await listOf(`q=${encodeURIComponent(q)}`)).total, q).toBe(2);
      }
      expect((await listOf(`composerId=${chopin.id}`)).items.map((s) => s.id)).toContain(eliseChopin.id);
      expect((await listOf(`composerId=${chopin.id}`)).total).toBe(2);
      expect((await listOf('status=PUBLISHED')).total).toBe(0);

      // Sửa Sheet cũ nhất -> lên đầu danh sách.
      await patch(`/admin/sheets/${elise.id}`, { description: 'x' }).expect(200);
      expect((await listOf('')).items[0]?.id).toBe(elise.id);

      const paged = await listOf('pageSize=1&page=2');
      expect(paged).toMatchObject({ page: 2, pageSize: 1, total: 4 });
      expect(paged.items).toHaveLength(1);
    });

    it.each(['level=X', 'status=Y', 'pageSize=101', 'composerId=abc'])('%s -> 400', async (qs) => {
      expect(errorOf(await get(`/admin/sheets?${qs}`).expect(400)).code).toBe('VALIDATION_FAILED');
    });
  });

  it('id lạ / không phải UUID -> 404 NOT_FOUND; không có DELETE', async () => {
    for (const id of [MISSING_ID, 'khong-phai-uuid']) {
      expect(errorOf(await get(`/admin/sheets/${id}`).expect(404)).code).toBe('NOT_FOUND');
      expect(errorOf(await patch(`/admin/sheets/${id}`, { title: 'X' }).expect(404)).code).toBe('NOT_FOUND');
    }
    const c = await createComposer('A');
    const sheet = await createSheet({ title: 'X', composerId: c.id, level: 'BEGINNER' });
    await del(`/admin/sheets/${sheet.id}`).expect(404);
    await get(`/admin/sheets/${sheet.id}`).expect(200);
  });

  it('không có access token -> 401', async () => {
    await http().get('/admin/sheets').expect(401);
    await http().post('/admin/sheets').send({}).expect(401);
    await http().patch(`/admin/sheets/${MISSING_ID}`).send({}).expect(401);
  });
});
