import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import {
  OrderAlreadyCapturedError,
  RefundRejectedError,
  ProviderOrderNotFoundError,
} from '../../src/modules/commerce/payment-provider';
import { PaypalNotConfiguredError, PaypalProvider } from '../../src/modules/commerce/paypal.provider';

const createOrder = vi.fn();
const captureOrder = vi.fn();
const getOrder = vi.fn();
const refundCapturedPayment = vi.fn();
const clientCtor = vi.fn();

vi.mock('@paypal/paypal-server-sdk', () => ({
  CheckoutPaymentIntent: { Capture: 'CAPTURE' },
  Environment: { Production: 'Production', Sandbox: 'Sandbox' },
  Client: class {
    constructor(options: unknown) {
      clientCtor(options);
    }
  },
  PaymentsController: class {
    refundCapturedPayment = refundCapturedPayment;
  },
  OrdersController: class {
    createOrder = createOrder;
    captureOrder = captureOrder;
    getOrder = getOrder;
  },
}));


const config = (values: Partial<Record<keyof Env, string>>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;
const INPUT = { amountCents: 1999, currency: 'USD', orderCode: 'PD-ABC234', description: 'x' } as const;

describe('PaypalProvider', () => {
  beforeEach(() => {
    createOrder.mockReset();
    captureOrder.mockReset();
    getOrder.mockReset();
    refundCapturedPayment.mockReset();
    clientCtor.mockReset();
  });

  it('createOrder: USD, CAPTURE, số tiền chuỗi 2 chữ số thập phân, request id = mã đơn', async () => {
    createOrder.mockResolvedValue({ result: { id: 'PP-123' } });
    const provider = new PaypalProvider(config({ PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' }));
    await expect(provider.createOrder(INPUT)).resolves.toEqual({ providerOrderId: 'PP-123' });
    expect(createOrder).toHaveBeenCalledWith({
      paypalRequestId: 'PD-ABC234',
      body: {
        intent: 'CAPTURE',
        purchaseUnits: [
          expect.objectContaining({ amount: { currencyCode: 'USD', value: '19.99' }, customId: 'PD-ABC234' }),
        ],
      },
    });
    expect(clientCtor).toHaveBeenCalledWith(expect.objectContaining({ environment: 'Sandbox' }));
  });

  it('PAYPAL_MODE=live dùng môi trường Production', async () => {
    createOrder.mockResolvedValue({ result: { id: 'PP-1' } });
    const provider = new PaypalProvider(config({ PAYPAL_MODE: 'live', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' }));
    await provider.createOrder(INPUT);
    expect(clientCtor).toHaveBeenCalledWith(expect.objectContaining({ environment: 'Production' }));
  });

  it('thiếu client id/secret: ném PaypalNotConfiguredError, không gọi SDK', async () => {
    const provider = new PaypalProvider(config({ PAYPAL_MODE: 'sandbox' }));
    await expect(provider.createOrder(INPUT)).rejects.toBeInstanceOf(PaypalNotConfiguredError);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('không có order id trong phản hồi: lỗi', async () => {
    createOrder.mockResolvedValue({ result: {} });
    const provider = new PaypalProvider(config({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' }));
    await expect(provider.createOrder(INPUT)).rejects.toThrow();
  });

  const live = () => new PaypalProvider(config({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' }));
  const paidOrder = (status = 'COMPLETED') => ({
    result: {
      id: 'PP-1',
      payer: { emailAddress: 'p@example.com', name: { givenName: 'Jo', surname: 'Payer' } },
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1', status, amount: { currencyCode: 'USD', value: '4.99' } }] } }],
    },
  });

  it('capture: chuẩn hoá COMPLETED, truyền request id', async () => {
    captureOrder.mockResolvedValue(paidOrder());
    await expect(live().capture('PP-1', 'PD-ABC234')).resolves.toEqual({
      status: 'COMPLETED',
      captureId: 'CAP-1',
      amount: '4.99',
      currency: 'USD',
      payer: { email: 'p@example.com', name: 'Jo Payer' },
      orderStatus: null,
    });
    expect(captureOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'PP-1' }));
  });

  it('capture: trạng thái lạ hoặc không có capture là PENDING; DECLINED/FAILED giữ nguyên', async () => {
    captureOrder.mockResolvedValueOnce(paidOrder('PENDING'));
    await expect(live().capture('PP-1', 'x')).resolves.toMatchObject({ status: 'PENDING' });
    captureOrder.mockResolvedValueOnce({ result: { id: 'PP-1', purchaseUnits: [{}] } });
    await expect(live().capture('PP-1', 'x')).resolves.toMatchObject({ status: 'PENDING', captureId: null });
    captureOrder.mockResolvedValueOnce(paidOrder('DECLINED'));
    await expect(live().capture('PP-1', 'x')).resolves.toMatchObject({ status: 'DECLINED' });
    captureOrder.mockResolvedValueOnce(paidOrder('FAILED'));
    await expect(live().capture('PP-1', 'x')).resolves.toMatchObject({ status: 'FAILED' });
  });

  it('capture: 422 INSTRUMENT_DECLINED trả DECLINED; ORDER_ALREADY_CAPTURED ném lỗi riêng; lỗi khác ném nguyên', async () => {
    const apiError = (issue: string, statusCode = 422) => Object.assign(new Error('x'), { statusCode, result: { details: [{ issue }] } });
    captureOrder.mockRejectedValueOnce(apiError('INSTRUMENT_DECLINED'));
    await expect(live().capture('PP-1', 'x')).resolves.toMatchObject({ status: 'DECLINED', captureId: null });
    captureOrder.mockRejectedValueOnce(apiError('ORDER_ALREADY_CAPTURED'));
    await expect(live().capture('PP-1', 'x')).rejects.toBeInstanceOf(OrderAlreadyCapturedError);
    captureOrder.mockRejectedValueOnce(apiError('INSTRUMENT_DECLINED', 500));
    await expect(live().capture('PP-1', 'x')).rejects.toThrow('x');
    captureOrder.mockRejectedValueOnce(new Error('network'));
    await expect(live().capture('PP-1', 'x')).rejects.toThrow('network');
  });

  it('getOrder: chuẩn hoá giống capture', async () => {
    getOrder.mockResolvedValue(paidOrder());
    await expect(live().getOrder('PP-1')).resolves.toMatchObject({ status: 'COMPLETED', captureId: 'CAP-1' });
    expect(getOrder).toHaveBeenCalledWith({ id: 'PP-1' });
  });

  it('getOrder: điền orderStatus từ status của order PayPal', async () => {
    getOrder.mockResolvedValue({ result: { id: 'PP-1', status: 'APPROVED' } });
    await expect(live().getOrder('PP-1')).resolves.toMatchObject({ status: 'PENDING', orderStatus: 'APPROVED' });
  });

  it.each(['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'VOIDED'])('getOrder: giữ nguyên orderStatus %s', async (status) => {
    getOrder.mockResolvedValue({ result: { id: 'PP-1', status } });
    await expect(live().getOrder('PP-1')).resolves.toMatchObject({ orderStatus: status });
  });

  it('getOrder: HTTP 404 ném ProviderOrderNotFoundError; lỗi khác ném nguyên', async () => {
    getOrder.mockRejectedValueOnce(Object.assign(new Error('nf'), { statusCode: 404 }));
    await expect(live().getOrder('PP-1')).rejects.toBeInstanceOf(ProviderOrderNotFoundError);
    getOrder.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    await expect(live().getOrder('PP-1')).rejects.toThrow('boom');
    getOrder.mockRejectedValueOnce(new Error('network'));
    await expect(live().getOrder('PP-1')).rejects.toThrow('network');
  });

  describe('refund', () => {
    it.each(['FAILED', 'CANCELLED', 'PENDING'])('trạng thái %s: RefundRejectedError, không coi là đã hoàn', async (status) => {
      refundCapturedPayment.mockResolvedValue({ result: { id: 'RF-1', status } });
      await expect(live().refund('CAP-1', 'r')).rejects.toBeInstanceOf(RefundRejectedError);
    });

    it('phản hồi 2xx không có trạng thái: lỗi hệ thống, không coi là đã hoàn', async () => {
      refundCapturedPayment.mockResolvedValue({ result: {} });
      await expect(live().refund('CAP-1', 'r')).rejects.not.toBeInstanceOf(RefundRejectedError);
    });

    it.each([400, 403, 404])('HTTP %i có body lỗi: RefundRejectedError', async (statusCode) => {
      refundCapturedPayment.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode, result: { message: 'Lý do' } }));
      await expect(live().refund('C', 'r')).rejects.toMatchObject({ reason: 'Lý do' });
    });

    it.each([401, 409, 500])('HTTP %i: ném nguyên, không phải từ chối nghiệp vụ', async (statusCode) => {
      refundCapturedPayment.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode }));
      const err = await live().refund('C', 'r').catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(RefundRejectedError);
    });

    it('gọi SDK với capture id, request id, không body (hoàn toàn phần)', async () => {
      refundCapturedPayment.mockResolvedValue({ result: { id: 'RF-1', status: 'COMPLETED' } });
      await expect(live().refund('CAP-1', 'refund-PD-ABC234')).resolves.toEqual({ refundId: 'RF-1', status: 'COMPLETED' });
      const arg = refundCapturedPayment.mock.calls[0]![0];
      expect(arg).toMatchObject({ captureId: 'CAP-1', paypalRequestId: 'refund-PD-ABC234' });
      expect(arg.body).toBeUndefined();
    });

    it('422 bị từ chối: RefundRejectedError với description', async () => {
      refundCapturedPayment.mockRejectedValue(
        Object.assign(new Error('x'), {
          statusCode: 422,
          result: { details: [{ issue: 'REFUND_NOT_ALLOWED', description: 'Refund window expired' }] },
        }),
      );
      const err = await live().refund('CAP-1', 'r').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RefundRejectedError);
      expect((err as RefundRejectedError).reason).toBe('Refund window expired');
    });

    it('lý do dự phòng: issue rồi message', async () => {
      refundCapturedPayment.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 422, result: { details: [{ issue: 'REFUND_NOT_ALLOWED' }] } }));
      await expect(live().refund('C', 'r')).rejects.toMatchObject({ reason: 'REFUND_NOT_ALLOWED' });
      refundCapturedPayment.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 422, result: { message: 'Business error' } }));
      await expect(live().refund('C', 'r')).rejects.toMatchObject({ reason: 'Business error' });
    });

    it('CAPTURE_FULLY_REFUNDED coi như thành công', async () => {
      refundCapturedPayment.mockRejectedValue(
        Object.assign(new Error('x'), { statusCode: 422, result: { details: [{ issue: 'CAPTURE_FULLY_REFUNDED' }] } }),
      );
      await expect(live().refund('CAP-1', 'r')).resolves.toMatchObject({ refundId: null });
    });

    it('5xx / lỗi mạng / thiếu cấu hình ném nguyên', async () => {
      refundCapturedPayment.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
      await expect(live().refund('C', 'r')).rejects.toThrow('boom');
      refundCapturedPayment.mockRejectedValueOnce(new Error('network'));
      await expect(live().refund('C', 'r')).rejects.toThrow('network');
      await expect(new PaypalProvider(config({})).refund('C', 'r')).rejects.toBeInstanceOf(PaypalNotConfiguredError);
    });
  });

  describe('verifyWebhook', () => {
    const HEADERS = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-sig': 'sig==',
      'paypal-transmission-time': '2026-10-09T00:00:00Z',
    };
    const RAW = '{"id":"WH-1",  "resource":{"amount":{"value":"4.99"}}}';
    const cfg = (extra: Partial<Record<keyof Env, string>> = {}) =>
      config({ PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'sec', PAYPAL_WEBHOOK_ID: 'WID', ...extra });
    const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: () => Promise.resolve(body) }) as Response;
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('SUCCESS: lấy OAuth token rồi gửi raw body nguyên bytes trong webhook_event', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ access_token: 'AT' }))
        .mockResolvedValueOnce(json({ verification_status: 'SUCCESS' }));
      await expect(new PaypalProvider(cfg()).verifyWebhook(HEADERS, RAW)).resolves.toBe(true);
      const [oauthUrl, oauthInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(oauthUrl).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
      expect((oauthInit.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`);
      const [verifyUrl, verifyInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(verifyUrl).toBe('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');
      expect((verifyInit.headers as Record<string, string>).Authorization).toBe('Bearer AT');
      const body = verifyInit.body as string;
      expect(body).toContain(`"webhook_event":${RAW}`);
      expect(JSON.parse(body)).toMatchObject({
        auth_algo: 'SHA256withRSA',
        cert_url: HEADERS['paypal-cert-url'],
        transmission_id: 'tx-1',
        transmission_sig: 'sig==',
        transmission_time: HEADERS['paypal-transmission-time'],
        webhook_id: 'WID',
      });
    });

    it('live dùng host production; FAILURE trả false', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ access_token: 'AT' }))
        .mockResolvedValueOnce(json({ verification_status: 'FAILURE' }));
      await expect(new PaypalProvider(cfg({ PAYPAL_MODE: 'live' })).verifyWebhook(HEADERS, RAW)).resolves.toBe(false);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api-m.paypal.com/v1/oauth2/token');
    });

    it('lỗi HTTP/mạng/thiếu cấu hình thì ném (không trả false)', async () => {
      fetchMock.mockResolvedValueOnce(json({}, false, 401));
      await expect(new PaypalProvider(cfg()).verifyWebhook(HEADERS, RAW)).rejects.toThrow();
      fetchMock.mockResolvedValueOnce(json({ access_token: 'AT' })).mockResolvedValueOnce(json({}, false, 500));
      await expect(new PaypalProvider(cfg()).verifyWebhook(HEADERS, RAW)).rejects.toThrow();
      fetchMock.mockRejectedValueOnce(new Error('network'));
      await expect(new PaypalProvider(cfg()).verifyWebhook(HEADERS, RAW)).rejects.toThrow('network');
      await expect(new PaypalProvider(cfg({ PAYPAL_WEBHOOK_ID: '' })).verifyWebhook(HEADERS, RAW)).rejects.toBeInstanceOf(
        PaypalNotConfiguredError,
      );
    });
  });
});
