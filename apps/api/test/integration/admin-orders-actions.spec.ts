import type { INestApplication } from '@nestjs/common';
import { adminOrderDetailSchema, downloadStatusResponseSchema, errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';
const SECRET_TOKEN = 'SECRET-TOKEN-ACTIONS-0123456789';
const DAY = 86_400_000;

describe('Gửi lại email và gia hạn token (Story 4.2, Postgres thật, email giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: string;
  let sheetId: string;
  let n = 0;
  const email = { send: vi.fn(async (_message: { to: string; subject: string; html: string; text: string }): Promise<boolean | void> => true) };

  const http = () => request(app.getHttpServer());
  const post = (path: string) => http().post(path).set('Authorization', `Bearer ${jwt}`);
  const status = (token: string, ip: string) => http().get(`/downloads/${token}`).set('CF-Connecting-IP', ip);

  const addPaid = async (
    o: { status?: 'PAID' | 'REFUNDED' | 'PENDING'; expiresAt?: Date; max?: number; used?: number; revokedAt?: Date | null; noToken?: boolean } = {},
  ) => {
    n += 1;
    const order = await prisma.order.create({
      data: {
        orderCode: `PD-X${String(n).padStart(5, '0')}`,
        sheetId,
        email: 'buyer.secret@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: o.status ?? 'PAID',
        emailSentAt: new Date('2026-01-01T00:00:00Z'),
      } as never,
    });
    const token = `${SECRET_TOKEN}-${n}`;
    if (!o.noToken) {
      await prisma.downloadToken.create({
        data: {
          orderId: order.id,
          token,
          expiresAt: o.expiresAt ?? new Date(Date.now() + 5 * DAY),
          maxDownloads: o.max ?? 5,
          usedDownloads: o.used ?? 0,
          revokedAt: o.revokedAt ?? null,
        },
      });
    }
    return { order, token };
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl(), [], [{ token: EMAIL_PORT, value: email }]);
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.212').send({ email: EMAIL, password: PASSWORD }).expect(200);
    jwt = loginResponseSchema.parse(res.body).accessToken;
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
    email.send.mockClear();
    email.send.mockImplementation(async () => true);
  });

  it('chưa đăng nhập -> 401; đơn lạ -> 404', async () => {
    await http().post(`/admin/orders/${MISSING_ID}/resend-email`).expect(401);
    await http().post(`/admin/orders/${MISSING_ID}/extend-token`).send({ addDays: 1 }).expect(401);
    await post(`/admin/orders/${MISSING_ID}/resend-email`).expect(404);
    await post(`/admin/orders/${MISSING_ID}/extend-token`).send({ addDays: 1 }).expect(404);
  });

  it('gửi lại email: gửi link, ghi đè email_sent_at, trả chi tiết không lộ token', async () => {
    const { order, token } = await addPaid();
    const res = await post(`/admin/orders/${order.id}/resend-email`).expect(200);
    const body = adminOrderDetailSchema.parse(res.body);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].text).toContain(`/downloads/${token}`);
    expect(new Date(body.emailSentAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(JSON.stringify(res.body)).not.toContain(token);
    // Admin không bị giới hạn 3 lần/giờ của người mua.
    for (let i = 0; i < 4; i += 1) await post(`/admin/orders/${order.id}/resend-email`).expect(200);
  });

  it('email lỗi: 502 kèm lý do, email_sent_at giữ nguyên; adapter chưa cấu hình: 503', async () => {
    const { order } = await addPaid();
    email.send.mockImplementationOnce(async () => {
      throw new Error('smtp down');
    });
    const res = await post(`/admin/orders/${order.id}/resend-email`).expect(502);
    expect(errorResponseSchema.parse(res.body).error.message).toMatch(/Gửi email thất bại/);
    email.send.mockImplementationOnce(async () => false);
    const res2 = await post(`/admin/orders/${order.id}/resend-email`).expect(503);
    expect(errorResponseSchema.parse(res2.body).error.message).toMatch(/chưa được cấu hình/);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.emailSentAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('đơn REFUNDED / PENDING bị từ chối 409 ORDER_NOT_PAID, không gửi, không ghi', async () => {
    for (const orderStatus of ['REFUNDED', 'PENDING'] as const) {
      const { order, token } = await addPaid({ status: orderStatus, expiresAt: new Date(Date.now() - DAY) });
      const r1 = await post(`/admin/orders/${order.id}/resend-email`).expect(409);
      expect(errorResponseSchema.parse(r1.body).error.code).toBe('ORDER_NOT_PAID');
      const r2 = await post(`/admin/orders/${order.id}/extend-token`).send({ addDays: 7, addDownloads: 2 }).expect(409);
      expect(errorResponseSchema.parse(r2.body).error.code).toBe('ORDER_NOT_PAID');
      const t = await prisma.downloadToken.findUniqueOrThrow({ where: { token } });
      expect(t.maxDownloads).toBe(5);
      expect(t.expiresAt.getTime()).toBeLessThan(Date.now());
    }
    expect(email.send).not.toHaveBeenCalled();
  });

  it('token đã vô hiệu: cả hai thao tác bị từ chối 409, không ghi', async () => {
    const { order, token } = await addPaid({ revokedAt: new Date() });
    await post(`/admin/orders/${order.id}/resend-email`).expect(409);
    await post(`/admin/orders/${order.id}/extend-token`).send({ addDays: 7 }).expect(409);
    const t = await prisma.downloadToken.findUniqueOrThrow({ where: { token } });
    expect(t.maxDownloads).toBe(5);
    expect(t.revokedAt).not.toBeNull();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('gia hạn token hết hạn: hạn mới = now + 7 ngày, trang tải phản ánh ngay', async () => {
    const { order, token } = await addPaid({ expiresAt: new Date(Date.now() - 3 * DAY) });
    const before = await status(token, '203.0.113.50').expect(200);
    expect(downloadStatusResponseSchema.parse(before.body).status).toBe('EXPIRED');
    const res = await post(`/admin/orders/${order.id}/extend-token`).send({ addDays: 7 }).expect(200);
    const body = adminOrderDetailSchema.parse(res.body);
    expect(body.token).toMatchObject({ status: 'ACTIVE', maxDownloads: 5 });
    const delta = new Date(body.token!.expiresAt).getTime() - (Date.now() + 7 * DAY);
    expect(Math.abs(delta)).toBeLessThan(60_000);
    const page = await status(token, '203.0.113.51').expect(200);
    expect(downloadStatusResponseSchema.parse(page.body).status).toBe('ACTIVE');
  });

  it('gia hạn token còn hạn cộng dồn vào hạn cũ; hết lượt: max tăng, used giữ nguyên', async () => {
    const future = new Date(Date.now() + 10 * DAY);
    const { order, token } = await addPaid({ expiresAt: future, max: 5, used: 5 });
    const exhausted = await status(token, '203.0.113.52').expect(200);
    expect(downloadStatusResponseSchema.parse(exhausted.body).status).toBe('EXHAUSTED');
    await post(`/admin/orders/${order.id}/extend-token`).send({ addDays: 5, addDownloads: 3 }).expect(200);
    const t = await prisma.downloadToken.findUniqueOrThrow({ where: { token } });
    expect(t.maxDownloads).toBe(8);
    expect(t.usedDownloads).toBe(5);
    expect(t.expiresAt.getTime()).toBe(future.getTime() + 5 * DAY);
    const page = await status(token, '203.0.113.53').expect(200);
    expect(downloadStatusResponseSchema.parse(page.body)).toMatchObject({ status: 'ACTIVE', remainingDownloads: 3 });
  });

  it('body không hợp lệ: 400 và không ghi; vượt INT4: 400', async () => {
    const { order, token } = await addPaid();
    for (const bad of [{}, { addDays: 0 }, { addDownloads: -2 }, { addDays: 3651 }, { addDownloads: 1001 }, { addDays: 1.5 }]) {
      const res = await post(`/admin/orders/${order.id}/extend-token`).send(bad).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    }
    await prisma.downloadToken.update({ where: { token }, data: { maxDownloads: 2_147_483_000 } });
    await post(`/admin/orders/${order.id}/extend-token`).send({ addDownloads: 1000 }).expect(400);
    const t = await prisma.downloadToken.findUniqueOrThrow({ where: { token } });
    expect(t.maxDownloads).toBe(2_147_483_000);
  });

  it('đơn PAID chưa có token: 404 cho cả hai thao tác', async () => {
    const { order } = await addPaid({ noToken: true });
    await post(`/admin/orders/${order.id}/resend-email`).expect(404);
    await post(`/admin/orders/${order.id}/extend-token`).send({ addDays: 1 }).expect(404);
  });
});
