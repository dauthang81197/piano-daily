import type { INestApplication } from '@nestjs/common';
import { captureOrderResponseSchema, errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetFileGcService } from '../../src/modules/catalog/sheet-file-gc.service';
import { SheetMediaService } from '../../src/modules/media/sheet-media.service';
import { OrderAlreadyCapturedError, PAYMENT_PROVIDER, type CaptureResult } from '../../src/modules/commerce/payment-provider';
import { OrderService } from '../../src/modules/commerce/order.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PAYER = 'payer.secret@example.com';
const completed = (over: Partial<CaptureResult> = {}): CaptureResult => ({
  status: 'COMPLETED',
  captureId: 'CAP-1',
  amount: '4.99',
  currency: 'USD',
  payer: { email: PAYER, name: 'Jo Payer' },
  ...over,
});

describe('Capture thanh toán và cấp DownloadToken (Story 3.4, Postgres thật, provider giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let composerId: string;
  let n = 0;
  let ipSeq = 0;
  const provider = {
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    capture: vi.fn(),
    refund: vi.fn(),
    verifyWebhook: vi.fn(),
  };

  const post = (body: unknown, ip?: string) =>
    request(app.getHttpServer())
      .post('/payments/paypal/capture-order')
      .set('CF-Connecting-IP', ip ?? `198.51.100.${(ipSeq += 1)}`)
      .send(body as object);

  /** Sheet PUBLISHED có file hiện hành PDF/MIDI/MP3 và một Order PENDING 4.99 mua PDF. */
  const addOrder = async (status: 'PENDING' | 'CANCELLED' | 'FAILED' = 'PENDING') => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: `Sheet ${n}`,
        slug: `sheet-${n}`,
        composerId,
        level: 'BEGINNER',
        status: 'PUBLISHED',
        pricePdfCents: 499,
        firstPublishedAt: new Date(),
      },
    });
    const files = [];
    for (const type of ['PDF', 'MIDI', 'MP3'] as const) {
      files.push(
        await prisma.sheetFile.create({
          data: {
            sheetId: sheet.id,
            type,
            storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`,
            size: 1,
            mimeType: 'application/octet-stream',
          },
        }),
      );
    }
    const order = await prisma.order.create({
      data: {
        orderCode: `PD-A${String(n).padStart(5, '0')}`,
        sheetId: sheet.id,
        email: 'buyer@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status,
        paypalOrderId: 'PP-1', // mỗi test chỉ có một đơn
      },
    });
    return { sheet, order, files };
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl(), [], [{ token: PAYMENT_PROVIDER, value: provider }]);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    await prisma.siteSetting.update({ where: { key: 'token_default_days' }, data: { value: '7' } });
    await prisma.siteSetting.update({ where: { key: 'token_default_max_downloads' }, data: { value: '5' } });
    for (const fn of Object.values(provider)) fn.mockReset();
    provider.capture.mockResolvedValue(completed());
  });

  it('migration: order_id UNIQUE, token_id của download_logs là FK SET NULL, file RESTRICT', async () => {
    const rows = await prisma.$queryRaw<{ conname: string; confdeltype: string }[]>`
      SELECT conname, confdeltype::text FROM pg_constraint
      WHERE conname IN ('download_logs_token_id_fkey', 'download_token_files_sheet_file_id_fkey', 'download_tokens_order_id_fkey')`;
    expect(Object.fromEntries(rows.map((r) => [r.conname, r.confdeltype]))).toEqual({
      download_logs_token_id_fkey: 'n',
      download_token_files_sheet_file_id_fkey: 'r',
      download_tokens_order_id_fkey: 'c',
    });
  });

  it('thành công: Order PAID, 1 token theo settings, files không lộ storage_key, no-store', async () => {
    await prisma.siteSetting.update({ where: { key: 'token_default_days' }, data: { value: '3' } });
    await prisma.siteSetting.update({ where: { key: 'token_default_max_downloads' }, data: { value: '2' } });
    const { order, sheet, files } = await addOrder();
    const before = Date.now();
    const res = await post({ paypalOrderId: 'PP-1' }).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = captureOrderResponseSchema.parse(res.body);
    expect(body.orderCode).toBe(order.orderCode);
    expect(body.files).toEqual([{ fileType: 'PDF', name: `${sheet.slug}.pdf` }]);
    expect(JSON.stringify(res.body)).not.toContain('private/');

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: 'PAID', paypalCaptureId: 'CAP-1', payerEmail: PAYER, payerName: 'Jo Payer' });
    expect(paid.paidAt).not.toBeNull();

    const token = await prisma.downloadToken.findUniqueOrThrow({ where: { orderId: order.id }, include: { files: true } });
    expect(token.token).toBe(body.token);
    expect(token.token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatchObject({ maxDownloads: 2, usedDownloads: 0, revokedAt: null });
    expect(token.expiresAt.getTime()).toBeGreaterThan(before + 3 * 86_400_000 - 1000);
    expect(token.expiresAt.getTime()).toBeLessThan(Date.now() + 3 * 86_400_000 + 1000);
    expect(token.files.map((f) => f.sheetFileId)).toEqual([files[0]!.id]);
    expect(provider.capture).toHaveBeenCalledWith('PP-1', order.orderCode);
  });

  it('gọi lại khi đã PAID: cùng token, không gọi PayPal, không tạo token thứ hai', async () => {
    const { order } = await addOrder();
    const first = captureOrderResponseSchema.parse((await post({ paypalOrderId: 'PP-1' }).expect(200)).body);
    provider.capture.mockClear();
    const second = captureOrderResponseSchema.parse((await post({ paypalOrderId: 'PP-1' }).expect(200)).body);
    expect(second).toEqual(first);
    expect(provider.capture).not.toHaveBeenCalled();
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('hai fulfil đồng thời: đúng 1 token, cả hai trả cùng token', async () => {
    const { order } = await addOrder();
    const service = app.get(OrderService);
    const [a, b] = await Promise.all([service.fulfil(order.id, completed()), service.fulfil(order.id, completed())]);
    expect(a.token).toBe(b.token);
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('hai request capture đồng thời: đúng 1 token', async () => {
    const { order } = await addOrder();
    const [a, b] = await Promise.all([post({ paypalOrderId: 'PP-1' }), post({ paypalOrderId: 'PP-1' })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.token).toBe(b.body.token);
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
  });

  it.each([
    ['amount', { amount: '4.98' }],
    ['currency', { currency: 'EUR' }],
  ])('lệch %s: 503, Order không PAID, review_required, không token', async (_n, over) => {
    const { order } = await addOrder();
    provider.capture.mockResolvedValue(completed(over));
    const res = await post({ paypalOrderId: 'PP-1' }).expect(503);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('4.98');
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: 'PENDING', reviewRequired: true, paidAt: null });
    expect(await prisma.downloadToken.count()).toBe(0);
  });

  it.each(['CANCELLED', 'FAILED'] as const)('trễ: Order %s vẫn PAID khi capture khớp', async (status) => {
    const { order } = await addOrder(status);
    await post({ paypalOrderId: 'PP-1' }).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('bị từ chối: 402 PAYMENT_DECLINED có lý do, Order FAILED, không token', async () => {
    const { order } = await addOrder();
    provider.capture.mockResolvedValue(completed({ status: 'DECLINED', captureId: null, amount: null, currency: null }));
    const res = await post({ paypalOrderId: 'PP-1' }).expect(402);
    const error = errorResponseSchema.parse(res.body).error;
    expect(error.code).toBe('PAYMENT_DECLINED');
    expect(error.message.length).toBeGreaterThan(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('FAILED');
    expect(await prisma.downloadToken.count()).toBe(0);
  });

  it('ORDER_ALREADY_CAPTURED: getOrder rồi fulfil', async () => {
    const { order } = await addOrder();
    provider.capture.mockRejectedValue(new OrderAlreadyCapturedError());
    provider.getOrder.mockResolvedValue(completed());
    await post({ paypalOrderId: 'PP-1' }).expect(200);
    expect(provider.getOrder).toHaveBeenCalledWith('PP-1');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('paypalOrderId lạ: 404, không gọi PayPal', async () => {
    await addOrder();
    const res = await post({ paypalOrderId: 'PP-KHONG-CO' }).expect(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('body sai: 400 VALIDATION_FAILED', async () => {
    await post({}).expect(400);
    await post({ paypalOrderId: 'PP-1', amount: 1 }).expect(400);
  });

  it('PayPal lỗi: 503 chung, Order giữ PENDING để thử lại', async () => {
    const { order } = await addOrder();
    provider.capture.mockRejectedValue(new Error(`boom ${PAYER}`));
    const res = await post({ paypalOrderId: 'PP-1' }).expect(503);
    expect(JSON.stringify(res.body)).not.toContain(PAYER);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
  });

  it('rate limit: request thứ 11 từ cùng IP là 429', async () => {
    for (let i = 0; i < 10; i += 1) await post({ paypalOrderId: 'PP-KHONG-CO' }, '203.0.113.151').expect(404);
    await post({ paypalOrderId: 'PP-KHONG-CO' }, '203.0.113.151').expect(429);
  });

  describe('GC giữ file có token sống', () => {
    const setup = async () => {
      const { order, files } = await addOrder();
      await post({ paypalOrderId: 'PP-1' }).expect(200);
      const pdf = files[0]!;
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await prisma.sheetFile.update({ where: { id: pdf.id }, data: { supersededAt: old } });
      const deleteSpy = vi.spyOn(app.get(SheetMediaService), 'deleteObjects').mockResolvedValue();
      return { order, pdf, deleteSpy };
    };

    it('token chưa hết hạn: hook báo có tham chiếu sống tới file superseded, GC không xoá', async () => {
      const { pdf, deleteSpy } = await setup();
      const gc = app.get(SheetFileGcService);
      await expect(gc.hasLiveDownloadTokenReference([pdf.id])).resolves.toBe(true);
      await expect(gc.hasLiveDownloadTokenReference([])).resolves.toBe(false);
      await gc.run();
      expect(await prisma.sheetFile.count({ where: { id: pdf.id } })).toBe(1);
      expect(deleteSpy).not.toHaveBeenCalled();
      deleteSpy.mockRestore();
    });

    it('MP3 superseded quá 24 giờ được token sống giữ; hết hạn/revoked/hết lượt thì GC xoá được', async () => {
      const { order, files } = await addOrder();
      await prisma.order.update({ where: { id: order.id }, data: { items: [{ fileType: 'MP3', priceCents: 199 }] } });
      await post({ paypalOrderId: 'PP-1' }).expect(200);
      const mp3 = files[2]!;
      await prisma.sheetFile.update({ where: { id: mp3.id }, data: { supersededAt: new Date(Date.now() - 48 * 3_600_000) } });
      const deleteSpy = vi.spyOn(app.get(SheetMediaService), 'deleteObjects').mockResolvedValue();
      const gc = app.get(SheetFileGcService);

      await gc.run();
      expect(await prisma.sheetFile.count({ where: { id: mp3.id } })).toBe(1);

      const token = await prisma.downloadToken.findUniqueOrThrow({ where: { orderId: order.id } });
      for (const dead of [
        { expiresAt: new Date(Date.now() - 1000) },
        { revokedAt: new Date() },
        { usedDownloads: token.maxDownloads },
      ]) {
        await prisma.downloadToken.update({ where: { id: token.id }, data: { expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null, usedDownloads: 0, ...dead } });
        await expect(gc.hasLiveDownloadTokenReference([mp3.id])).resolves.toBe(false);
      }
      await gc.run();
      expect(await prisma.sheetFile.count({ where: { id: mp3.id } })).toBe(0);
      expect(deleteSpy).toHaveBeenCalledWith([mp3.storageKey]);
      deleteSpy.mockRestore();
    });
  });
});
