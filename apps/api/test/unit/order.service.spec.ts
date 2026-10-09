import { type CreateOrderRequest, ORDER_CODE_PATTERN, type Quote } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PricingService } from '../../src/modules/catalog/pricing.service';
import type { OrderRepository } from '../../src/modules/commerce/order.repository';
import { generateOrderCode, InvalidOrderTransitionError, OrderService, splitBundle } from '../../src/modules/commerce/order.service';
import type { PaymentProvider } from '../../src/modules/commerce/payment-provider';
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

function build(options: { enabled?: boolean; quote?: Quote; providerFails?: boolean; status?: string } = {}) {
  const repo = {
    createPending: vi.fn(async (o: { orderCode: string }) => ({ id: 'order-1', orderCode: o.orderCode })),
    setPaypalOrderId: vi.fn(async () => undefined),
    findStatus: vi.fn(async () => (options.status ?? 'PENDING') as never),
    updateStatus: vi.fn(async (_id: string, _from: string, _to: string) => true),
  };
  const pricing = { quote: vi.fn(async (_id: string) => options.quote ?? QUOTE) };
  const settings = { paymentsEnabled: vi.fn(async () => options.enabled ?? true) };
  const provider = {
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
  );
  return { service, repo, pricing, settings, provider };
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
