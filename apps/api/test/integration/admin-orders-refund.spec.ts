import type { INestApplication } from '@nestjs/common';
import { adminOrderDetailSchema, errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_PROVIDER, RefundRejectedError } from '../../src/modules/commerce/payment-provider';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';
const SIG_HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-10-09T00:00:00Z',
};

describe('Hoàn tiền từ admin (Story 4.3, Postgres thật, provider giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: string;
  let sheetId: string;
  let n = 0;
  let eventSeq = 0;
  const provider = { createOrder: vi.fn(), getOrder: vi.fn(), capture: vi.fn(), refund: vi.fn(), verifyWebhook: vi.fn() };
  const email = { send: vi.fn(async (): Promise<boolean> => true) };

  const http = () => request(app.getHttpServer());
  const refund = (id: string) => http().post(`/admin/orders/${id}/refund`).set('Authorization', `Bearer ${jwt}`);
  const webhook = (paypalOrderId: string) =>
    http()
      .post('/webhooks/paypal')
      .set(SIG_HEADERS)
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          id: `WH-${(eventSeq += 1)}`,
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: { id: 'CAP-1', amount: { value: '4.99', currency_code: 'USD' }, supplementary_data: { related_ids: { order_id: paypalOrderId } } },
        }),
      );

  const addOrder = async (status: 'PAID' | 'REFUNDED' | 'PENDING' = 'PAID', captureId: string | null = 'CAP-1') => {
    n += 1;
    const order = await prisma.order.create({
      data: {
        orderCode: `PD-R${String(n).padStart(5, '0')}`,
        sheetId,
        email: 'buyer.secret@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status,
        paypalOrderId: `PP-${n}`,
        paypalCaptureId: captureId,
        paidAt: status === 'PENDING' ? null : new Date(),
        refundedAt: status === 'REFUNDED' ? new Date('2026-01-01T00:00:00Z') : null,
      } as never,
    });
    const token = `REFUND-TOKEN-${n}-0123456789`;
    await prisma.downloadToken.create({
      data: { orderId: order.id, token, expiresAt: new Date(Date.now() + 5 * 86_400_000), maxDownloads: 5, usedDownloads: 0 },
    });
    return { order, token };
  };

  const row = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const tokenRow = (orderId: string) => prisma.downloadToken.findUniqueOrThrow({ where: { orderId } });

  beforeAll(async () => {
    app = await createApp(
      resolveTestDatabaseUrl(),
      [],
      [
        { token: PAYMENT_PROVIDER, value: provider },
        { token: EMAIL_PORT, value: email },
      ],
      { PAYPAL_WEBHOOK_ID: 'WID-TEST' },
    );
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.213').send({ email: EMAIL, password: PASSWORD }).expect(200);
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
    for (const fn of Object.values(provider)) fn.mockReset();
    provider.verifyWebhook.mockResolvedValue(true);
    provider.refund.mockResolvedValue({ refundId: 'RF-1', status: 'COMPLETED' });
  });

  it('chưa đăng nhập -> 401; id lạ -> 404', async () => {
    await http().post(`/admin/orders/${MISSING_ID}/refund`).expect(401);
    await refund(MISSING_ID).expect(404);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('thành công: REFUNDED, refunded_at, token revoked, tải bằng token 410, trả chi tiết', async () => {
    const { order, token } = await addOrder();
    const res = await refund(order.id).expect(200);
    const body = adminOrderDetailSchema.parse(res.body);
    expect(body.status).toBe('REFUNDED');
    expect(body.refundedAt).not.toBeNull();
    expect(body.token?.revokedAt).not.toBeNull();
    expect(provider.refund).toHaveBeenCalledWith('CAP-1', `refund-${order.orderCode}`);
    expect((await row(order.id)).refundedAt).not.toBeNull();
    expect((await tokenRow(order.id)).revokedAt).not.toBeNull();
    const dl = await http().get(`/downloads/${token}/pdf`).set('CF-Connecting-IP', '198.51.100.14').expect(410);
    expect(errorResponseSchema.parse(dl.body).error.code).toBe('TOKEN_REVOKED');
  });

  it('PayPal từ chối: 422 REFUND_REJECTED kèm lý do, Order giữ PAID, token nguyên', async () => {
    const { order } = await addOrder();
    provider.refund.mockRejectedValue(new RefundRejectedError('Refund window expired'));
    const res = await refund(order.id).expect(422);
    const err = errorResponseSchema.parse(res.body).error;
    expect(err.code).toBe('REFUND_REJECTED');
    expect(err.message).toContain('Refund window expired');
    expect(await row(order.id)).toMatchObject({ status: 'PAID', refundedAt: null });
    expect((await tokenRow(order.id)).revokedAt).toBeNull();
  });

  it('lỗi mạng/5xx: 503, Order giữ PAID', async () => {
    const { order } = await addOrder();
    provider.refund.mockRejectedValue(new Error('ECONNRESET'));
    await refund(order.id).expect(503);
    expect(await row(order.id)).toMatchObject({ status: 'PAID', refundedAt: null });
    expect((await tokenRow(order.id)).revokedAt).toBeNull();
  });

  it('đơn không PAID: 409 ORDER_NOT_PAID, không gọi PayPal', async () => {
    for (const status of ['REFUNDED', 'PENDING'] as const) {
      const { order } = await addOrder(status);
      const res = await refund(order.id).expect(409);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('ORDER_NOT_PAID');
    }
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('PAID thiếu capture id: 409, không gọi PayPal', async () => {
    const { order } = await addOrder('PAID', null);
    await refund(order.id).expect(409);
    expect(provider.refund).not.toHaveBeenCalled();
    expect((await row(order.id)).status).toBe('PAID');
  });

  it('webhook đến sau: 200, refunded_at không đổi', async () => {
    const { order } = await addOrder();
    await refund(order.id).expect(200);
    const first = (await row(order.id)).refundedAt!;
    await webhook(order.paypalOrderId!).expect(200);
    expect((await row(order.id)).refundedAt!.getTime()).toBe(first.getTime());
    expect((await row(order.id)).status).toBe('REFUNDED');
  });

  it('webhook đến trước: admin nhận 409, không gọi PayPal, refunded_at không đổi', async () => {
    const { order } = await addOrder();
    await webhook(order.paypalOrderId!).expect(200);
    const first = (await row(order.id)).refundedAt!;
    await refund(order.id).expect(409);
    expect(provider.refund).not.toHaveBeenCalled();
    expect((await row(order.id)).refundedAt!.getTime()).toBe(first.getTime());
  });

  it('đồng thời admin + webhook: đúng một chuyển REFUNDED, không lỗi 5xx', async () => {
    const { order } = await addOrder();
    const [a, w] = await Promise.all([refund(order.id), webhook(order.paypalOrderId!)]);
    expect([200, 409]).toContain(a.status);
    expect(w.status).toBe(200);
    const final = await row(order.id);
    expect(final.status).toBe('REFUNDED');
    expect(final.refundedAt).not.toBeNull();
    expect((await tokenRow(order.id)).revokedAt).not.toBeNull();
    const refunded = await prisma.order.count({ where: { status: 'REFUNDED', refundedAt: { not: null } } });
    expect(refunded).toBe(1);
  });
});
