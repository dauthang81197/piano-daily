import type { INestApplication } from '@nestjs/common';
import { analyticsDashboardSchema, errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const IP_HASH = 'a'.repeat(64);

describe('/admin/analytics/dashboard (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let composerId: string;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(path).set('Authorization', `Bearer ${token}`);
  const dashboard = async (qs: string) => analyticsDashboardSchema.parse((await get(`/admin/analytics/dashboard${qs}`).expect(200)).body);

  const addSheet = (over: Record<string, unknown> = {}) => {
    n += 1;
    return prisma.sheet.create({
      data: { title: `Sheet ${n}`, slug: `sheet-${n}`, composerId, level: 'BEGINNER', status: 'PUBLISHED', firstPublishedAt: new Date(), ...over } as never,
    });
  };
  const addOrder = (sheetId: string, over: Record<string, unknown> = {}) => {
    n += 1;
    return prisma.order.create({
      data: {
        orderCode: `PD-A${String(n).padStart(5, '0')}`,
        sheetId,
        email: 'buyer@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: 'PAID',
        paidAt: new Date('2026-10-05T05:00:00Z'),
        ...over,
      } as never,
    });
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.212').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, orders, download_logs, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
  });

  it('chưa đăng nhập -> 401', async () => {
    await http().get('/admin/analytics/dashboard').expect(401);
  });

  it('DB trống: mọi tổng bằng 0, top rỗng, đủ 4 Level, chuỗi đủ ngày', async () => {
    const body = await dashboard('?from=2026-10-01&to=2026-10-03');
    expect(body.totals).toEqual({ revenueCents: 0, orders: 0, downloads: 0, sheets: 0, views: 0 });
    expect(body.levels.map((l) => l.level)).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);
    expect(body.levels.every((l) => l.sheets === 0 && l.views === 0 && l.downloads === 0)).toBe(true);
    expect(body.series).toEqual([
      { period: '2026-10-01', revenueCents: 0, orders: 0 },
      { period: '2026-10-02', revenueCents: 0, orders: 0 },
      { period: '2026-10-03', revenueCents: 0, orders: 0 },
    ]);
    expect(body.topSold).toEqual([]);
    expect(body.topViewed).toEqual([]);
    expect(body.recentSheets).toEqual([]);
  });

  it('khoảng mặc định là 30 ngày, granularity day', async () => {
    const body = await dashboard('');
    expect(body.series).toHaveLength(30);
    expect(body.range.granularity).toBe('day');
  });

  it('3 PAID + 1 REFUNDED: doanh thu 3500, 3 đơn; đơn PENDING không tính', async () => {
    const sheet = await addSheet();
    await addOrder(sheet.id, { amountCents: 1000 });
    await addOrder(sheet.id, { amountCents: 2000 });
    await addOrder(sheet.id, { amountCents: 500 });
    await addOrder(sheet.id, { amountCents: 700, status: 'REFUNDED', refundedAt: new Date('2026-10-06T00:00:00Z') });
    await addOrder(sheet.id, { amountCents: 900, status: 'PENDING', paidAt: null });
    const body = await dashboard('?from=2026-10-01&to=2026-10-10');
    expect(body.totals).toMatchObject({ revenueCents: 3500, orders: 3 });
    expect(body.series.find((p) => p.period === '2026-10-05')).toEqual({ period: '2026-10-05', revenueCents: 3500, orders: 3 });
    expect(body.topSold).toEqual([{ sheetId: sheet.id, title: sheet.title, orders: 3, revenueCents: 3500 }]);
  });

  it('ranh giới ngày theo giờ VN: 18:00Z thuộc ngày kế tiếp, to gồm cả ngày cuối', async () => {
    const sheet = await addSheet();
    await addOrder(sheet.id, { paidAt: new Date('2026-10-09T18:00:00Z'), amountCents: 100 }); // 01:00 ngày 10 VN
    await addOrder(sheet.id, { paidAt: new Date('2026-10-09T16:59:59Z'), amountCents: 200 }); // 23:59:59 ngày 9 VN
    await addOrder(sheet.id, { paidAt: new Date('2026-10-10T16:59:59Z'), amountCents: 400 }); // cuối ngày 10 VN
    await addOrder(sheet.id, { paidAt: new Date('2026-10-10T17:00:00Z'), amountCents: 800 }); // ngày 11 VN: ngoài khoảng
    const body = await dashboard('?from=2026-10-09&to=2026-10-10');
    expect(body.series).toEqual([
      { period: '2026-10-09', revenueCents: 200, orders: 1 },
      { period: '2026-10-10', revenueCents: 500, orders: 2 },
    ]);
    expect(body.totals.revenueCents).toBe(700);
  });

  it('theo tháng: hai tháng VN, tháng trống = 0', async () => {
    const sheet = await addSheet();
    await addOrder(sheet.id, { paidAt: new Date('2026-08-31T17:30:00Z'), amountCents: 300 }); // 00:30 01/09 VN
    await addOrder(sheet.id, { paidAt: new Date('2026-11-15T00:00:00Z'), amountCents: 700 });
    const body = await dashboard('?from=2026-08-15&to=2026-11-30&granularity=month');
    expect(body.series).toEqual([
      { period: '2026-08', revenueCents: 0, orders: 0 },
      { period: '2026-09', revenueCents: 300, orders: 1 },
      { period: '2026-10', revenueCents: 0, orders: 0 },
      { period: '2026-11', revenueCents: 700, orders: 1 },
    ]);
  });

  it('lượt tải free (token null) và paid đều được tính theo Level; Sheet/lượt xem là số hiện tại', async () => {
    const beginner = await addSheet({ viewCount: 7 });
    const expert = await addSheet({ level: 'EXPERT', viewCount: 5 });
    await addSheet({ level: 'EXPERT', status: 'DRAFT', viewCount: 100 });
    const order = await addOrder(beginner.id);
    const dt = await prisma.downloadToken.create({
      data: { orderId: order.id, token: 'tok-analytics-1', expiresAt: new Date('2027-01-01T00:00:00Z'), maxDownloads: 5 },
    });
    const at = new Date('2026-10-05T03:00:00Z');
    await prisma.downloadLog.create({ data: { sheetId: beginner.id, fileType: 'PDF', tokenId: dt.id, ipHash: IP_HASH, createdAt: at } });
    await prisma.downloadLog.create({ data: { sheetId: beginner.id, fileType: 'PDF', tokenId: null, ipHash: IP_HASH, createdAt: at } });
    await prisma.downloadLog.create({ data: { sheetId: expert.id, fileType: 'PDF', tokenId: null, ipHash: IP_HASH, createdAt: at } });
    await prisma.downloadLog.create({ data: { sheetId: expert.id, fileType: 'PDF', tokenId: null, ipHash: IP_HASH, createdAt: new Date('2026-01-01T00:00:00Z') } });
    const body = await dashboard('?from=2026-10-01&to=2026-10-10');
    const level = (l: string) => body.levels.find((r) => r.level === l);
    expect(level('BEGINNER')).toMatchObject({ sheets: 1, views: 7, downloads: 2 });
    expect(level('EXPERT')).toMatchObject({ sheets: 1, views: 5, downloads: 1 });
    expect(level('ADVANCED')).toMatchObject({ sheets: 0, views: 0, downloads: 0 });
    expect(body.totals).toMatchObject({ downloads: 3, sheets: 2, views: 12 });
    expect(body.topViewed[0]).toMatchObject({ viewCount: 100, level: 'EXPERT' });
    expect(body.recentSheets).toHaveLength(3);
  });

  it('top bán chạy xếp theo số đơn trong khoảng', async () => {
    const a = await addSheet();
    const b = await addSheet();
    await addOrder(a.id, { amountCents: 100 });
    await addOrder(b.id, { amountCents: 100 });
    await addOrder(b.id, { amountCents: 100 });
    const body = await dashboard('?from=2026-10-01&to=2026-10-10');
    expect(body.topSold.map((t) => t.sheetId)).toEqual([b.id, a.id]);
  });

  it('khoảng sai -> 400 VALIDATION_FAILED', async () => {
    for (const qs of ['?from=2026-10-02&to=2026-10-01', '?from=abc', '?from=2025-01-01&to=2026-10-01', '?from=2020-01-01', '?granularity=week']) {
      const res = await get(`/admin/analytics/dashboard${qs}`).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    }
  });
});
