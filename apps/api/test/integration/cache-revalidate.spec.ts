import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { loginResponseSchema, sheetSchema, type Sheet } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp, TEST_INTERNAL_API_SECRET } from './create-app';
import { makeMidi } from './../fixtures/midi';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'].map((l) => `list:level:${l}`);

type Call = { secret: string | undefined; tags: string[] };

describe('Tự làm mới cache web (Postgres + web giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: http.Server;
  let token: string;
  let composerA: string;
  let composerB: string;
  let calls: Call[] = [];
  let respondWith = 200;
  const previousWebUrl = process.env.WEB_INTERNAL_URL;

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  const waitForCalls = async (n: number) => {
    for (let i = 0; i < 100 && calls.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  };
  /** Chờ rồi kiểm tra không có thêm lời gọi nào. */
  const settle = () => new Promise((r) => setTimeout(r, 300));

  const createSheet = async (title: string, level = 'BEGINNER'): Promise<Sheet> =>
    sheetSchema.parse(
      (await auth(api().post('/admin/sheets')).send({ title, composerId: composerA, level }).expect(201)).body,
    );
  const publish = async (id: string) => {
    await prisma.sheet.update({ where: { id }, data: { status: 'PUBLISHED', firstPublishedAt: new Date() } });
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/api/revalidate') {
          calls.push({ secret: req.headers['x-internal-secret'] as string | undefined, tags: JSON.parse(body).tags });
        }
        res.statusCode = respondWith;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const dbUrl = resolveTestDatabaseUrl();
    process.env.WEB_INTERNAL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await createApp(dbUrl);
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await api()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.210')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_files, sheet_genres, sheets, series, composers, genres CASCADE');
    composerA = (await prisma.composer.create({ data: { name: 'A', slug: 'a' } })).id;
    composerB = (await prisma.composer.create({ data: { name: 'B', slug: 'b' } })).id;
    calls = [];
    respondWith = 200;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => server.close(r));
    if (previousWebUrl === undefined) delete process.env.WEB_INTERNAL_URL;
    else process.env.WEB_INTERNAL_URL = previousWebUrl;
  });

  it('tạo Draft rồi sửa Draft: không gọi web', async () => {
    const sheet = await createSheet('Draft only');
    await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ title: 'Draft only 2' }).expect(200);
    await settle();
    expect(calls).toEqual([]);
  });

  it('đổi Level của Sheet PUBLISHED: tag level cũ và mới, kèm secret', async () => {
    const sheet = await createSheet('Level change');
    await publish(sheet.id);
    await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ level: 'INTERMEDIATE' }).expect(200);
    await waitForCalls(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.secret).toBe(TEST_INTERNAL_API_SECRET);
    expect(calls[0]!.tags).toEqual(
      expect.arrayContaining([`sheet:${sheet.id}`, 'list:level:beginner', 'list:level:intermediate', `list:composer:${composerA}`, 'search', 'sitemap']),
    );
  });

  it('đổi Composer: tag của cả hai Composer', async () => {
    const sheet = await createSheet('Composer change');
    await publish(sheet.id);
    await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ composerId: composerB }).expect(200);
    await waitForCalls(1);
    expect(calls[0]!.tags).toEqual(expect.arrayContaining([`list:composer:${composerA}`, `list:composer:${composerB}`]));
  });

  it('archive qua setStatus, setHot, xoá hẳn đều phát tag', async () => {
    const sheet = await createSheet('Lifecycle');
    await publish(sheet.id);

    await auth(api().patch(`/admin/sheets/${sheet.id}/hot`)).send({ isHot: true }).expect(200);
    await waitForCalls(1);
    expect(calls[0]!.tags).toContain(`sheet:${sheet.id}`);

    await auth(api().patch(`/admin/sheets/${sheet.id}/status`)).send({ status: 'ARCHIVED' }).expect(200);
    await waitForCalls(2);
    expect(calls[1]!.tags).toEqual(expect.arrayContaining([`sheet:${sheet.id}`, 'list:level:beginner']));

    await publish(sheet.id);
    await auth(api().delete(`/admin/sheets/${sheet.id}`)).expect(200);
    await waitForCalls(3);
    expect(calls[2]!.tags).toContain(`sheet:${sheet.id}`);
  });

  it('gỡ rồi đính file MIDI trên Sheet PUBLISHED phát tag (Draft thì không)', async () => {
    const sheet = await createSheet('Files');
    await auth(api().post(`/admin/sheets/${sheet.id}/files`)).field('type', 'MIDI')
      .attach('file', makeMidi(2), { filename: 'a.mid', contentType: 'audio/midi' }).expect(201);
    await settle();
    expect(calls).toEqual([]); // Draft

    await publish(sheet.id);
    await auth(api().delete(`/admin/sheets/${sheet.id}/files/midi`)).expect(204);
    await waitForCalls(1);
    expect(calls[0]!.tags).toContain(`sheet:${sheet.id}`);

    await auth(api().post(`/admin/sheets/${sheet.id}/files`)).field('type', 'MIDI')
      .attach('file', makeMidi(2), { filename: 'a.mid', contentType: 'audio/midi' }).expect(201);
    await waitForCalls(2);
    expect(calls[1]!.tags).toContain(`sheet:${sheet.id}`);
  });

  it('publish qua PATCH /status (DRAFT -> PUBLISHED) phát tag', async () => {
    const sheet = await createSheet('Publish via API');
    const file = (type: 'PDF' | 'THUMBNAIL' | 'PAGE_IMAGE', ext: string, mimeType: string) =>
      prisma.sheetFile.create({
        data: { sheetId: sheet.id, type, storageKey: `public/sheets/${sheet.id}/${type}.${ext}`, size: 10, mimeType, pageNumber: type === 'PDF' ? null : 1 },
      });
    await file('PDF', 'pdf', 'application/pdf');
    await file('THUMBNAIL', 'webp', 'image/webp');
    await file('PAGE_IMAGE', 'webp', 'image/webp');
    await settle();
    expect(calls).toEqual([]);

    await auth(api().patch(`/admin/sheets/${sheet.id}/status`)).send({ status: 'PUBLISHED' }).expect(200);
    await waitForCalls(1);
    expect(calls[0]!.tags).toEqual(expect.arrayContaining([`sheet:${sheet.id}`, 'list:level:beginner', 'search', 'sitemap']));
  });

  it('thao tác lỗi (404) không notify', async () => {
    const missing = '01920000-0000-7000-8000-000000000000';
    await auth(api().patch(`/admin/sheets/${missing}`)).send({ title: 'x' }).expect(404);
    await auth(api().patch(`/admin/composers/${missing}`)).send({ name: 'x' }).expect(404);
    await settle();
    expect(calls).toEqual([]);
  });

  it('Composer/Genre/Series create, update, remove phát tag taxonomy', async () => {
    const expectTaxonomy = (call: Call | undefined, tag: string) => {
      expect(call).toBeDefined();
      expect(call!.tags).toEqual(expect.arrayContaining([tag, ...LEVELS, 'search', 'sitemap']));
    };

    const composer = (await auth(api().post('/admin/composers')).send({ name: 'Chopin' }).expect(201)).body;
    await waitForCalls(1);
    expectTaxonomy(calls[0], `list:composer:${composer.id}`);
    await auth(api().patch(`/admin/composers/${composer.id}`)).send({ name: 'Chopin F.' }).expect(200);
    await waitForCalls(2);
    expectTaxonomy(calls[1], `list:composer:${composer.id}`);

    const genre = (await auth(api().post('/admin/genres')).send({ name: 'Jazz' }).expect(201)).body;
    await waitForCalls(3);
    expectTaxonomy(calls[2], `list:genre:${genre.id}`);
    await auth(api().patch(`/admin/genres/${genre.id}`)).send({ name: 'Jazz 2' }).expect(200);
    await auth(api().delete(`/admin/genres/${genre.id}`)).expect(204);
    await waitForCalls(5);
    expectTaxonomy(calls[4], `list:genre:${genre.id}`);

    const series = (await auth(api().post('/admin/series')).send({ name: 'Nocturnes', composerId: composer.id }).expect(201)).body;
    await waitForCalls(6);
    expectTaxonomy(calls[5], `list:series:${series.id}`);
    await auth(api().patch(`/admin/series/${series.id}`)).send({ name: 'Nocturnes 2' }).expect(200);
    await auth(api().delete(`/admin/series/${series.id}`)).expect(204);
    await waitForCalls(8);
    expectTaxonomy(calls[7], `list:series:${series.id}`);
  });

  it('web trả 500: thử 3 lần, thao tác admin vẫn thành công', async () => {
    respondWith = 500;
    const sheet = await createSheet('Web down');
    await publish(sheet.id);
    const res = await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ level: 'EXPERT' }).expect(200);
    expect(sheetSchema.parse(res.body).level).toBe('EXPERT');
    await waitForCalls(3);
    expect(calls).toHaveLength(3);
    await settle();
    expect(calls).toHaveLength(3);
  });
});
