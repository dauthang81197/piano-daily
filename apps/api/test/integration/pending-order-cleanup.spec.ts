import type { INestApplication } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingOrderCleanupService } from '../../src/modules/commerce/pending-order-cleanup.service';
import { PAYMENT_PROVIDER } from '../../src/modules/commerce/payment-provider';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const HOUR = 60 * 60 * 1000;

describe('Tự huỷ đơn PENDING quá hạn (Story 3.9, Postgres thật, provider giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: PendingOrderCleanupService;
  let composerId: string;
  let n = 0;
  const provider = { createOrder: vi.fn(), getOrder: vi.fn(), capture: vi.fn(), refund: vi.fn(), verifyWebhook: vi.fn() };
  const email = { send: vi.fn(async () => true) };

  const pp = (orderStatus: string | null, status = 'PENDING') => ({
    status,
    captureId: status === 'COMPLETED' ? 'CAP-1' : null,
    amount: status === 'COMPLETED' ? '4.99' : null,
    currency: status === 'COMPLETED' ? 'USD' : null,
    payer: { email: 'p@example.com', name: 'Payer' },
    orderStatus,
  });

  const addOrder = async (over: { ageHours?: number; status?: 'PENDING' | 'PAID' | 'FAILED'; paypalOrderId?: string | null } = {}) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: { title: `Sheet ${n}`, slug: `sheet-${n}`, composerId, level: 'BEGINNER', status: 'PUBLISHED', pricePdfCents: 499, firstPublishedAt: new Date() },
    });
    await prisma.sheetFile.create({
      data: { sheetId: sheet.id, type: 'PDF', storageKey: `private/sheets/${sheet.id}/PDF/cur.bin`, size: 1, mimeType: 'application/pdf' },
    });
    return prisma.order.create({
      data: {
        orderCode: `PD-C${String(n).padStart(5, '0')}`,
        sheetId: sheet.id,
        email: 'buyer.secret@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: over.status ?? 'PENDING',
        paypalOrderId: over.paypalOrderId === undefined ? `PP-${n}` : over.paypalOrderId,
        createdAt: new Date(Date.now() - (over.ageHours ?? 25) * HOUR),
      },
    });
  };
  const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

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
    service = app.get(PendingOrderCleanupService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    for (const fn of Object.values(provider)) fn.mockReset();
    email.send.mockClear();
  });

  it('đăng ký lịch dọn đơn chạy mỗi giờ và scheduler gọi entry point', async () => {
    const options = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PendingOrderCleanupService.prototype.scheduledRun) as { cronTime: string };
    expect(options.cronTime).toBe(CronExpression.EVERY_HOUR);
    expect(app.get(SchedulerRegistry).getCronJobs().size).toBeGreaterThan(0);
    const runSpy = vi.spyOn(app.get(PendingOrderCleanupService), 'run').mockResolvedValue();
    await app.get(PendingOrderCleanupService).scheduledRun();
    expect(runSpy).toHaveBeenCalledOnce();
    runSpy.mockRestore();
  });

  it('PENDING > 24h và PayPal CREATED: CANCELLED', async () => {
    const order = await addOrder();
    provider.getOrder.mockResolvedValue(pp('CREATED'));
    await service.run();
    expect(await statusOf(order.id)).toBe('CANCELLED');
  });

  it('PENDING > 24h và capture COMPLETED: PAID với đúng một token', async () => {
    const order = await addOrder();
    provider.getOrder.mockResolvedValue(pp('COMPLETED', 'COMPLETED'));
    await service.run();
    expect(await statusOf(order.id)).toBe('PAID');
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
    await service.run(); // không còn PENDING nên không đụng tới
    expect(await prisma.downloadToken.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('APPROVED hoặc getOrder lỗi: giữ PENDING', async () => {
    const approved = await addOrder();
    const broken = await addOrder();
    provider.getOrder.mockImplementation(async (id: string) => {
      if (id === approved.paypalOrderId) return pp('APPROVED');
      throw new Error('network');
    });
    await service.run();
    expect(await statusOf(approved.id)).toBe('PENDING');
    expect(await statusOf(broken.id)).toBe('PENDING');
  });

  it('chưa có paypal_order_id: CANCELLED, không gọi PayPal', async () => {
    const order = await addOrder({ paypalOrderId: null });
    await service.run();
    expect(await statusOf(order.id)).toBe('CANCELLED');
    expect(provider.getOrder).not.toHaveBeenCalled();
  });

  it('đơn mới < 24h và đơn không PENDING: không đụng tới, không gọi PayPal', async () => {
    const fresh = await addOrder({ ageHours: 1 });
    const paid = await addOrder({ status: 'PAID' });
    const failed = await addOrder({ status: 'FAILED' });
    await service.run();
    expect(provider.getOrder).not.toHaveBeenCalled();
    expect(await statusOf(fresh.id)).toBe('PENDING');
    expect(await statusOf(paid.id)).toBe('PAID');
    expect(await statusOf(failed.id)).toBe('FAILED');
  });
});
