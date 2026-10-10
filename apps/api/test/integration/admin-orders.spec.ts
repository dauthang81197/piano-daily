import type { INestApplication } from '@nestjs/common';
import { adminOrderDetailSchema, adminOrderListResponseSchema, errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';
const SECRET_TOKEN = 'SECRET-TOKEN-VALUE-0123456789';
const IP_HASH = 'a'.repeat(64);

describe('/admin/orders (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let sheetId: string;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(path).set('Authorization', `Bearer ${token}`);

  const addOrder = (over: Record<string, unknown> = {}) => {
    n += 1;
    return prisma.order.create({
      data: {
        orderCode: `PD-T${String(n).padStart(5, '0')}`,
        sheetId,
        email: 'buyer@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: 'PAID',
        ...over,
      } as never,
    });
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.211').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    const composer = await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } });
    sheetId = (
      await prisma.sheet.create({
        data: { title: 'Prelude', slug: 'prelude', composerId: composer.id, level: 'BEGINNER', status: 'PUBLISHED', pricePdfCents: 499, firstPublishedAt: new Date() },
      })
    ).id;
  });

  it('chưa đăng nhập -> 401', async () => {
    await http().get('/admin/orders').expect(401);
    await http().get(`/admin/orders/${MISSING_ID}`).expect(401);
  });

  it('danh sách mặc định: mới nhất trước, kèm total, dòng có Sheet và file đã mua', async () => {
    await addOrder({ createdAt: new Date('2026-09-01T00:00:00Z') });
    const newer = await addOrder({
      createdAt: new Date('2026-09-02T00:00:00Z'),
      items: [
        { fileType: 'PDF', priceCents: 499 },
        { fileType: 'MP3', priceCents: 199 },
      ],
      amountCents: 698,
    });
    const res = await get('/admin/orders').expect(200);
    const body = adminOrderListResponseSchema.parse(res.body);
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(body.items[0]).toMatchObject({ id: newer.id, fileTypes: ['PDF', 'MP3'], amountCents: 698, sheet: { title: 'Prelude' } });
  });

  it('lọc status + email một phần không phân biệt hoa thường', async () => {
    await addOrder({ email: 'nguyen@example.com' });
    await addOrder({ email: 'nguyen@example.com', status: 'PENDING' });
    await addOrder({ email: 'other@example.com' });
    const res = await get('/admin/orders?status=PAID&email=NGUY').expect(200);
    const body = adminOrderListResponseSchema.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.items[0].email).toBe('nguyen@example.com');
  });

  it('khoảng ngày theo giờ Việt Nam; from > to -> 400', async () => {
    const inside1 = await addOrder({ createdAt: new Date('2026-09-30T17:00:00Z') }); // 00:00 01/10 VN
    const inside2 = await addOrder({ createdAt: new Date('2026-10-01T16:59:59Z') }); // 23:59:59 01/10 VN
    await addOrder({ createdAt: new Date('2026-09-30T16:59:59Z') });
    await addOrder({ createdAt: new Date('2026-10-01T17:00:00Z') });
    const res = await get('/admin/orders?from=2026-10-01&to=2026-10-01').expect(200);
    const ids = adminOrderListResponseSchema.parse(res.body).items.map((i) => i.id).sort();
    expect(ids).toEqual([inside1.id, inside2.id].sort());
    const bad = await get('/admin/orders?from=2026-10-02&to=2026-10-01').expect(400);
    expect(errorResponseSchema.parse(bad.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('reviewRequired=true chỉ trả đơn cần xem xét; phân trang', async () => {
    const flagged = await addOrder({ reviewRequired: true });
    await addOrder();
    await addOrder();
    const res = await get('/admin/orders?reviewRequired=true').expect(200);
    const body = adminOrderListResponseSchema.parse(res.body);
    expect(body.items.map((i) => i.id)).toEqual([flagged.id]);
    expect(body.items[0].reviewRequired).toBe(true);
    const paged = adminOrderListResponseSchema.parse((await get('/admin/orders?page=2&pageSize=2').expect(200)).body);
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(paged.items).toHaveLength(1);
  });

  it('chi tiết đơn PAID: token, lượt tải mới nhất trước, không lộ token bí mật hay ipHash', async () => {
    const order = await addOrder({
      paypalOrderId: 'PP-1',
      paypalCaptureId: 'CAP-1',
      payerEmail: 'p@example.com',
      payerName: 'Payer',
      paidAt: new Date('2026-10-01T01:00:00Z'),
    });
    const dt = await prisma.downloadToken.create({
      data: { orderId: order.id, token: SECRET_TOKEN, expiresAt: new Date(Date.now() + 86_400_000), maxDownloads: 5, usedDownloads: 2 },
    });
    await prisma.downloadLog.create({ data: { sheetId, fileType: 'PDF', tokenId: dt.id, ipHash: IP_HASH, ua: 'UA-old', createdAt: new Date('2026-10-02T00:00:00Z') } });
    await prisma.downloadLog.create({ data: { sheetId, fileType: 'PDF', tokenId: dt.id, ipHash: IP_HASH, ua: 'UA-new', createdAt: new Date('2026-10-03T00:00:00Z') } });
    await prisma.downloadLog.create({ data: { sheetId, fileType: 'PDF', tokenId: null, ipHash: IP_HASH, ua: 'free', createdAt: new Date('2026-10-04T00:00:00Z') } });
    const res = await get(`/admin/orders/${order.id}`).expect(200);
    const body = adminOrderDetailSchema.parse(res.body);
    expect(body).toMatchObject({ paypalOrderId: 'PP-1', paypalCaptureId: 'CAP-1', payerEmail: 'p@example.com', payerName: 'Payer', paidAt: '2026-10-01T01:00:00.000Z' });
    expect(body.token).toMatchObject({ status: 'ACTIVE', usedDownloads: 2, maxDownloads: 5, revokedAt: null });
    expect(body.downloads.map((d) => d.ua)).toEqual(['UA-new', 'UA-old']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(res.body)).not.toContain(IP_HASH);
  });

  it('chi tiết đơn PENDING: token null, lịch sử rỗng', async () => {
    const order = await addOrder({ status: 'PENDING' });
    const body = adminOrderDetailSchema.parse((await get(`/admin/orders/${order.id}`).expect(200)).body);
    expect(body.token).toBeNull();
    expect(body.downloads).toEqual([]);
  });

  it('id lạ hoặc không phải uuid -> 404', async () => {
    const res = await get(`/admin/orders/${MISSING_ID}`).expect(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    await get('/admin/orders/khong-phai-uuid').expect(404);
  });
});
