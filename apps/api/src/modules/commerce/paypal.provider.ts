import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutPaymentIntent, Client, Environment, OrdersController } from '@paypal/paypal-server-sdk';
import { formatUsd } from '@piano-daily/shared';
import type { Env } from '../../config/env';
import {
  type CreateProviderOrderInput,
  type PaymentProvider,
  PaymentProviderNotSupportedError,
} from './payment-provider';

/** Thiếu cấu hình PayPal: tạo đơn không thể thực hiện (caller đổi thành 503). */
export class PaypalNotConfiguredError extends Error {
  constructor() {
    super('Chưa cấu hình PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.');
    this.name = 'PaypalNotConfiguredError';
  }
}

/**
 * Adapter PayPal: nơi DUY NHẤT import `@paypal/paypal-server-sdk` (AD-1). `PAYPAL_MODE` chọn sandbox/live.
 * Story 3.3 chỉ cài `createOrder`; các hàm còn lại thuộc Story 3.4+.
 */
@Injectable()
export class PaypalProvider implements PaymentProvider {
  private orders: OrdersController | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  private controller(): OrdersController {
    if (this.orders) return this.orders;
    const oAuthClientId = this.config.get('PAYPAL_CLIENT_ID', { infer: true });
    const oAuthClientSecret = this.config.get('PAYPAL_CLIENT_SECRET', { infer: true });
    if (!oAuthClientId || !oAuthClientSecret) throw new PaypalNotConfiguredError();
    const live = this.config.get('PAYPAL_MODE', { infer: true }) === 'live';
    const client = new Client({
      environment: live ? Environment.Production : Environment.Sandbox,
      clientCredentialsAuthCredentials: { oAuthClientId, oAuthClientSecret },
      timeout: 15_000,
    });
    this.orders = new OrdersController(client);
    return this.orders;
  }

  async createOrder(input: CreateProviderOrderInput): Promise<{ providerOrderId: string }> {
    const { result } = await this.controller().createOrder({
      // Cùng mã đơn gửi lại (retry mạng) thì PayPal trả đúng đơn cũ, không tạo đơn trùng.
      paypalRequestId: input.orderCode,
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            referenceId: input.orderCode,
            customId: input.orderCode,
            invoiceId: input.orderCode,
            description: input.description,
            amount: { currencyCode: input.currency, value: formatUsd(input.amountCents) },
          },
        ],
      },
    });
    if (!result.id) throw new Error('PayPal không trả về order id.');
    return { providerOrderId: result.id };
  }

  getOrder(): Promise<never> {
    return Promise.reject(new PaymentProviderNotSupportedError('getOrder'));
  }

  capture(): Promise<never> {
    return Promise.reject(new PaymentProviderNotSupportedError('capture'));
  }

  refund(): Promise<never> {
    return Promise.reject(new PaymentProviderNotSupportedError('refund'));
  }

  verifyWebhook(): Promise<never> {
    return Promise.reject(new PaymentProviderNotSupportedError('verifyWebhook'));
  }
}
