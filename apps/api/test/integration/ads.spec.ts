import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { adSlotSchema, errorResponseSchema, loginResponseSchema, publicAdSlotSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PASSWORD = 'correct-horse-battery';
const SUPER = 'ads-super@piano-daily.test';
const EDITOR = 'ads-editor@piano-daily.test';

type Call = { tags: string[] };

describe('Quảng cáo (Story 4.5, Postgres + web giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: http.Server;
  let superToken: string;
  let editorToken: string;
  let calls: Call[] = [];
  const previousWebUrl = process.env.WEB_INTERNAL_URL;

  const api = () => request(app.getHttpServer());
  const as = (token: string, req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const waitForCalls = async (n: number) => {
    for (let i = 0; i < 100 && calls.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  };
  const login = async (email: string, ip: string) => {
    const res = await api().post('/auth/login').set('CF-Connecting-IP', ip).send({ email, password: PASSWORD }).expect(200);
    return loginResponseSchema.parse(res.body).accessToken;
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/api/revalidate') calls.push({ tags: JSON.parse(body).tags });
        res.statusCode = 200;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.WEB_INTERNAL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({ data: { email: SUPER, passwordHash, name: 'Founder', role: 'SUPER_ADMIN' } });
    await prisma.user.create({ data: { email: EDITOR, passwordHash, name: 'Editor', role: 'EDITOR' } });
    superToken = await login(SUPER, '198.51.100.230');
    editorToken = await login(EDITOR, '198.51.100.231');
  });

  afterAll(async () => {
    await prisma?.adSlot.deleteMany();
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousWebUrl === undefined) delete process.env.WEB_INTERNAL_URL;
    else process.env.WEB_INTERNAL_URL = previousWebUrl;
  });

  beforeEach(async () => {
    await prisma.adSlot.deleteMany();
    calls = [];
  });

  it('chưa đăng nhập: 401 trên mọi route admin/ads', async () => {
    await api().get('/admin/ads').expect(401);
    await api().post('/admin/ads').send({}).expect(401);
  });

  it('SUPER_ADMIN tạo slot html: 201, lưu, revalidate ads', async () => {
    const res = await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: '<b>ad</b>' }).expect(201);
    const slot = adSlotSchema.parse(res.body);
    expect(slot).toMatchObject({ position: 'HEADER', htmlCode: '<b>ad</b>', image: null, link: null, isActive: false });
    expect(await prisma.adSlot.count()).toBe(1);
    await waitForCalls(1);
    expect(calls[0]?.tags).toEqual(['ads']);
  });

  it('tạo slot ảnh với image + link https', async () => {
    const res = await as(superToken, api().post('/admin/ads'))
      .send({ position: 'SIDEBAR_LEFT', image: 'https://cdn.example.com/a.png', link: 'https://example.com' })
      .expect(201);
    expect(adSlotSchema.parse(res.body)).toMatchObject({ position: 'SIDEBAR_LEFT', htmlCode: null });
  });

  it.each([
    ['thiếu nội dung', { position: 'HEADER' }],
    ['thiếu link', { position: 'HEADER', image: 'https://a.example/x.png' }],
    ['thiếu image', { position: 'HEADER', link: 'https://a.example' }],
    ['http://', { position: 'HEADER', image: 'http://a.example/x.png', link: 'https://a.example' }],
    ['javascript:', { position: 'HEADER', image: 'https://a.example/x.png', link: 'javascript:alert(1)' }],
    ['vị trí lạ', { position: 'NOPE', htmlCode: 'x' }],
    ['html quá dài', { position: 'HEADER', htmlCode: 'a'.repeat(20001) }],
  ])('POST sai (%s): 400 và không ghi', async (_name, body) => {
    const res = await as(superToken, api().post('/admin/ads')).send(body).expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.adSlot.count()).toBe(0);
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toHaveLength(0);
  });

  it('trùng vị trí: 409 và không ghi thêm', async () => {
    await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: 'a' }).expect(201);
    await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: 'b' }).expect(409);
    expect(await prisma.adSlot.count()).toBe(1);
  });

  it('CHECK ở DB chặn slot không có nội dung', async () => {
    await expect(prisma.adSlot.create({ data: { position: 'HEADER' } })).rejects.toThrow();
    await expect(prisma.adSlot.create({ data: { position: 'HEADER', image: 'https://a.example/x.png' } })).rejects.toThrow();
  });

  it('EDITOR xem được danh sách nhưng mọi thao tác ghi là 403 FORBIDDEN', async () => {
    const slot = await prisma.adSlot.create({ data: { position: 'IN_LIST', htmlCode: 'x' } });
    const list = await as(editorToken, api().get('/admin/ads')).expect(200);
    expect(list.body).toHaveLength(1);

    const writes = [
      as(editorToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: 'x' }),
      as(editorToken, api().patch(`/admin/ads/${slot.id}`)).send({ htmlCode: 'y' }),
      as(editorToken, api().patch(`/admin/ads/${slot.id}/active`)).send({ isActive: true }),
      as(editorToken, api().delete(`/admin/ads/${slot.id}`)),
      // body sai vẫn 403 (guard chạy trước validate)
      as(editorToken, api().post('/admin/ads')).send({}),
    ];
    for (const req of writes) {
      const res = await req.expect(403);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    }
    const after = await prisma.adSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after).toMatchObject({ htmlCode: 'x', isActive: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toHaveLength(0);
  });

  it('sửa slot, bật/tắt, xoá: lưu và revalidate; id lạ 404', async () => {
    const created = adSlotSchema.parse(
      (await as(superToken, api().post('/admin/ads')).send({ position: 'IN_CONTENT', htmlCode: 'a' }).expect(201)).body,
    );
    const updated = await as(superToken, api().patch(`/admin/ads/${created.id}`))
      .send({ htmlCode: '', image: 'https://a.example/x.png', link: 'https://a.example' })
      .expect(200);
    expect(adSlotSchema.parse(updated.body)).toMatchObject({ htmlCode: null, image: 'https://a.example/x.png' });

    const active = await as(superToken, api().patch(`/admin/ads/${created.id}/active`)).send({ isActive: true }).expect(200);
    expect(adSlotSchema.parse(active.body).isActive).toBe(true);

    await as(superToken, api().delete(`/admin/ads/${created.id}`)).expect(204);
    expect(await prisma.adSlot.count()).toBe(0);
    await waitForCalls(4);
    expect(calls.map((c) => c.tags)).toEqual([['ads'], ['ads'], ['ads'], ['ads']]);

    const unknown = '0193d0a0-0000-7000-8000-000000000000';
    await as(superToken, api().patch(`/admin/ads/${unknown}`)).send({ htmlCode: 'x', image: null, link: null }).expect(404);
    await as(superToken, api().patch(`/admin/ads/${unknown}/active`)).send({ isActive: true }).expect(404);
    await as(superToken, api().delete(`/admin/ads/${unknown}`)).expect(404);
    await as(superToken, api().delete('/admin/ads/not-a-uuid')).expect(404);
  });

  it('GET /ads công khai: chỉ slot đang bật, đúng 4 trường', async () => {
    await prisma.adSlot.create({ data: { position: 'HEADER', htmlCode: '<i>on</i>', isActive: true } });
    await prisma.adSlot.create({ data: { position: 'IN_LIST', htmlCode: '<i>off</i>', isActive: false } });
    const res = await api().get('/ads').expect(200);
    expect(res.body).toHaveLength(1);
    expect(publicAdSlotSchema.parse(res.body[0])).toEqual({
      position: 'HEADER',
      htmlCode: '<i>on</i>',
      image: null,
      link: null,
    });
    expect(Object.keys(res.body[0]).sort()).toEqual(['htmlCode', 'image', 'link', 'position']);
    expect(JSON.stringify(res.body)).not.toContain('off');
  });
});
