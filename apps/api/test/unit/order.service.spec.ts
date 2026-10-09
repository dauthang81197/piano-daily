import { type CreateOrderRequest, ORDER_CODE_PATTERN, type Quote } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PricingService } from '../../src/modules/catalog/pricing.service';
import type { OrderRepository } from '../../src/modules/commerce/order.repository';
import { generateOrderCode, InvalidOrderTransitionError, OrderService, splitBundle } from '../../src/modules/commerce/order.service';
import type { DownloadTokenRepository } from '../../src/modules/commerce/download-token.repository';
import { type CaptureResult, type PaymentProvider } from '../../src/modules/commerce/payment-provider';
import { OrderAlreadyCapturedError } from '../../src/modules/commerce/payment-provider';
import type { PurchasableFilesSource } from '../../src/modules/catalog/purchasable-files-source.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { SettingsService } from '../../src/modules/settings/settings.service';

const SHEET = '01920000-0000-7000-8000-000000000001';
const QUOTE: Quote = {
  sheetId: SHEET,
  currency: 'USD',
  free: false,
  items: [
    { fileType: 'PDF', priceCents: 499 },
    { fileType: 'MIDI', priceCents: 299 },
    { fileType: 'MP3', priceCents: 199 },
  ],
  bundle: { priceCents: 700, fileTypes: ['PDF', 'MIDI', 'MP3'] },
};

const ORDER = {
  id: 'order-1',
  orderCode: 'PD-ABC234',
  sheetId: SHEET,
  amountCents: 499,
  currency: 'USD',
  items: [{ fileType: 'PDF', priceCents: 499 }],
};
const COMPLETED: CaptureResult = {
  status: 'COMPLETED',
  captureId: 'CAP-1',
  amount: '4.99',
  currency: 'USD',
  payer: { email: 'payer@example.com', name: 'Jo Payer' },
};

function build(
  options: {
    enabled?: boolean;
    quote?: Quote;
    providerFails?: boolean;
    status?: string;
    order?: null;
    markPaid?: boolean;
    noToken?: boolean;
    noFiles?: boolean;
    capture?: CaptureResult;
  } = {},
) {
  const repo = {
    createPending: vi.fn(async (o: { orderCode: string }) => ({ id: 'order-1', orderCode: o.orderCode })),
    setPaypalOrderId: vi.fn(async () => undefined),
    findStatus: vi.fn(async () => (options.status ?? 'PENDING') as never),
    updateStatus: vi.fn(async (_id: string, _from: string, _to: string) => true),
    findByPaypalOrderId: vi.fn(async () => (options.order === null ? null : { ...ORDER, status: options.status ?? 'PENDING' })),
    findById: vi.fn(async () => ({ ...ORDER, status: options.status ?? 'PENDING' })),
    markPaid: vi.fn(async () => options.markPaid ?? true),
    markReviewRequired: vi.fn(async () => undefined),
  };
  const tokens = {
    create: vi.fn(async () => undefined),
    findByOrderId: vi.fn(async () => (options.noToken ? null : { token: 'TOKEN-1', files: [{ fileType: 'PDF', name: 'a.pdf' }] })),
  };
  const files = { currentFiles: vi.fn(async () => (options.noFiles ? [] : [{ id: 'file-1', type: 'PDF' }])) };
  const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) };
  const pricing = { quote: vi.fn(async (_id: string) => options.quote ?? QUOTE) };
  const settings = {
    paymentsEnabled: vi.fn(async () => options.enabled ?? true),
    tokenDefaultDays: vi.fn(async () => 3),
    tokenDefaultMaxDownloads: vi.fn(async () => 4),
  };
  const provider = {
    capture: vi.fn(async (): Promise<CaptureResult> => options.capture ?? COMPLETED),
    getOrder: vi.fn(async (): Promise<CaptureResult> => COMPLETED),
    createOrder: vi.fn(async (_input: unknown) => {
      if (options.providerFails) throw new Error('boom a@b.co');
      return { providerOrderId: 'PP-1' };
    }),
  };
  const service = new OrderService(
    repo as unknown as OrderRepository,
    pricing as unknown as PricingService,
    settings as unknown as SettingsService,
    provider as unknown as PaymentProvider,
    tokens as unknown as DownloadTokenRepository,
    files as unknown as PurchasableFilesSource,
    prisma as unknown as PrismaService,
  );
  return { service, repo, pricing, settings, provider, tokens, files, prisma };
}

