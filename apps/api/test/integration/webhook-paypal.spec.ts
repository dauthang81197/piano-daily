import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_PROVIDER } from '../../src/modules/commerce/payment-provider';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const SIG_HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-10-09T00:00:00Z',
};

describe('Webhook PayPal (Story 3.8, Postgres thật, provider và email giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let composerId: string;
  let n = 0;
  let eventSeq = 0;
  const provider = { createOrder: vi.fn(), getOrder: vi.fn(), capture: vi.fn(), refund: vi.fn(), verifyWebhook: vi.fn() };
  const email = { send: vi.fn(async (_message: { to: string; subject: string; html: string; text: string }) => true) };

  const post = (body: unknown, headers: Record<string, string> = SIG_HEADERS) =>
    request(app.getHttpServer())
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(typeof body === 'string' ? body : JSON.stringify(body));

  const event = (type: string, resource: object, id = `WH-${(eventSeq += 1)}`) => ({ id, event_type: type, resource });
  const capture = (over: object = {}) => ({
    id: 'CAP-1',
    amount: { value: '4.99', currency_code: 'USD' },
    supplementary_data: { related_ids: { order_id: 'PP-1' } },
    ...over,
  });

  const addOrder = async (status: 'PENDING' | 'PAID' | 'REFUNDED' = 'PENDING') => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: { title: `Sheet ${n}`, slug: `sheet-${n}`, composerId, level: 'BEGINNER', status: 'PUBLISHED', pricePdfCents: 499, firstPublishedAt: new Date() },
    });
    for (const type of ['PDF', 'MIDI', 'MP3'] as const) {
      await prisma.sheetFile.create({
        data: { sheetId: sheet.id, type, storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`, size: 1, mimeType: 'application/octet-stream' },
      });
    }
    return prisma.order.create({
      data: {
        orderCode: `PD-W${String(n).padStart(5, '0')}`,
        sheetId: sheet.id,
        email: 'buyer.secret@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status,
        paypalOrderId: 'PP-1',
      },
    });
  };

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
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    for (const fn of Object.values(provider)) fn.mockReset();
    email.send.mockClear();
    provider.verifyWebhook.mockResolvedValue(true);
  });

  it('migration: provider_event_id UNIQUE', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'payment_events' AND indexname = 'payment_events_provider_event_id_key'`;
    expect(rows).toHaveLength(1);
  });

  it('chữ ký sai: 400 VALIDATION_FAILED, không ghi PaymentEvent, không xử lý', async () => {
    const order = await addOrder();
    provider.verifyWebhook.mockResolvedValue(false);
    const res = await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
  });

  it('thiếu header chữ ký: 400, không gọi verifyWebhook', async () => {
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture()), { 'paypal-auth-algo': 'x' }).expect(400);
    expect(provider.verifyWebhook).not.toHaveBeenCalled();
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it('verifyWebhook ném lỗi (gọi PayPal hỏng): 503, không ghi gì', async () => {
    provider.verifyWebhook.mockRejectedValue(new Error('network'));
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(503);
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it('verifyWebhook nhận header và raw body nguyên bytes', async () => {
    const raw = '{"id":"WH-RAW",   "event_type":"X.Y","resource":{}}';
    await post(raw).expect(200);
    expect(provider.verifyWebhook).toHaveBeenCalledWith(expect.objectContaining(SIG_HEADERS), raw);
  });

  it.each([
    ['không phải JSON', 'not json'],
    ['thiếu id', { event_type: 'X', resource: {} }],
    ['thiếu event_type', { id: 'WH-1', resource: {} }],
    ['thiếu resource', { id: 'WH-1', event_type: 'X' }],
  ])('body %s (sau xác thực): 400, không ghi', async (_n, body) => {
    await post(body).expect(400);
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it('COMPLETED khi chưa capture-order: PAID + 1 token + 1 email, event processed', async () => {
    const order = await addOrder();
    const ev = event('PAYMENT.CAPTURE.COMPLETED', capture());
    await post(ev).expect(200);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: 'PAID', paypalCaptureId: 'CAP-1' });
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    const saved = await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: ev.id } });
    expect(saved.processedAt).not.toBeNull();
    expect(saved.type).toBe('PAYMENT.CAPTURE.COMPLETED');
  });

  it('COMPLETED gửi hai lần: một token, một email; lần hai trả 200 không xử lý lại', async () => {
    const order = await addOrder();
    const ev = event('PAYMENT.CAPTURE.COMPLETED', capture());
    await post(ev).expect(200);
    await post(ev).expect(200);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it('COMPLETED sau capture-order (Order đã PAID): không token/email thứ hai', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(200);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(200); // event id khác
    await new Promise((r) => setTimeout(r, 100));
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('tìm Order theo custom_id (order_code) khi thiếu related_ids', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture({ supplementary_data: undefined, custom_id: order.orderCode }))).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('Order REFUNDED: COMPLETED bị bỏ qua, vẫn REFUNDED', async () => {
    const order = await addOrder('REFUNDED');
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('REFUNDED');
    expect(await prisma.downloadToken.count()).toBe(0);
  });

  it('amount lệch: 503, review_required, không PAID, processed_at null; gửi lại vẫn được xử lý', async () => {
    const order = await addOrder();
    const ev = event('PAYMENT.CAPTURE.COMPLETED', capture({ amount: { value: '1.00', currency_code: 'USD' } }));
    await post(ev).expect(503);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PENDING', reviewRequired: true });
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: ev.id } })).processedAt).toBeNull();
    // Lần trước lỗi (processed_at null) thì xử lý lại: lần này vẫn lệch nên 503 và event vẫn chưa processed.
    await post(ev).expect(503);
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it('event trùng mà lần trước lỗi (processed_at null): xử lý lại và thành công', async () => {
    const order = await addOrder();
    const ev = event('PAYMENT.CAPTURE.COMPLETED', capture());
    await prisma.paymentEvent.create({ data: { providerEventId: ev.id, type: ev.event_type, payload: ev } });
    await post(ev).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: ev.id } })).processedAt).not.toBeNull();
  });

  it('REFUNDED: Order REFUNDED + refunded_at, token revoked_at, tải bằng token 410 TOKEN_REVOKED', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(200);
    const token = await prisma.downloadToken.findUniqueOrThrow({ where: { orderId: order.id } });
    await post(event('PAYMENT.CAPTURE.REFUNDED', capture())).expect(200);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('REFUNDED');
    expect(row.refundedAt).not.toBeNull();
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { orderId: order.id } })).revokedAt).not.toBeNull();
    const res = await request(app.getHttpServer()).get(`/downloads/${token.token}/PDF`).set('CF-Connecting-IP', '198.51.100.9').expect(410);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('TOKEN_REVOKED');
  });

  it('REFUNDED khi Order chưa PAID: 503, giữ nguyên để PayPal gửi lại', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.REFUNDED', capture())).expect(503);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: 'PENDING', refundedAt: null });
  });

  it('DENIED: Order PENDING sang FAILED', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.DENIED', capture())).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('FAILED');
  });

  it('DENIED khi đã PAID: giữ nguyên PAID', async () => {
    const order = await addOrder();
    await post(event('PAYMENT.CAPTURE.COMPLETED', capture())).expect(200);
    await post(event('PAYMENT.CAPTURE.DENIED', capture())).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('Order không tìm thấy: 200, event processed', async () => {
    const ev = event('PAYMENT.CAPTURE.COMPLETED', capture({ supplementary_data: { related_ids: { order_id: 'ZZ' } } }));
    await post(ev).expect(200);
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: ev.id } })).processedAt).not.toBeNull();
  });

  it('event type khác: lưu, processed, 200', async () => {
    const ev = event('CHECKOUT.ORDER.APPROVED', {});
    await post(ev).expect(200);
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: ev.id } })).processedAt).not.toBeNull();
  });
});
