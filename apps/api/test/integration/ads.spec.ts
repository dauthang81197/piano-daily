import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { adImageResponseSchema, adSlotSchema, errorResponseSchema, loginResponseSchema, publicAdSlotSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PASSWORD = 'correct-horse-battery';
const SUPER = 'ads-super@piano-daily.test';
const EDITOR = 'ads-editor@piano-daily.test';

type Call = { tags: string[] };

describe('Quảng cáo: slot, nhiều sản phẩm, tải ảnh, lượt bấm (Postgres + web giả)', () => {
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

  const item = (over: Record<string, unknown> = {}) => ({
    platform: 'SHOPEE',
    image: 'https://cdn.example.com/a.webp',
    link: 'https://s.shopee.vn/abc',
    ...over,
  });
  const png = (width = 40, height = 20) =>
    sharp({ create: { width, height, channels: 3, background: '#cc8844' } }).png().toBuffer();

  it('chưa đăng nhập: 401 trên mọi route admin/ads', async () => {
    await api().get('/admin/ads').expect(401);
    await api().post('/admin/ads').send({}).expect(401);
    await api().post('/admin/ads/images').expect(401);
  });

  it('SUPER_ADMIN tạo slot html: 201, lưu, revalidate ads', async () => {
    const res = await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: '<b>ad</b>' }).expect(201);
    const slot = adSlotSchema.parse(res.body);
    expect(slot).toMatchObject({ position: 'HEADER', htmlCode: '<b>ad</b>', items: [], isActive: false });
    expect(await prisma.adSlot.count()).toBe(1);
    await waitForCalls(1);
    expect(calls[0]?.tags).toEqual(['ads']);
  });

  it('tạo slot nhiều sản phẩm: giữ thứ tự, nền tảng và nhãn; lượt bấm bắt đầu bằng 0', async () => {
    const res = await as(superToken, api().post('/admin/ads'))
      .send({
        position: 'IN_LIST',
        items: [item(), item({ platform: 'TIKTOK', link: 'https://vt.tiktok.com/x', label: 'Đàn điện' }), item({ platform: 'OTHER' })],
      })
      .expect(201);
    const slot = adSlotSchema.parse(res.body);
    expect(slot.items.map((i) => i.platform)).toEqual(['SHOPEE', 'TIKTOK', 'OTHER']);
    expect(slot.items[1]).toMatchObject({ label: 'Đàn điện', clicks7d: 0, clicks30d: 0, clicksTotal: 0 });
  });

  it.each([
    ['thiếu nội dung', { position: 'HEADER' }],
    ['không html, items rỗng', { position: 'HEADER', items: [] }],
    ['sản phẩm thiếu link', { position: 'HEADER', items: [{ platform: 'SHOPEE', image: 'https://a.example/x.png' }] }],
    ['http://', { position: 'HEADER', items: [item({ image: 'http://a.example/x.png' })] }],
    ['javascript:', { position: 'HEADER', items: [item({ link: 'javascript:alert(1)' })] }],
    ['nền tảng lạ', { position: 'HEADER', items: [item({ platform: 'FACEBOOK' })] }],
    ['13 sản phẩm', { position: 'HEADER', items: Array.from({ length: 13 }, () => item()) }],
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

  it('DB chặn sản phẩm có URL không phải https và nhãn quá dài', async () => {
    const slot = await prisma.adSlot.create({ data: { position: 'HEADER', htmlCode: 'x' } });
    const base = { slotId: slot.id, platform: 'OTHER' as const, sortOrder: 0, image: 'https://a.example/x.png', link: 'https://a.example' };
    await expect(prisma.adItem.create({ data: { ...base, image: 'http://a.example/x.png' } })).rejects.toThrow();
    await expect(prisma.adItem.create({ data: { ...base, link: 'javascript:1' } })).rejects.toThrow();
    await expect(prisma.adItem.create({ data: { ...base, label: 'a'.repeat(121) } })).rejects.toThrow();
    await expect(prisma.adItem.create({ data: base })).resolves.toBeDefined();
  });

  it('EDITOR xem được danh sách nhưng mọi thao tác ghi và tải ảnh là 403 FORBIDDEN', async () => {
    const slot = await prisma.adSlot.create({ data: { position: 'IN_LIST', htmlCode: 'x' } });
    const list = await as(editorToken, api().get('/admin/ads')).expect(200);
    expect(list.body).toHaveLength(1);

    // Mỗi request được tạo ngay trước khi chờ (supertest đóng server tạm sau request đầu nếu tạo sẵn cả loạt).
    const writes: (() => request.Test)[] = [
      () => as(editorToken, api().post('/admin/ads')).send({ position: 'HEADER', htmlCode: 'x' }),
      () => as(editorToken, api().patch(`/admin/ads/${slot.id}`)).send({ htmlCode: 'y', items: [] }),
      () => as(editorToken, api().patch(`/admin/ads/${slot.id}/active`)).send({ isActive: true }),
      () => as(editorToken, api().delete(`/admin/ads/${slot.id}`)),
      // body sai vẫn 403 (guard chạy trước validate)
      () => as(editorToken, api().post('/admin/ads')).send({}),
    ];
    for (const makeRequest of writes) {
      const res = await makeRequest().expect(403);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    }
    const upload = await as(editorToken, api().post('/admin/ads/images')).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(403);
    expect(errorResponseSchema.parse(upload.body).error.code).toBe('FORBIDDEN');
    const after = await prisma.adSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after).toMatchObject({ htmlCode: 'x', isActive: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toHaveLength(0);
  });

  it('sửa slot: giữ id thì giữ số lượt bấm, thêm mới, bỏ item thì xoá cả lượt bấm; bật/tắt; xoá; id lạ 404', async () => {
    const created = adSlotSchema.parse(
      (await as(superToken, api().post('/admin/ads')).send({ position: 'IN_CONTENT', items: [item(), item({ platform: 'LAZADA' })] }).expect(201)).body,
    );
    const [keep, drop] = created.items;
    await api().post(`/ads/items/${keep!.id}/click`).set('CF-Connecting-IP', '198.51.100.240').expect(204);
    await api().post(`/ads/items/${drop!.id}/click`).set('CF-Connecting-IP', '198.51.100.240').expect(204);

    const updated = adSlotSchema.parse(
      (await as(superToken, api().patch(`/admin/ads/${created.id}`))
        .send({ htmlCode: '', items: [item({ platform: 'TIKTOK', label: 'Mới' }), { ...item({ link: 'https://s.shopee.vn/doi' }), id: keep!.id }] })
        .expect(200)).body,
    );
    expect(updated.items.map((i) => [i.platform, i.label])).toEqual([['TIKTOK', 'Mới'], ['SHOPEE', null]]);
    expect(updated.items[1]).toMatchObject({ id: keep!.id, link: 'https://s.shopee.vn/doi', clicksTotal: 1 });
    expect(await prisma.adItem.count({ where: { id: drop!.id } })).toBe(0);
    expect(await prisma.adClick.count({ where: { itemId: drop!.id } })).toBe(0);

    const active = await as(superToken, api().patch(`/admin/ads/${created.id}/active`)).send({ isActive: true }).expect(200);
    expect(adSlotSchema.parse(active.body).isActive).toBe(true);

    await as(superToken, api().delete(`/admin/ads/${created.id}`)).expect(204);
    expect(await prisma.adSlot.count()).toBe(0);
    expect(await prisma.adItem.count()).toBe(0);
    await waitForCalls(4);
    expect(calls.map((c) => c.tags)).toEqual([['ads'], ['ads'], ['ads'], ['ads']]);

    const unknown = '0193d0a0-0000-7000-8000-000000000000';
    await as(superToken, api().patch(`/admin/ads/${unknown}`)).send({ htmlCode: 'x', items: [] }).expect(404);
    await as(superToken, api().patch(`/admin/ads/${unknown}/active`)).send({ isActive: true }).expect(404);
    await as(superToken, api().delete(`/admin/ads/${unknown}`)).expect(404);
    await as(superToken, api().delete('/admin/ads/not-a-uuid')).expect(404);
  });

  it('PATCH: id sản phẩm của slot khác hoặc không tồn tại là 400, dữ liệu không đổi', async () => {
    const a = adSlotSchema.parse((await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', items: [item()] }).expect(201)).body);
    const b = adSlotSchema.parse((await as(superToken, api().post('/admin/ads')).send({ position: 'IN_LIST', items: [item()] }).expect(201)).body);
    const res = await as(superToken, api().patch(`/admin/ads/${a.id}`))
      .send({ htmlCode: null, items: [{ ...item(), id: b.items[0]!.id }] })
      .expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.adItem.count()).toBe(2);
    expect((await prisma.adItem.findUniqueOrThrow({ where: { id: a.items[0]!.id } })).link).toBe('https://s.shopee.vn/abc');
  });

  it('GET /ads công khai: chỉ slot đang bật, kèm sản phẩm và không có lượt bấm', async () => {
    const on = await prisma.adSlot.create({ data: { position: 'HEADER', htmlCode: '<i>on</i>', isActive: true } });
    await prisma.adItem.create({ data: { slotId: on.id, platform: 'TIKTOK', sortOrder: 0, image: 'https://a.example/x.png', link: 'https://a.example', label: 'Nhãn' } });
    await prisma.adSlot.create({ data: { position: 'IN_LIST', htmlCode: '<i>off</i>', isActive: false } });
    const res = await api().get('/ads').expect(200);
    expect(res.body).toHaveLength(1);
    const parsed = publicAdSlotSchema.parse(res.body[0]);
    expect(parsed).toMatchObject({ position: 'HEADER', htmlCode: '<i>on</i>' });
    expect(parsed.items).toEqual([expect.objectContaining({ platform: 'TIKTOK', image: 'https://a.example/x.png', link: 'https://a.example', label: 'Nhãn' })]);
    const raw = res.body as { items: object[] }[];
    expect(Object.keys(raw[0]!).sort()).toEqual(['htmlCode', 'items', 'position']);
    expect(Object.keys(raw[0]!.items[0]!).sort()).toEqual(['id', 'image', 'label', 'link', 'platform']);
    expect(JSON.stringify(res.body)).not.toContain('off');
  });

  it('tải ảnh: 201, URL công khai .webp, cạnh dài ≤ 1200 px, ảnh đọc được từ bucket', async () => {
    const res = await as(superToken, api().post('/admin/ads/images'))
      .attach('file', await png(2400, 600), { filename: 'banner.png', contentType: 'image/png' })
      .expect(201);
    const { url } = adImageResponseSchema.parse(res.body);
    expect(url).toMatch(/\/public\/ads\/[0-9a-f]{64}\.webp$/);
    const stored = await fetch(url);
    expect(stored.status).toBe(200);
    const meta = await sharp(Buffer.from(await stored.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1200, height: 300 });
  });

  it('tải ảnh lỗi: thiếu file 400, không phải ảnh 400, quá 2 MB 413 FILE_TOO_LARGE', async () => {
    const missing = await as(superToken, api().post('/admin/ads/images')).expect(400);
    expect(JSON.stringify(errorResponseSchema.parse(missing.body).error.details)).toContain('"file"');
    const text = await as(superToken, api().post('/admin/ads/images'))
      .attach('file', Buffer.from('không phải ảnh'), { filename: 'a.png', contentType: 'image/png' })
      .expect(400);
    expect(errorResponseSchema.parse(text.body).error.code).toBe('VALIDATION_FAILED');
    const big = await as(superToken, api().post('/admin/ads/images'))
      .attach('file', Buffer.concat([await png(), Buffer.alloc(2 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(errorResponseSchema.parse(big.body).error.code).toBe('FILE_TOO_LARGE');
  });

  it('bấm sản phẩm: 204 và cộng lượt theo ngày; admin thấy 7 ngày, 30 ngày và tổng; không lưu IP', async () => {
    const slot = adSlotSchema.parse((await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', items: [item()] }).expect(201)).body);
    const id = slot.items[0]!.id;
    for (let i = 0; i < 3; i++) {
      const res = await api().post(`/ads/items/${id}/click`).set('CF-Connecting-IP', '198.51.100.241').expect(204);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    // Lượt cũ: 10 ngày trước (ngoài 7 ngày, trong 30 ngày) và 40 ngày trước (chỉ nằm trong tổng).
    await prisma.$executeRaw`INSERT INTO ad_clicks (item_id, day, count) VALUES (${id}::uuid, (now() AT TIME ZONE 'UTC')::date - 10, 5), (${id}::uuid, (now() AT TIME ZONE 'UTC')::date - 40, 7)`;
    const list = z_list(await as(superToken, api().get('/admin/ads')).expect(200));
    expect(list[0]!.items[0]).toMatchObject({ clicks7d: 3, clicks30d: 8, clicksTotal: 15 });
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_clicks' ORDER BY 1`;
    expect(columns.map((c) => c.column_name)).toEqual(['count', 'day', 'item_id']);
  });

  it('bấm id lạ hoặc sai dạng: vẫn 204, không ghi gì', async () => {
    await api().post('/ads/items/0193d0a0-0000-7000-8000-000000000000/click').set('CF-Connecting-IP', '198.51.100.242').expect(204);
    await api().post('/ads/items/not-a-uuid/click').set('CF-Connecting-IP', '198.51.100.242').expect(204);
    expect(await prisma.adClick.count()).toBe(0);
  });

  it('bấm quá 60 lần/phút từ một IP: 429, IP khác không bị ảnh hưởng', async () => {
    const slot = adSlotSchema.parse((await as(superToken, api().post('/admin/ads')).send({ position: 'HEADER', items: [item()] }).expect(201)).body);
    const id = slot.items[0]!.id;
    for (let i = 0; i < 60; i++) await api().post(`/ads/items/${id}/click`).set('CF-Connecting-IP', '198.51.100.243').expect(204);
    await api().post(`/ads/items/${id}/click`).set('CF-Connecting-IP', '198.51.100.243').expect(429);
    await api().post(`/ads/items/${id}/click`).set('CF-Connecting-IP', '198.51.100.244').expect(204);
  });

  it('migration chạy thật trên dữ liệu cũ: slot có image + link thành một sản phẩm OTHER, cột cũ bị bỏ, slot html giữ nguyên', async () => {
    const sql = readFileSync(path.join(__dirname, '../../prisma/migrations/20261012100000_ad_items_clicks/migration.sql'), 'utf8');
    // Bỏ dòng chú thích rồi tách theo `;` cuối câu (file không có `;` trong chuỗi/regex); chạy từng câu trong schema tạm.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    const rollback = new Error('rollback');
    let migrated: { link: string; platform: string; image: string; sort_order: number }[] = [];
    let remaining: string[] = [];
    let itemsOfBothSlot = -1;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('CREATE SCHEMA mig_ads');
        await tx.$executeRawUnsafe('SET LOCAL search_path TO mig_ads, public');
        // Bảng `ad_slots` ở dạng trước migration (Story 4.5), dùng enum vị trí có sẵn.
        await tx.$executeRawUnsafe(`CREATE TABLE ad_slots (
          id UUID NOT NULL DEFAULT uuidv7(), position public."AdPosition" NOT NULL, html_code TEXT, image TEXT, link TEXT,
          is_active BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ(6) NOT NULL, CONSTRAINT ad_slots_pkey PRIMARY KEY (id),
          CONSTRAINT ad_slots_content_check CHECK ((html_code IS NOT NULL AND btrim(html_code) <> '') OR (image IS NOT NULL AND link IS NOT NULL)),
          CONSTRAINT ad_slots_urls_check CHECK ((image IS NULL OR image ~ '^https://[^[:space:]]') AND (link IS NULL OR link ~ '^https://[^[:space:]]')))`);
        await tx.$executeRawUnsafe(
          `INSERT INTO ad_slots (position, image, link, updated_at) VALUES ('SIDEBAR_LEFT', 'https://cdn.example.com/old.png', 'https://shop.example.com/old', now())`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO ad_slots (position, html_code, updated_at) VALUES ('HEADER', '<b>html</b>', now())`);
        // Slot cũ có cả HTML lẫn ảnh + link: trước đây chỉ hiện HTML nên không được thêm sản phẩm.
        await tx.$executeRawUnsafe(
          `INSERT INTO ad_slots (position, html_code, image, link, updated_at) VALUES ('IN_LIST', '<i>both</i>', 'https://cdn.example.com/x.png', 'https://shop.example.com/x', now())`,
        );
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        migrated = await tx.$queryRawUnsafe(
          `SELECT i.link, i.platform::text AS platform, i.image, i.sort_order FROM ad_items i JOIN ad_slots s ON s.id = i.slot_id WHERE s.position = 'SIDEBAR_LEFT'`,
        );
        itemsOfBothSlot = (
          await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ad_items i JOIN ad_slots s ON s.id = i.slot_id WHERE s.position = 'IN_LIST'`)
        )[0]!.n;
        remaining = (
          await tx.$queryRawUnsafe<{ position: string; html_code: string | null }[]>(`SELECT position::text AS position, html_code FROM ad_slots ORDER BY position::text`)
        ).map((r) => `${r.position}:${r.html_code ?? ''}`);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(migrated).toEqual([{ link: 'https://shop.example.com/old', platform: 'OTHER', image: 'https://cdn.example.com/old.png', sort_order: 0 }]);
    expect(remaining).toEqual(['HEADER:<b>html</b>', 'IN_LIST:<i>both</i>', 'SIDEBAR_LEFT:']);
    expect(itemsOfBothSlot).toBe(0);
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_slots' AND table_schema = 'public'`;
    expect(cols.map((c) => c.column_name)).not.toContain('image');
    expect(cols.map((c) => c.column_name)).not.toContain('link');
    expect(await prisma.$queryRaw`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'mig_ads'`).toHaveLength(0);
  });
});

function z_list(res: request.Response) {
  return res.body.map((s: unknown) => adSlotSchema.parse(s)) as ReturnType<typeof adSlotSchema.parse>[];
}
