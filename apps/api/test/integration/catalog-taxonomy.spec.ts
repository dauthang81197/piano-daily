import type { INestApplication } from '@nestjs/common';
import {
  composerSchema,
  errorResponseSchema,
  genreSchema,
  loginResponseSchema,
  pageSchema,
  seriesSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';

describe('/admin/{composers,genres,series} (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const get = (path: string) => auth(http().get(path));
  const post = (path: string, body: object) => auth(http().post(path)).send(body);
  const patch = (path: string, body: object) => auth(http().patch(path)).send(body);
  const del = (path: string) => auth(http().delete(path));

  function errorOf(res: request.Response) {
    return errorResponseSchema.parse(res.body).error;
  }

  async function createComposer(name: string, bio?: string) {
    return composerSchema.parse((await post('/admin/composers', { name, bio }).expect(201)).body);
  }

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await http()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.200')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE series, composers, genres CASCADE');
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Composer', () => {
    it('tạo -> 201, slug bỏ dấu; bio rỗng thành null', async () => {
      const res = await post('/admin/composers', { name: '  Trịnh Công Sơn ', bio: '  ' }).expect(201);
      expect(composerSchema.parse(res.body)).toEqual({
        id: expect.any(String),
        name: 'Trịnh Công Sơn',
        slug: 'trinh-cong-son',
        bio: null,
        avatar: null,
        seriesCount: 0,
      });
    });

    it('slug trùng -> hậu tố -2, -3', async () => {
      await createComposer('Trịnh Công Sơn');
      expect((await createComposer('Trinh Cong Son')).slug).toBe('trinh-cong-son-2');
      expect((await createComposer('TRỊNH công sơn!')).slug).toBe('trinh-cong-son-3');
    });

    it('tên chỉ có ký tự đặc biệt -> slug dự phòng, rồi thêm hậu tố', async () => {
      expect((await createComposer('!!!')).slug).toBe('composer');
      expect((await createComposer('???')).slug).toBe('composer-2');
    });

    it('hai request tạo đồng thời cùng tên -> slug khác nhau, không 500', async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () => post('/admin/composers', { name: 'Chopin' })),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(results.map((r) => (r.body as { slug: string }).slug).sort()).toEqual([
        'chopin',
        'chopin-2',
        'chopin-3',
        'chopin-4',
      ]);
    });

    it('đổi tên -> tên đổi, slug giữ nguyên; bỏ qua slug client gửi lên', async () => {
      const created = await createComposer('Trịnh Công Sơn', 'Nhạc sĩ');
      const res = await patch(`/admin/composers/${created.id}`, { name: 'Trịnh Công Sơn (1939–2001)', slug: 'x' }).expect(
        200,
      );
      expect(res.body).toMatchObject({ name: 'Trịnh Công Sơn (1939–2001)', slug: 'trinh-cong-son', bio: 'Nhạc sĩ' });
      const cleared = await patch(`/admin/composers/${created.id}`, { bio: null }).expect(200);
      expect(cleared.body).toMatchObject({ bio: null, name: 'Trịnh Công Sơn (1939–2001)' });
    });

    it.each([
      ['tên rỗng', { name: '  ' }],
      ['tên > 120 ký tự', { name: 'a'.repeat(121) }],
      ['thiếu tên', {}],
    ])('%s -> 400 VALIDATION_FAILED kèm details', async (_label, body) => {
      const error = errorOf(await post('/admin/composers', body).expect(400));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual(expect.arrayContaining([{ path: 'name', message: expect.any(String) }]));
    });

    it('PATCH tên rỗng -> 400', async () => {
      const created = await createComposer('Bach');
      expect(errorOf(await patch(`/admin/composers/${created.id}`, { name: ' ' }).expect(400)).code).toBe(
        'VALIDATION_FAILED',
      );
    });

    it('GET :id -> 200', async () => {
      const created = await createComposer('Bach');
      expect((await get(`/admin/composers/${created.id}`).expect(200)).body).toEqual(created);
    });

    it('xoá Composer không có Series -> 204', async () => {
      const created = await createComposer('Bach');
      await del(`/admin/composers/${created.id}`).expect(204);
      await get(`/admin/composers/${created.id}`).expect(404);
    });

    it('xoá Composer còn Series -> 409 RESOURCE_IN_USE, không xoá', async () => {
      const composer = await createComposer('Trịnh Công Sơn');
      await post('/admin/series', { name: 'Tình ca', composerId: composer.id }).expect(201);
      const error = errorOf(await del(`/admin/composers/${composer.id}`).expect(409));
      expect(error.code).toBe('RESOURCE_IN_USE');
      expect(error.message).toMatch(/^Composer đang có 1 Series/);
      await get(`/admin/composers/${composer.id}`).expect(200);
    });

    it('FK RESTRICT bị vi phạm lúc xoá (bỏ qua bước đếm) -> 409, không 500', async () => {
      const composer = await createComposer('Bach');
      await post('/admin/series', { name: 'Fugue', composerId: composer.id }).expect(201);
      // Giả lập race: bước kiểm tra thấy 0 Series, nhưng lúc DELETE Series đã tồn tại.
      const spy = vi
        .spyOn(prisma.composer, 'findUnique')
        .mockResolvedValueOnce({ ...composer, _count: { series: 0 } } as never);
      try {
        const error = errorOf(await del(`/admin/composers/${composer.id}`).expect(409));
        expect(error.code).toBe('RESOURCE_IN_USE');
        expect(spy).toHaveBeenCalledOnce();
      } finally {
        spy.mockRestore();
      }
      expect(await prisma.series.count()).toBe(1);
      await get(`/admin/composers/${composer.id}`).expect(200);
    });
  });

  describe('List', () => {
    it('tìm không dấu / không phân biệt hoa thường', async () => {
      await createComposer('Trịnh Công Sơn');
      await createComposer('Chopin');
      for (const q of ['trinh', 'TRỊNH', 'công sơn', 'cong son', 'Sơn']) {
        const body = pageSchema(composerSchema).parse((await get(`/admin/composers?q=${encodeURIComponent(q)}`).expect(200)).body);
        expect(body.items.map((c) => c.name), q).toEqual(['Trịnh Công Sơn']);
        expect(body.total).toBe(1);
      }
      const none = await get('/admin/composers?q=beethoven').expect(200);
      expect(none.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('phân trang: page=2&pageSize=20 -> đúng lát cắt, total đúng, sắp xếp theo tên', async () => {
      await prisma.composer.createMany({
        data: Array.from({ length: 25 }, (_, i) => {
          const name = `Composer ${String(i + 1).padStart(2, '0')}`;
          return { name, slug: `composer-${i + 1}` };
        }),
      });
      const first = pageSchema(composerSchema).parse((await get('/admin/composers').expect(200)).body);
      expect(first).toMatchObject({ page: 1, pageSize: 20, total: 25 });
      expect(first.items).toHaveLength(20);
      expect(first.items[0]?.name).toBe('Composer 01');
      const second = pageSchema(composerSchema).parse((await get('/admin/composers?page=2&pageSize=20').expect(200)).body);
      expect(second).toMatchObject({ page: 2, pageSize: 20, total: 25 });
      expect(second.items.map((c) => c.name)).toEqual(
        Array.from({ length: 5 }, (_, i) => `Composer ${String(i + 21).padStart(2, '0')}`),
      );
    });

    it.each(['pageSize=101', 'pageSize=0', 'page=0', 'page=abc'])('%s -> 400 VALIDATION_FAILED', async (qs) => {
      expect(errorOf(await get(`/admin/composers?${qs}`).expect(400)).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Genre', () => {
    it('tạo/sửa/xoá; icon trong danh sách hoặc null', async () => {
      const created = genreSchema.parse(
        (await post('/admin/genres', { name: 'Nhạc Phim', icon: 'film' }).expect(201)).body,
      );
      expect(created).toMatchObject({ name: 'Nhạc Phim', slug: 'nhac-phim', icon: 'film' });
      const updated = await patch(`/admin/genres/${created.id}`, { name: 'Nhạc phim & OST', icon: null }).expect(200);
      expect(updated.body).toMatchObject({ name: 'Nhạc phim & OST', slug: 'nhac-phim', icon: null });
      const list = await get('/admin/genres?q=phim').expect(200);
      expect(list.body).toMatchObject({ total: 1 });
      await del(`/admin/genres/${created.id}`).expect(204);
      await get(`/admin/genres/${created.id}`).expect(404);
    });

    it('icon ngoài danh sách -> 400 kèm details icon', async () => {
      const error = errorOf(await post('/admin/genres', { name: 'Pop', icon: 'rocket' }).expect(400));
      expect(error.details).toEqual([{ path: 'icon', message: expect.any(String) }]);
    });
  });

  describe('Series', () => {
    it('tạo -> 201 kèm {id,name} Composer; lọc theo composerId', async () => {
      const tcs = await createComposer('Trịnh Công Sơn');
      const chopin = await createComposer('Chopin');
      const created = seriesSchema.parse(
        (await post('/admin/series', { name: 'Tình Khúc', composerId: tcs.id }).expect(201)).body,
      );
      expect(created).toEqual({
        id: expect.any(String),
        name: 'Tình Khúc',
        slug: 'tinh-khuc',
        composer: { id: tcs.id, name: 'Trịnh Công Sơn' },
      });
      await post('/admin/series', { name: 'Nocturnes', composerId: chopin.id }).expect(201);

      const filtered = pageSchema(seriesSchema).parse((await get(`/admin/series?composerId=${chopin.id}`).expect(200)).body);
      expect(filtered.items.map((s) => s.name)).toEqual(['Nocturnes']);
      expect(filtered.total).toBe(1);
      expect((await get('/admin/series').expect(200)).body).toMatchObject({ total: 2 });
      const composers = pageSchema(composerSchema).parse((await get('/admin/composers').expect(200)).body);
      expect(composers.items.find((c) => c.id === tcs.id)?.seriesCount).toBe(1);
    });

    it('composerId không tồn tại -> 400 VALIDATION_FAILED (details composerId)', async () => {
      const error = errorOf(await post('/admin/series', { name: 'X', composerId: MISSING_ID }).expect(400));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([{ path: 'composerId', message: expect.any(String) }]);
      const bad = errorOf(await post('/admin/series', { name: 'X', composerId: 'khong-phai-uuid' }).expect(400));
      expect(bad.details).toEqual(expect.arrayContaining([{ path: 'composerId', message: expect.any(String) }]));
    });

    it('sửa: đổi tên và Composer, slug giữ nguyên; Composer lạ -> 400', async () => {
      const a = await createComposer('A');
      const b = await createComposer('B');
      const series = seriesSchema.parse((await post('/admin/series', { name: 'Sonata', composerId: a.id }).expect(201)).body);
      const res = await patch(`/admin/series/${series.id}`, { name: 'Sonatas', composerId: b.id }).expect(200);
      expect(res.body).toEqual({ id: series.id, name: 'Sonatas', slug: 'sonata', composer: { id: b.id, name: 'B' } });
      const error = errorOf(await patch(`/admin/series/${series.id}`, { composerId: MISSING_ID }).expect(400));
      expect(error.details).toEqual([{ path: 'composerId', message: expect.any(String) }]);
      await del(`/admin/series/${series.id}`).expect(204);
      await del(`/admin/composers/${b.id}`).expect(204);
    });
  });

  describe('id không tồn tại / không phải UUID -> 404 NOT_FOUND', () => {
    it.each(['composers', 'genres', 'series'])('/admin/%s', async (resource) => {
      for (const id of [MISSING_ID, 'khong-phai-uuid', '123']) {
        expect(errorOf(await get(`/admin/${resource}/${id}`).expect(404)).code).toBe('NOT_FOUND');
        expect(errorOf(await patch(`/admin/${resource}/${id}`, { name: 'X' }).expect(404)).code).toBe('NOT_FOUND');
        expect(errorOf(await del(`/admin/${resource}/${id}`).expect(404)).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('không có access token -> 401 UNAUTHORIZED', () => {
    it.each([
      ['GET', '/admin/composers'],
      ['POST', '/admin/composers'],
      ['GET', '/admin/genres'],
      ['DELETE', `/admin/genres/${MISSING_ID}`],
      ['GET', '/admin/series'],
      ['PATCH', `/admin/series/${MISSING_ID}`],
    ])('%s %s', async (method, path) => {
      const res = await http()[method.toLowerCase() as 'get'](path).send({ name: 'X' }).expect(401);
      expect(errorOf(res).code).toBe('UNAUTHORIZED');
    });
  });
});
