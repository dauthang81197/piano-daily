import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import type { OrderRepository } from '../../src/modules/commerce/order.repository';
import type { OrderService } from '../../src/modules/commerce/order.service';
import type { PaymentEventRepository } from '../../src/modules/commerce/payment-event.repository';
import type { PaymentProvider } from '../../src/modules/commerce/payment-provider';
import { WebhookService } from '../../src/modules/commerce/webhook.service';

const HEADERS = {
  'paypal-auth-algo': 'a',
  'paypal-cert-url': 'b',
  'paypal-transmission-id': 'c',
  'paypal-transmission-sig': 'd',
  'paypal-transmission-time': 'e',
};
const body = (type: string, resource: object = { id: 'CAP-1', amount: { value: '4.99', currency_code: 'USD' }, custom_id: 'PD-ABC234' }) =>
  JSON.stringify({ id: 'WH-1', event_type: type, resource });

describe('WebhookService', () => {
  const provider = { verifyWebhook: vi.fn() };
  const events = { record: vi.fn(), markProcessed: vi.fn() };
  const orders = { fulfil: vi.fn(), refund: vi.fn(), failIfPending: vi.fn() };
  const orderRepo = { findByPaypalOrderId: vi.fn(), findByOrderCode: vi.fn() };
  const make = (webhookId: string | undefined = 'WID') =>
    new WebhookService(
      provider as unknown as PaymentProvider,
      events as unknown as PaymentEventRepository,
      orders as unknown as OrderService,
      orderRepo as unknown as OrderRepository,
      { get: () => webhookId } as unknown as ConfigService<Env, true>,
    );

  beforeEach(() => {
    for (const fn of [...Object.values(provider), ...Object.values(events), ...Object.values(orders), ...Object.values(orderRepo)]) fn.mockReset();
    provider.verifyWebhook.mockResolvedValue(true);
    events.record.mockResolvedValue({ created: true, processedAt: null });
    orderRepo.findByOrderCode.mockResolvedValue({ id: 'o1', status: 'PENDING' });
  });

  it('thiếu PAYPAL_WEBHOOK_ID: 503, không xác thực, không ghi', async () => {
    await expect(make('').handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(provider.verifyWebhook).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('COMPLETED: fulfil với CaptureResult dựng từ resource, rồi markProcessed', async () => {
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'));
    expect(orders.fulfil).toHaveBeenCalledWith('o1', {
      status: 'COMPLETED',
      captureId: 'CAP-1',
      amount: '4.99',
      currency: 'USD',
      payer: { email: null, name: null },
    });
    expect(events.markProcessed).toHaveBeenCalledWith('WH-1');
  });

  it('REFUNDED gọi refund; DENIED gọi failIfPending', async () => {
    orderRepo.findByOrderCode.mockResolvedValue({ id: 'o1', status: 'PAID' });
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'));
    expect(orders.refund).toHaveBeenCalledWith('o1');
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.DENIED'));
    expect(orders.failIfPending).toHaveBeenCalledWith('o1');
  });

  it('REFUNDED đến trước COMPLETED (Order PENDING): 503 để PayPal gửi lại, chưa processed', async () => {
    await expect(make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(orders.refund).not.toHaveBeenCalled();
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('đã processed: bỏ qua xử lý', async () => {
    events.record.mockResolvedValue({ created: false, processedAt: new Date() });
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'));
    expect(orders.fulfil).not.toHaveBeenCalled();
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('lỗi xử lý không phải AppException: 503 và không markProcessed', async () => {
    orders.refund.mockRejectedValue(new Error('db down'));
    await expect(make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('Order REFUNDED: COMPLETED bị bỏ qua nhưng vẫn processed', async () => {
    orderRepo.findByOrderCode.mockResolvedValue({ id: 'o1', status: 'REFUNDED' });
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'));
    expect(orders.fulfil).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalled();
  });
});
