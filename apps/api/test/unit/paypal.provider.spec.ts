import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { PaymentProviderNotSupportedError } from '../../src/modules/commerce/payment-provider';
import { PaypalNotConfiguredError, PaypalProvider } from '../../src/modules/commerce/paypal.provider';

const createOrder = vi.fn();
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
  },
}));


const config = (values: Partial<Record<keyof Env, string>>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;
const INPUT = { amountCents: 1999, currency: 'USD', orderCode: 'PD-ABC234', description: 'x' } as const;

describe('PaypalProvider', () => {
  beforeEach(() => {
    createOrder.mockReset();
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

  it('getOrder/capture/refund/verifyWebhook chưa hỗ trợ', async () => {
    const provider = new PaypalProvider(config({}));
    await expect(provider.getOrder()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
    await expect(provider.capture()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
    await expect(provider.refund()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
    await expect(provider.verifyWebhook()).rejects.toBeInstanceOf(PaymentProviderNotSupportedError);
  });
});
