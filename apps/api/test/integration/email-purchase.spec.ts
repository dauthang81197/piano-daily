import type { INestApplication } from '@nestjs/common';
import { captureOrderResponseSchema, errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/modules/commerce/order.service';
import { PAYMENT_PROVIDER, type CaptureResult } from '../../src/modules/commerce/payment-provider';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp, TEST_CORS_WEB_ORIGIN } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const BUYER = 'buyer.secret@example.com';
const completed = (): CaptureResult => ({
  status: 'COMPLETED',
  captureId: 'CAP-1',
  amount: '4.99',
  currency: 'USD',
  payer: { email: 'payer@example.com', name: 'Jo Payer' },
});

describe('Email link tải và mua lại cùng email (Story 3.7, Postgres thật, provider và email giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let composerId: string;
  let n = 0;
  let ipSeq = 0;
  const provider = { createOrder: vi.fn(), getOrder: vi.fn(), capture: vi.fn(), refund: vi.fn(), verifyWebhook: vi.fn() };
  const email = { send: vi.fn(async (_message: { to: string; subject: string; html: string; text: string }) => true) };

  const ip = () => `198.51.100.${(ipSeq += 1)}`;
  const capture = (paypalOrderId = 'PP-1') =>
    request(app.getHttpServer()).post('/payments/paypal/capture-order').set('CF-Connecting-IP', ip()).send({ paypalOrderId });
  const createOrder = (body: object) =>
    request(app.getHttpServer()).post('/payments/paypal/create-order').set('CF-Connecting-IP', ip()).send(body);

  /** Sheet PUBLISHED (PDF 4.99, MP3 1.99) có file hiện hành PDF/MIDI/MP3. */
  const addSheet = async () => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: `Sheet ${n}`,
        slug: `sheet-${n}`,
        composerId,
        level: 'BEGINNER',
        status: 'PUBLISHED',
        pricePdfCents: 499,
        priceMp3Cents: 199,
        firstPublishedAt: new Date(),
      },
    });
    for (const type of ['PDF', 'MIDI', 'MP3'] as const) {
      await prisma.sheetFile.create({
        data: { sheetId: sheet.id, type, storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`, size: 1, mimeType: 'application/octet-stream' },
      });
    }
    return sheet;
  };

  /** Order PENDING mua PDF 4.99 của BUYER. */
  const addPendingOrder = async (sheetId: string, locale?: string) => {
    n += 1;
    return prisma.order.create({
      data: {
        orderCode: `PD-B${String(n).padStart(5, '0')}`,
        sheetId,
        email: BUYER,
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: 'PENDING',
        paypalOrderId: 'PP-1',
        ...(locale ? { locale } : {}),
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
    );
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    await prisma.siteSetting.update({ where: { key: 'payments_enabled' }, data: { value: 'true' } });
    for (const fn of [...Object.values(provider), email.send]) fn.mockClear();
    email.send.mockImplementation(async () => true);
    (app.get(OrderService) as unknown as { resendLog: Map<string, number[]> }).resendLog.clear(); // hạn mức gửi lại theo email
    provider.capture.mockReset();
    provider.createOrder.mockReset();
    provider.capture.mockResolvedValue(completed());
    provider.createOrder.mockResolvedValue({ providerOrderId: 'PP-NEW' });
  });

  it('migration: orders.locale mặc định vi, chỉ nhận vi|en', async () => {
    const sheet = await addSheet();
    const order = await addPendingOrder(sheet.id);
    expect(order.locale).toBe('vi');
    await expect(prisma.order.update({ where: { id: order.id }, data: { locale: 'fr' } })).rejects.toThrow();
  });

  it('capture thành công: 1 email đúng locale với link token, email_sent_at được set', async () => {
    const sheet = await addSheet();
    const order = await addPendingOrder(sheet.id, 'en');
    const res = await capture().expect(200);
    const body = captureOrderResponseSchema.parse(res.body);

    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    const sent = email.send.mock.calls[0]![0];
    expect(sent.to).toBe(BUYER);
    expect(sent.subject).toContain(order.orderCode);
    expect(sent.text).toContain(sheet.title);
    expect(sent.text).toContain(`${TEST_CORS_WEB_ORIGIN}/en/downloads/${body.token}`);
    await vi.waitFor(async () => {
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).emailSentAt).not.toBeNull();
    });
  });

  it('Resend lỗi: capture vẫn 200 có token, Order PAID, email_sent_at null', async () => {
    const sheet = await addSheet();
    const order = await addPendingOrder(sheet.id);
    email.send.mockRejectedValue(new Error(`boom ${BUYER}`));
    const res = await capture().expect(200);
    expect(captureOrderResponseSchema.parse(res.body).token.length).toBeGreaterThan(0);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: 'PAID', emailSentAt: null });
  });

  it('gọi capture lại khi đã PAID: không gửi email thứ hai', async () => {
    const sheet = await addSheet();
    await addPendingOrder(sheet.id);
    await capture().expect(200);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    await capture().expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('hai fulfil đồng thời: đúng một email', async () => {
    const sheet = await addSheet();
    const order = await addPendingOrder(sheet.id);
    const service = app.get(OrderService);
    await Promise.all([service.fulfil(order.id, completed()), service.fulfil(order.id, completed())]);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  describe('mua lại cùng email', () => {
    const paidSheet = async () => {
      const sheet = await addSheet();
      const order = await addPendingOrder(sheet.id);
      const token = captureOrderResponseSchema.parse((await capture().expect(200)).body).token;
      await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
      email.send.mockClear();
      return { sheet, order, token };
    };
    const buy = (sheetId: string, over: object = {}) =>
      createOrder({ sheetId, fileTypes: ['PDF'], email: ` ${BUYER.toUpperCase()} `, expectedTotalCents: 499, locale: 'vi', ...over });

    it('token sống bao phủ type: 409 ALREADY_PURCHASED không token, không Order mới, gửi lại email', async () => {
      const { sheet, token } = await paidSheet();
      const res = await buy(sheet.id).expect(409);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('ALREADY_PURCHASED');
      expect(JSON.stringify(res.body)).not.toContain(token);
      expect(await prisma.order.count()).toBe(1);
      expect(provider.createOrder).not.toHaveBeenCalled();
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0]![0].text).toContain(`${TEST_CORS_WEB_ORIGIN}/vi/downloads/${token}`);
    });

    it('token không bao phủ type (đã mua PDF, giờ mua MP3): tạo Order mới', async () => {
      const { sheet } = await paidSheet();
      await buy(sheet.id, { fileTypes: ['MP3'], expectedTotalCents: 199 }).expect(201);
      expect(await prisma.order.count()).toBe(2);
      expect(email.send).not.toHaveBeenCalled();
    });

    it.each([
      ['hết hạn', { expiresAt: new Date(Date.now() - 1000) }],
      ['hết lượt', { usedDownloads: 5 }],
      ['bị thu hồi', { revokedAt: new Date() }],
    ])('token %s: tạo Order mới', async (_n, data) => {
      const { sheet, order } = await paidSheet();
      await prisma.downloadToken.update({ where: { orderId: order.id }, data });
      await buy(sheet.id).expect(201);
      expect(await prisma.order.count()).toBe(2);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('email khác không bị coi là đã mua', async () => {
      const { sheet } = await paidSheet();
      await buy(sheet.id, { email: 'someone.else@example.com' }).expect(201);
    });

    it('quá 3 lần gửi lại/giờ cho một email: 429 TOO_MANY_REQUESTS, không gửi', async () => {
      const { sheet } = await paidSheet();
      for (let i = 0; i < 3; i += 1) await buy(sheet.id).expect(409);
      const res = await buy(sheet.id).expect(429);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('TOO_MANY_REQUESTS');
      expect(email.send).toHaveBeenCalledTimes(3);
    });
  });
});
