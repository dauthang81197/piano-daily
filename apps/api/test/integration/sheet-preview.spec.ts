import type { INestApplication } from '@nestjs/common';
import {
  errorResponseSchema,
  loginResponseSchema,
  PREVIEW_TOKEN_AUDIENCE,
  previewTokenResponseSchema,
  publicSheetDetailSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp, TEST_JWT_ACCESS_SECRET } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'preview-admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';

describe('Xem trước Sheet Draft (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access: string;
  let composerId: string;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const issue = (sheetId: string) =>
    http().post('/admin/preview-tokens').set('Authorization', `Bearer ${access}`).send({ sheetId });
  const tokenFor = async (sheetId: string) => previewTokenResponseSchema.parse((await issue(sheetId).expect(200)).body).token;
  const preview = (id: string, token?: string) => {
    const req = http().get(`/sheets/${id}/preview`);
    return token === undefined ? req : req.set('X-Preview-Token', token);
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await http()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.230')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    access = loginResponseSchema.parse(res.body).accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_view_dedupe, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
  });

  const addSheet = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT', extra: Record<string, unknown> = {}) => {
    n += 1;
    return prisma.sheet.create({
      data: { title: `S${n}`, slug: `s-${n}`, composerId, level: 'BEGINNER', status, ...extra },
    });
  };

  describe('POST /admin/preview-tokens', () => {
    it('cần đăng nhập: không access token -> 401', async () => {
      const sheet = await addSheet();
      await http().post('/admin/preview-tokens').send({ sheetId: sheet.id }).expect(401);
    });

    it('preview token không dùng được làm access token (401 trên /admin/*)', async () => {
      const sheet = await addSheet();
      const token = await tokenFor(sheet.id);
      await http().get('/admin/sheets').set('Authorization', `Bearer ${token}`).expect(401);
      await http().post('/admin/preview-tokens').set('Authorization', `Bearer ${token}`).send({ sheetId: sheet.id }).expect(401);
    });

    it('trả token và expiresAt cách bây giờ khoảng 10 phút', async () => {
      const sheet = await addSheet();
      const body = previewTokenResponseSchema.parse((await issue(sheet.id).expect(200)).body);
      const ttl = new Date(body.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(9 * 60_000);
      expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    });

    it('sheetId sai dạng hoặc key lạ -> 400 VALIDATION_FAILED', async () => {
      for (const body of [{ sheetId: 'abc' }, {}, { sheetId: '0192a000-0000-7000-8000-000000000001', extra: 1 }]) {
        const res = await http().post('/admin/preview-tokens').set('Authorization', `Bearer ${access}`).send(body).expect(400);
        expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('GET /sheets/:id/preview', () => {
    it('Draft + token hợp lệ: 200 chi tiết đầy đủ, no-store; Draft vẫn 404 ở route công khai', async () => {
      const sheet = await addSheet('DRAFT', { lyricsChords: '# Lời', pageCount: 1 });
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type: 'PAGE_IMAGE',
          storageKey: `public/sheets/${sheet.id}/p1.webp`,
          size: 5,
          mimeType: 'image/webp',
          pageNumber: 1,
        },
      });
      const token = await tokenFor(sheet.id);
      const res = await preview(sheet.id, token).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = publicSheetDetailSchema.parse(res.body);
      expect(body).toMatchObject({ id: sheet.id, slug: sheet.slug, lyricsChords: '# Lời' });
      expect(body.pages).toHaveLength(1);
      // Draft không lộ ở route công khai.
      await http().get(`/sheets/${sheet.slug}`).expect(404);
      const list = await http().get('/sheets').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(sheet.id);
    });

    it('Archived và Published cũng xem được bằng token', async () => {
      for (const status of ['ARCHIVED', 'PUBLISHED'] as const) {
        const sheet = await addSheet(status, { firstPublishedAt: new Date() });
        await preview(sheet.id, await tokenFor(sheet.id)).expect(200);
      }
    });

    it('mọi thất bại cho cùng một 404: thiếu, rác, của Sheet khác, Sheet lạ, id sai dạng', async () => {
      const a = await addSheet();
      const b = await addSheet();
      const tokenA = await tokenFor(a.id);
      const unknown = '0192a000-0000-7000-8000-00000000dead';
      const unknownToken = await tokenFor(unknown);
      const cases: [string, string | undefined][] = [
        [a.id, undefined],
        [a.id, 'khong.phai.jwt'],
        [a.id, ''],
        [b.id, tokenA], // token của Sheet A không xem được Sheet B
        [unknown, unknownToken], // token hợp lệ nhưng Sheet không tồn tại
        ['abc', tokenA], // id sai dạng
      ];
      const bodies: string[] = [];
      for (const [id, token] of cases) {
        const res = await preview(id, token).expect(404);
        bodies.push(JSON.stringify(errorResponseSchema.parse(res.body)));
      }
      expect(new Set(bodies).size).toBe(1);
    });

    it('token hết hạn -> 404', async () => {
      const sheet = await addSheet();
      const expired = await new JwtService({ secret: TEST_JWT_ACCESS_SECRET }).signAsync(
        { sheetId: sheet.id },
        { audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: -5 },
      );
      await preview(sheet.id, expired).expect(404);
    });

    it('access token không dùng được làm preview token -> 404', async () => {
      const sheet = await addSheet();
      await preview(sheet.id, access).expect(404);
    });

    it('token đặt trong query (không phải header) không được chấp nhận', async () => {
      const sheet = await addSheet();
      const token = await tokenFor(sheet.id);
      await http().get(`/sheets/${sheet.id}/preview?token=${token}`).expect(404);
    });

    it('seriesSheets và related chỉ gồm Sheet PUBLISHED, không lộ Draft khác', async () => {
      const series = await prisma.series.create({ data: { name: 'S', slug: 's', composerId } });
      const me = await addSheet('DRAFT', { seriesId: series.id });
      const draftSibling = await addSheet('DRAFT', { seriesId: series.id });
      const published = await addSheet('PUBLISHED', { seriesId: series.id, firstPublishedAt: new Date() });
      const draftSame = await addSheet('DRAFT');
      const body = publicSheetDetailSchema.parse((await preview(me.id, await tokenFor(me.id)).expect(200)).body);
      expect(body.seriesSheets.map((s) => s.id)).toEqual([published.id]);
      const ids = [...body.seriesSheets, ...body.related].map((s) => s.id);
      expect(ids).not.toContain(draftSibling.id);
      expect(ids).not.toContain(draftSame.id);
      expect(ids).not.toContain(me.id);
    });

    it('xem trước không đếm lượt xem và không đổi dữ liệu Sheet', async () => {
      const sheet = await addSheet('PUBLISHED', { firstPublishedAt: new Date() });
      await preview(sheet.id, await tokenFor(sheet.id)).expect(200);
      const after = await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } });
      expect(after.viewCount).toBe(0);
      expect(after.updatedAt.getTime()).toBe(sheet.updatedAt.getTime());
      expect(await prisma.sheetViewDedupe.count()).toBe(0);
    });

    it('/sheets/:slug vẫn là route chi tiết công khai (không bị route preview nuốt)', async () => {
      const sheet = await addSheet('PUBLISHED', { firstPublishedAt: new Date() });
      await http().get(`/sheets/${sheet.slug}`).expect(200);
    });
  });
});
