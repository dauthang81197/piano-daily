import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { OrderAlreadyCapturedError, PaymentProviderNotSupportedError } from '../../src/modules/commerce/payment-provider';
import { PaypalNotConfiguredError, PaypalProvider } from '../../src/modules/commerce/paypal.provider';

const createOrder = vi.fn();
const captureOrder = vi.fn();
const getOrder = vi.fn();
const clientCtor = vi.fn();

vi.mock('@paypal/paypal-server-sdk', () => ({
  CheckoutPaymentIntent: { Capture: 'CAPTURE' },
  Environment: { Production: 'Production', Sandbox: 'Sandbox' },
  Client: class {
    constructor(options: unknown) {
      clientCtor(options);
    }
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

  it('refund/verifyWebhook chưa hỗ trợ', async () => {
    const provider = new PaypalProvider(config({}));
    await expect(provider.refund()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
    await expect(provider.verifyWebhook()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
  });
});
