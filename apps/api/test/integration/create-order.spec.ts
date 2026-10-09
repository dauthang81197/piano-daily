import type { INestApplication } from '@nestjs/common';
import { createOrderResponseSchema, errorResponseSchema, ORDER_CODE_PATTERN } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_PROVIDER } from '../../src/modules/commerce/payment-provider';
import { SheetsService } from '../../src/modules/catalog/sheets.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

type SheetOptions = {
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isFree?: boolean;
  files?: ('PDF' | 'MIDI' | 'MP3')[];
  pdf?: number | null;
  midi?: number | null;
  mp3?: number | null;
  bundle?: number | null;
};

const BUYER = 'buyer.secret@example.com';

describe('Tạo đơn hàng PayPal (Story 3.3, Postgres thật, provider giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let composerId: string;
  let n = 0;
  let ipSeq = 0;
  let paypalSeq = 0;
  const provider = {
    createOrder: vi.fn(async (_input: unknown) => ({ providerOrderId: `PP-FAKE-${(paypalSeq += 1)}` })),
    getOrder: vi.fn(),
    capture: vi.fn(),
    refund: vi.fn(),
    verifyWebhook: vi.fn(),
  };

  const post = (body: unknown, ip?: string) =>
    request(app.getHttpServer())
      .post('/payments/paypal/create-order')
      .set('CF-Connecting-IP', ip ?? `198.51.100.${(ipSeq += 1)}`)
      .send(body as object);

  const addSheet = async (options: SheetOptions = {}) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: `Sheet ${n}`,
        slug: `sheet-${n}`,
        composerId,
        level: 'BEGINNER',
        status: options.status ?? 'PUBLISHED',
        isFree: options.isFree ?? false,
        pricePdfCents: options.pdf === undefined ? 499 : options.pdf,
        priceMidiCents: options.midi === undefined ? 299 : options.midi,
        priceMp3Cents: options.mp3 === undefined ? 199 : options.mp3,
        priceBundleCents: options.bundle === undefined ? 700 : options.bundle,
        firstPublishedAt: new Date(),
      },
    });
    for (const type of options.files ?? ['PDF', 'MIDI', 'MP3']) {
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type,
          storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`,
          size: 1,
          mimeType: 'application/octet-stream',
        },
      });
    }
    return sheet;
  };

  const setPayments = (value: string) =>
    prisma.siteSetting.update({ where: { key: 'payments_enabled' }, data: { value } });

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
    await setPayments('true');
    provider.createOrder.mockClear();
  });

  it('migration: site_settings có ba khoá seed và orders.sheet_id là FK RESTRICT', async () => {
    const keys = await prisma.siteSetting.findMany({ orderBy: { key: 'asc' } });
    expect(Object.fromEntries(keys.map((k) => [k.key, k.value]))).toEqual({
      payments_enabled: 'true',
      token_default_days: '7',
      token_default_max_downloads: '5',
    });
    const fk = await prisma.$queryRaw<{ confdeltype: string }[]>`
      SELECT confdeltype::text FROM pg_constraint WHERE conname = 'orders_sheet_id_fkey'`;
    expect(fk[0]?.confdeltype).toBe('r');
  });

  it('mua lẻ: 201, Order PENDING (items 1 type, USD), lưu paypal_order_id', async () => {
    const sheet = await addSheet();
    const res = await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(201);
    const body = createOrderResponseSchema.parse(res.body);
    expect(body.orderCode).toMatch(ORDER_CODE_PATTERN);
    expect(res.headers['cache-control']).toBe('no-store');

    const order = await prisma.order.findUniqueOrThrow({ where: { orderCode: body.orderCode } });
    expect(order).toMatchObject({
      sheetId: sheet.id,
      email: BUYER,
      amountCents: 499,
      currency: 'USD',
      status: 'PENDING',
      paypalOrderId: body.paypalOrderId,
      items: [{ fileType: 'PDF', priceCents: 499 }],
    });
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 499, currency: 'USD', orderCode: body.orderCode }));
  });

  it('nhiều type lẻ: tổng là tổng giá từng type', async () => {
    const sheet = await addSheet();
    await post({ sheetId: sheet.id, fileTypes: ['PDF', 'MP3'], email: BUYER, expectedTotalCents: 698 }).expect(201);
    const order = await prisma.order.findFirstOrThrow();
    expect(order.amountCents).toBe(698);
    expect(order.items).toEqual([
      { fileType: 'PDF', priceCents: 499 },
      { fileType: 'MP3', priceCents: 199 },
    ]);
  });

  it('bundle: items gồm mọi type, không có chuỗi BUNDLE, tổng = giá bundle', async () => {
    const sheet = await addSheet();
    await post({ sheetId: sheet.id, bundle: true, email: BUYER, expectedTotalCents: 700 }).expect(201);
    const order = await prisma.order.findFirstOrThrow();
    const items = order.items as { fileType: string; priceCents: number }[];
    expect(items.map((i) => i.fileType)).toEqual(['PDF', 'MIDI', 'MP3']);
    expect(items.reduce((s, i) => s + i.priceCents, 0)).toBe(700);
    expect(order.amountCents).toBe(700);
    expect(JSON.stringify(order.items)).not.toContain('BUNDLE');
  });

  it('giá đổi: 409 PRICE_CHANGED kèm quote mới, không Order, không gọi PayPal', async () => {
    const sheet = await addSheet();
    const res = await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 399 }).expect(409);
    const error = errorResponseSchema.parse(res.body).error;
    expect(error.code).toBe('PRICE_CHANGED');
    expect(error.details).toMatchObject({ sheetId: sheet.id, currency: 'USD', items: expect.any(Array) });
    expect(await prisma.order.count()).toBe(0);
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('tắt thanh toán: 403 PAYMENTS_DISABLED (kể cả email sai), không Order, không gọi PayPal', async () => {
    await setPayments('false');
    const sheet = await addSheet();
    const res = await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: 'sai', expectedTotalCents: 499 }).expect(403);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('PAYMENTS_DISABLED');
    expect(await prisma.order.count()).toBe(0);
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('email sai: 400 VALIDATION_FAILED, không Order', async () => {
    const sheet = await addSheet();
    const res = await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: 'khong-hop-le', expectedTotalCents: 499 }).expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.order.count()).toBe(0);
  });

  it.each([
    ['cả fileTypes lẫn bundle', { fileTypes: ['PDF'], bundle: true }],
    ['không fileTypes cũng không bundle', {}],
    ['type không bán được', { fileTypes: ['THUMBNAIL'] }],
    ['tiền không nguyên', { fileTypes: ['PDF'], expectedTotalCents: 4.99 }],
  ])('body sai (%s): 400 VALIDATION_FAILED', async (_name, extra) => {
    const sheet = await addSheet();
    const res = await post({ sheetId: sheet.id, email: BUYER, expectedTotalCents: 499, ...extra }).expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.order.count()).toBe(0);
  });

  it.each([
    ['Sheet free', { isFree: true }, { fileTypes: ['PDF'] }, 404],
    ['Sheet Draft', { status: 'DRAFT' }, { fileTypes: ['PDF'] }, 404],
    ['Sheet Archived', { status: 'ARCHIVED' }, { fileTypes: ['PDF'] }, 404],
    ['thiếu file MP3', { files: ['PDF', 'MIDI'] }, { fileTypes: ['MP3'] }, 400],
    ['MIDI chưa đặt giá', { midi: null }, { fileTypes: ['MIDI'] }, 400],
    ['bundle không tồn tại (chỉ 1 type mua được)', { files: ['PDF'] }, { bundle: true }, 400],
    ['bundle chưa đặt giá', { bundle: null }, { bundle: true }, 400],
  ] as [string, SheetOptions, Record<string, unknown>, number][])('%s: %i, không Order, không gọi PayPal', async (_name, options, pick, status) => {
    const sheet = await addSheet(options);
    const res = await post({ sheetId: sheet.id, email: BUYER, expectedTotalCents: 499, ...pick }).expect(status);
    expect(errorResponseSchema.parse(res.body).error.code).toBe(status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED');
    expect(await prisma.order.count()).toBe(0);
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('Sheet không tồn tại hoặc sheetId sai dạng: 404', async () => {
    await post({ sheetId: '01920000-0000-7000-8000-000000000000', fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(404);
    await post({ sheetId: 'abc', fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(404);
  });

  it('PayPal lỗi: Order FAILED qua OrderService, 503 SERVICE_UNAVAILABLE không lộ chi tiết', async () => {
    const sheet = await addSheet();
    provider.createOrder.mockRejectedValueOnce(new Error(`PayPal said no for ${BUYER}`));
    const res = await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(503);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain(BUYER);
    const order = await prisma.order.findFirstOrThrow();
    expect(order).toMatchObject({ status: 'FAILED', paypalOrderId: null });
  });

  it('rate limit: 10 request/phút theo IP, request thứ 11 là 429', async () => {
    const sheet = await addSheet();
    const body = { sheetId: sheet.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 399 };
    for (let i = 0; i < 10; i += 1) await post(body, '203.0.113.150').expect(409);
    await post(body, '203.0.113.150').expect(429);
  });

  it('xoá Sheet có Order: ARCHIVED, không hard delete; Sheet chưa có Order vẫn xoá cứng', async () => {
    const sheets = app.get(SheetsService);
    const sold = await addSheet();
    await post({ sheetId: sold.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(201);
    await expect(sheets.hasOrderHistory(sold.id)).resolves.toBe(true);

    const result = await sheets.remove(sold.id);
    expect(result).toMatchObject({ status: 'ARCHIVED' });
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sold.id } })).status).toBe('ARCHIVED');
    expect(await prisma.order.count()).toBe(1);

    const unsold = await addSheet({ files: [] });
    await expect(sheets.hasOrderHistory(unsold.id)).resolves.toBe(false);
    await sheets.remove(unsold.id);
    expect(await prisma.sheet.findUnique({ where: { id: unsold.id } })).toBeNull();
  });

  it('Order.sheet_id là RESTRICT: xoá cứng Sheet có Order bị DB từ chối', async () => {
    const sheet = await addSheet();
    await post({ sheetId: sheet.id, fileTypes: ['PDF'], email: BUYER, expectedTotalCents: 499 }).expect(201);
    await expect(prisma.sheet.delete({ where: { id: sheet.id } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