const request = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  sheetId: SHEET,
  fileTypes: ['PDF'],
  email: 'Buyer@Example.com',
  expectedTotalCents: 499,
  ...over,
});

describe('generateOrderCode / splitBundle', () => {
  it('mã đơn đúng định dạng PD-XXXXXX', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOrderCode()).toMatch(ORDER_CODE_PATTERN);
  });
  it('chia bundle: tổng đúng giá, dư dồn vào type đầu', () => {
    expect(splitBundle(['PDF', 'MIDI', 'MP3'], 700)).toEqual([
      { fileType: 'PDF', priceCents: 234 },
      { fileType: 'MIDI', priceCents: 233 },
      { fileType: 'MP3', priceCents: 233 },
    ]);
    expect(splitBundle(['PDF', 'MIDI'], 600).map((i) => i.priceCents)).toEqual([300, 300]);
  });
});

describe('OrderService.createPaypalOrder', () => {
  it('mua lẻ: tạo PENDING (email chuẩn hoá, items snapshot) rồi đơn PayPal', async () => {
    const { service, repo, provider } = build();
    const res = await service.createPaypalOrder(request());
    expect(res).toMatchObject({ paypalOrderId: 'PP-1' });
    expect(res.orderCode).toMatch(ORDER_CODE_PATTERN);
    expect(repo.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        sheetId: SHEET,
        email: 'buyer@example.com',
        amountCents: 499,
        items: [{ fileType: 'PDF', priceCents: 499 }],
      }),
    );
    expect(provider.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 499, currency: 'USD' }));
    expect(repo.setPaypalOrderId).toHaveBeenCalledWith('order-1', 'PP-1');
  });

  it('bundle: items là từng type, không có BUNDLE, tổng = giá bundle', async () => {
    const { service, repo } = build();
    await service.createPaypalOrder({ sheetId: SHEET, bundle: true, email: 'a@b.co', expectedTotalCents: 700 });
    const arg = repo.createPending.mock.calls[0]![0] as unknown as { items: { fileType: string; priceCents: number }[] };
    expect(JSON.stringify(arg.items)).not.toContain('BUNDLE');
    expect(arg.items.map((i) => i.fileType)).toEqual(['PDF', 'MIDI', 'MP3']);
    expect(arg.items.reduce((s, i) => s + i.priceCents, 0)).toBe(700);
  });

  it('type trùng lặp chỉ tính một lần', async () => {
    const { service } = build();
    await expect(service.createPaypalOrder(request({ fileTypes: ['PDF', 'PDF'] }))).resolves.toBeDefined();
  });

  it('giá lệch: 409 PRICE_CHANGED kèm quote mới, không tạo Order', async () => {
    const { service, repo, provider } = build();
    await expect(service.createPaypalOrder(request({ expectedTotalCents: 100 }))).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      details: QUOTE,
    });
    expect(repo.createPending).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('tắt thanh toán: 403 trước cả email sai, không chạm quote/PayPal', async () => {
    const { service, pricing, provider } = build({ enabled: false });
    await expect(service.createPaypalOrder(request({ email: 'sai' }))).rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
    expect(pricing.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('email sai: 400 VALIDATION_FAILED trước khi tính giá', async () => {
    const { service, pricing } = build();
    await expect(service.createPaypalOrder(request({ email: 'sai' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(pricing.quote).not.toHaveBeenCalled();
  });

  it.each([
    ['Sheet free', { ...QUOTE, free: true, items: [], bundle: null }, request()],
    ['thiếu type', { ...QUOTE, items: [QUOTE.items[0]!], bundle: null }, request({ fileTypes: ['MP3'] })],
    ['bundle không tồn tại', { ...QUOTE, bundle: null }, { sheetId: SHEET, bundle: true as const, email: 'a@b.co', expectedTotalCents: 700 }],
  ] as [string, Quote, CreateOrderRequest][])('%s: từ chối, không tạo Order', async (_n, quote, req) => {
    const { service, repo } = build({ quote });
    await expect(service.createPaypalOrder(req)).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|VALIDATION_FAILED/) });
    expect(repo.createPending).not.toHaveBeenCalled();
  });

  it('sheetId không phải UUID: 404, không truy vấn', async () => {
    const { service, pricing } = build();
    await expect(service.createPaypalOrder(request({ sheetId: 'abc' }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(pricing.quote).not.toHaveBeenCalled();
  });

  it('PayPal lỗi: Order sang FAILED, 503 không lộ chi tiết', async () => {
    const { service, repo } = build({ providerFails: true });
    const err = await service.createPaypalOrder(request()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect((err as Error).message).not.toContain('a@b.co');
    expect(repo.updateStatus).toHaveBeenCalledWith('order-1', 'PENDING', 'FAILED');
  });
});

describe('OrderService.transition', () => {
  it('chuyển hợp lệ gọi UPDATE có điều kiện', async () => {
    const { service, repo } = build({ status: 'PENDING' });
    await expect(service.transition('o', 'PAID')).resolves.toBe(true);
    expect(repo.updateStatus).toHaveBeenCalledWith('o', 'PENDING', 'PAID');
  });
  it('chuyển không hợp lệ ném lỗi và không ghi', async () => {
    const { service, repo } = build({ status: 'PAID' });
    await expect(service.transition('o', 'CANCELLED')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
  it('đã ở trạng thái đích: không làm gì', async () => {
    const { service, repo } = build({ status: 'PAID' });
    await expect(service.transition('o', 'PAID')).resolves.toBe(false);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
  it('FAILED và CANCELLED vẫn lên PAID được', async () => {
    for (const status of ['FAILED', 'CANCELLED']) {
      const { service } = build({ status });
      await expect(service.transition('o', 'PAID')).resolves.toBe(true);
    }
  });
});

describe('OrderService.captureOrder / fulfil', () => {
  const REQ = { paypalOrderId: 'PP-1' };

  it('thành công: PAID + 1 token (hạn/lượt từ settings) trong một transaction, trả {orderCode, token, files}', async () => {
    const { service, repo, tokens, prisma, provider } = build();
    const before = Date.now();
    const res = await service.captureOrder(REQ);
    expect(res).toEqual({ orderCode: 'PD-ABC234', token: 'TOKEN-1', files: [{ fileType: 'PDF', name: 'a.pdf' }] });
    expect(provider.capture).toHaveBeenCalledWith('PP-1', 'PD-ABC234');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repo.markPaid).toHaveBeenCalledWith(expect.anything(), 'order-1', {
      captureId: 'CAP-1',
      payerEmail: 'payer@example.com',
      payerName: 'Jo Payer',
    });
    const arg = (tokens.create.mock.calls[0] as unknown as [unknown, { expiresAt: Date; maxDownloads: number; fileIds: string[] }])[1];
    expect(arg.maxDownloads).toBe(4);
    expect(arg.fileIds).toEqual(['file-1']);
    expect(arg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3 * 86_400_000);
    expect(arg.expiresAt.getTime()).toBeLessThan(Date.now() + 3 * 86_400_000 + 1000);
  });

  it('paypalOrderId lạ: 404, không gọi PayPal', async () => {
    const { service, provider } = build({ order: null });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('đã PAID: trả token cũ, không gọi PayPal, không tạo token', async () => {
    const { service, provider, tokens, repo } = build({ status: 'PAID' });
    await expect(service.captureOrder(REQ)).resolves.toMatchObject({ token: 'TOKEN-1' });
    expect(provider.capture).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
    expect(repo.markPaid).not.toHaveBeenCalled();
  });

  it('thua cuộc đua (UPDATE 0 dòng): đọc lại và trả token đã có, không tạo token thứ hai', async () => {
    const { service, tokens, repo } = build({ markPaid: false });
    repo.findById.mockResolvedValueOnce({ ...ORDER, status: 'PENDING' }).mockResolvedValueOnce({ ...ORDER, status: 'PAID' });
    await expect(service.fulfil('order-1', COMPLETED)).resolves.toMatchObject({ token: 'TOKEN-1' });
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it.each([
    ['amount', { ...COMPLETED, amount: '4.98' }],
    ['currency', { ...COMPLETED, currency: 'EUR' }],
  ])('lệch %s: không PAID, review_required, 503 chung', async (_n, capture) => {
    const { service, repo, tokens } = build({ capture });
    const err = await service.captureOrder(REQ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(repo.markReviewRequired).toHaveBeenCalledWith('order-1');
    expect(repo.markPaid).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('capture chưa COMPLETED: không PAID', async () => {
    const { service, repo } = build({ capture: { ...COMPLETED, status: 'PENDING' } });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(repo.markPaid).not.toHaveBeenCalled();
    expect(repo.markReviewRequired).not.toHaveBeenCalled();
  });

  it.each(['DECLINED', 'FAILED'] as const)('capture %s: Order FAILED, 402 PAYMENT_DECLINED', async (status) => {
    const { service, repo } = build({ capture: { ...COMPLETED, status } });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect(repo.updateStatus).toHaveBeenCalledWith('order-1', 'PENDING', 'FAILED');
    expect(repo.markPaid).not.toHaveBeenCalled();
  });

  it('thiếu file hiện hành đã mua: không cấp token, review_required, 503 chung', async () => {
    const { service, repo, tokens } = build({ noFiles: true });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(tokens.create).not.toHaveBeenCalled();
    expect(repo.markReviewRequired).toHaveBeenCalledWith('order-1');
  });

  it('bị từ chối nhưng Order đã CANCELLED: giữ nguyên trạng thái', async () => {
    const { service, repo } = build({ status: 'CANCELLED', capture: { ...COMPLETED, status: 'DECLINED' } });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('ORDER_ALREADY_CAPTURED: dùng getOrder rồi fulfil', async () => {
    const { service, provider, repo } = build();
    provider.capture.mockRejectedValueOnce(new OrderAlreadyCapturedError());
    await expect(service.captureOrder(REQ)).resolves.toMatchObject({ token: 'TOKEN-1' });
    expect(provider.getOrder).toHaveBeenCalledWith('PP-1');
    expect(repo.markPaid).toHaveBeenCalled();
  });

  it('PayPal lỗi khác: 503 chung, Order giữ nguyên', async () => {
    const { service, provider, repo } = build();
    provider.capture.mockRejectedValueOnce(new Error('boom payer@example.com'));
    const err = await service.captureOrder(REQ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect((err as Error).message).not.toContain('payer@example.com');
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'FAILED'])('trễ từ %s: vẫn PAID và cấp token', async (status) => {
    const { service, repo, tokens } = build({ status });
    await expect(service.captureOrder(REQ)).resolves.toMatchObject({ token: 'TOKEN-1' });
    expect(repo.markPaid).toHaveBeenCalled();
    expect(tokens.create).toHaveBeenCalled();
  });

  it('REFUNDED: 404', async () => {
    const { service, provider } = build({ status: 'REFUNDED' });
    await expect(service.captureOrder(REQ)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(provider.capture).not.toHaveBeenCalled();
  });
});
