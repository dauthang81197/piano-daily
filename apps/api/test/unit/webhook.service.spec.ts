import type { AlertService } from '../../src/modules/notify/alert.service';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import type { PlanPaymentService } from '../../src/modules/commerce/plan-payment.service';
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

const order = (status: string) => ({ id: 'o1', orderCode: 'PD-ABC234', status, amountCents: 499, currency: 'USD' });

describe('WebhookService', () => {
  const provider = { verifyWebhook: vi.fn() };
  const events = { record: vi.fn(), markProcessed: vi.fn() };
  const orders = { fulfil: vi.fn(), refund: vi.fn(), failIfPending: vi.fn() };
  const orderRepo = { findByPaypalOrderId: vi.fn(), findByOrderCode: vi.fn() };
  const alerts = { alert: vi.fn() };
  const planPayments = { findForWebhook: vi.fn(), fulfil: vi.fn(), refund: vi.fn(), failIfPending: vi.fn() };
  const make = (webhookId: string | undefined = 'WID') =>
    new WebhookService(
      provider as unknown as PaymentProvider,
      events as unknown as PaymentEventRepository,
      orders as unknown as OrderService,
      orderRepo as unknown as OrderRepository,
      planPayments as unknown as PlanPaymentService,
      { get: () => webhookId } as unknown as ConfigService<Env, true>,
      alerts as unknown as AlertService,
    );

  beforeEach(() => {
    for (const fn of [...Object.values(provider), ...Object.values(events), ...Object.values(orders), ...Object.values(orderRepo)]) fn.mockReset();
    alerts.alert.mockReset();
    for (const fn of Object.values(planPayments)) fn.mockReset();
    planPayments.findForWebhook.mockResolvedValue(null);
    provider.verifyWebhook.mockResolvedValue(true);
    events.record.mockResolvedValue({ created: true, processedAt: null });
    orderRepo.findByOrderCode.mockResolvedValue(order('PENDING'));
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
    orderRepo.findByOrderCode.mockResolvedValue(order('PAID'));
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

  it('REFUNDED một phần (số tiền nhỏ hơn đơn): không hoàn, vẫn processed, có cảnh báo', async () => {
    orderRepo.findByOrderCode.mockResolvedValue(order('PAID'));
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED', { id: 'R-1', amount: { value: '1.00', currency_code: 'USD' }, custom_id: 'PD-ABC234' }));
    expect(orders.refund).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith('WH-1');
    expect(alerts.alert).toHaveBeenCalledWith('REVIEW_REQUIRED', expect.any(String), expect.any(String), 'PD-ABC234');
  });

  it('REFUNDED thiếu amount hoặc sai currency: không hoàn', async () => {
    orderRepo.findByOrderCode.mockResolvedValue(order('PAID'));
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED', { id: 'R-1', custom_id: 'PD-ABC234' }));
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED', { id: 'R-1', amount: { value: '4.99', currency_code: 'EUR' }, custom_id: 'PD-ABC234' }));
    expect(orders.refund).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'CANCELLED'])('REFUNDED với đơn %s: bỏ qua và processed, không bắt PayPal gửi lại', async (status) => {
    orderRepo.findByOrderCode.mockResolvedValue(order(status));
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'));
    expect(orders.refund).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith('WH-1');
  });

  it('body không phải JSON: 400 trước khi xác thực chữ ký', async () => {
    await expect(make().handle(HEADERS, 'not json')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(provider.verifyWebhook).not.toHaveBeenCalled();
  });

  it('đã processed: bỏ qua xử lý', async () => {
    events.record.mockResolvedValue({ created: false, processedAt: new Date() });
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'));
    expect(orders.fulfil).not.toHaveBeenCalled();
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('lỗi xử lý không phải AppException: 503 và không markProcessed', async () => {
    orderRepo.findByOrderCode.mockResolvedValue(order('PAID'));
    orders.refund.mockRejectedValue(new Error('db down'));
    await expect(make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(events.markProcessed).not.toHaveBeenCalled();
    expect(alerts.alert).toHaveBeenCalledWith('WEBHOOK_ERROR', expect.any(String), expect.any(String), 'dispatch:PAYMENT.CAPTURE.REFUNDED');
  });

  it('chữ ký sai: 400 và cảnh báo WEBHOOK_ERROR', async () => {
    provider.verifyWebhook.mockResolvedValue(false);
    await expect(make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(alerts.alert).toHaveBeenCalledWith('WEBHOOK_ERROR', expect.any(String), expect.any(String), 'signature');
  });

  it('xử lý thành công thì không phát cảnh báo', async () => {
    orderRepo.findByOrderCode.mockResolvedValue(order('PAID'));
    orders.refund.mockResolvedValue(true);
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.REFUNDED'));
    expect(alerts.alert).not.toHaveBeenCalled();
  });

  it('Order REFUNDED: COMPLETED bị bỏ qua nhưng vẫn processed', async () => {
    orderRepo.findByOrderCode.mockResolvedValue(order('REFUNDED'));
    await make().handle(HEADERS, body('PAYMENT.CAPTURE.COMPLETED'));
    expect(orders.fulfil).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalled();
  });
});
