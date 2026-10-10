import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutPaymentIntent, Client, Environment, type Order, OrdersController } from '@paypal/paypal-server-sdk';
import { formatUsd } from '@piano-daily/shared';
import type { Env } from '../../config/env';
import {
  type CaptureResult,
  type CaptureStatus,
  type CreateProviderOrderInput,
  OrderAlreadyCapturedError,
  type PaymentProvider,
  PaymentProviderNotSupportedError,
  ProviderOrderNotFoundError,
} from './payment-provider';

/** Mã lỗi 422 của PayPal khi thanh toán bị từ chối (người mua có thể thử phương thức khác). */
const DECLINE_ISSUES = new Set(['INSTRUMENT_DECLINED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY', 'PAYER_ACCOUNT_RESTRICTED']);

/** Thiếu cấu hình PayPal: tạo đơn không thể thực hiện (caller đổi thành 503). */
export class PaypalNotConfiguredError extends Error {
  constructor() {
    super('Chưa cấu hình PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.');
    this.name = 'PaypalNotConfiguredError';
  }
}

/**
 * Adapter PayPal: nơi DUY NHẤT import `@paypal/paypal-server-sdk` (AD-1). `PAYPAL_MODE` chọn sandbox/live.
 * Đã cài `createOrder`, `getOrder`, `capture`; `verifyWebhook` (Story 3.8); `refund` chủ động thuộc Story 4.x.
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

  async getOrder(providerOrderId: string): Promise<CaptureResult> {
    try {
      const { result } = await this.controller().getOrder({ id: providerOrderId });
      return toCaptureResult(result);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { statusCode?: unknown }).statusCode === 404) {
        throw new ProviderOrderNotFoundError();
      }
      throw err;
    }
  }

  async capture(providerOrderId: string, _requestId: string): Promise<CaptureResult> {
    try {
      const { result } = await this.controller().captureOrder({
        id: providerOrderId,
        // Không gửi PayPal-Request-Id: cùng id sẽ phát lại kết quả bị từ chối cũ khi người mua đổi phương thức thanh toán.
        // Capture lại một đơn đã capture được PayPal báo ORDER_ALREADY_CAPTURED nên vẫn idempotent.
        prefer: 'return=representation',
      });
      return toCaptureResult(result);
    } catch (err) {
      const issues = apiErrorIssues(err);
      if (issues?.includes('ORDER_ALREADY_CAPTURED')) throw new OrderAlreadyCapturedError();
      if (issues?.some((issue) => DECLINE_ISSUES.has(issue))) {
        return { status: 'DECLINED', captureId: null, amount: null, currency: null, payer: { email: null, name: null } };
      }
      throw err;
    }
  }

  refund(): Promise<never> {
    return Promise.reject(new PaymentProviderNotSupportedError('refund'));
  }

  /**
   * Xác thực chữ ký webhook bằng REST `verify-webhook-signature` (SDK không có API này). `rawBody` được nhúng nguyên
   * bytes vào `webhook_event` (không parse/stringify lại) vì chữ ký tính trên đúng body gốc. Chỉ `SUCCESS` là true;
   * lỗi mạng/HTTP/thiếu cấu hình ném ra (caller đổi thành 503 để PayPal gửi lại).
   */
  async verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): Promise<boolean> {
    const clientId = this.config.get('PAYPAL_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('PAYPAL_CLIENT_SECRET', { infer: true });
    const webhookId = this.config.get('PAYPAL_WEBHOOK_ID', { infer: true });
    if (!clientId || !clientSecret || !webhookId) throw new PaypalNotConfiguredError();
    const host = this.config.get('PAYPAL_MODE', { infer: true }) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    const tokenRes = await fetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) throw new Error(`PayPal OAuth HTTP ${tokenRes.status}`);
    const accessToken = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('PayPal OAuth không trả access_token.');

    const body =
      `{"auth_algo":${JSON.stringify(headers['paypal-auth-algo'] ?? '')},` +
      `"cert_url":${JSON.stringify(headers['paypal-cert-url'] ?? '')},` +
      `"transmission_id":${JSON.stringify(headers['paypal-transmission-id'] ?? '')},` +
      `"transmission_sig":${JSON.stringify(headers['paypal-transmission-sig'] ?? '')},` +
      `"transmission_time":${JSON.stringify(headers['paypal-transmission-time'] ?? '')},` +
      `"webhook_id":${JSON.stringify(webhookId)},` +
      `"webhook_event":${rawBody}}`;
    const res = await fetch(`${host}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`PayPal verify-webhook-signature HTTP ${res.status}`);
    return ((await res.json()) as { verification_status?: unknown }).verification_status === 'SUCCESS';
  }
}

/** Các `issue` trong body lỗi 422 của PayPal (SDK ném `ApiError` mang `statusCode` và `result`); null nếu không phải 422. */
function apiErrorIssues(err: unknown): string[] | null {
  if (typeof err !== 'object' || err === null) return null;
  const { statusCode, result } = err as { statusCode?: unknown; result?: unknown };
  if (statusCode !== 422) return null;
  const details = (result as { details?: unknown } | null | undefined)?.details;
  if (!Array.isArray(details)) return [];
  return details.flatMap((d: unknown) => {
    const issue = (d as { issue?: unknown } | null)?.issue;
    return typeof issue === 'string' ? [issue] : [];
  });
}

function normaliseStatus(status: string | undefined): CaptureStatus {
  return status === 'COMPLETED' || status === 'DECLINED' || status === 'FAILED' ? status : 'PENDING';
}

/** Chuẩn hoá đơn PayPal thành `CaptureResult`: dùng capture đầu tiên của purchase unit đầu tiên. */
function toCaptureResult(order: Order): CaptureResult {
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  const name = [order.payer?.name?.givenName, order.payer?.name?.surname].filter(Boolean).join(' ');
  return {
    status: capture ? normaliseStatus(capture.status) : 'PENDING',
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ?? null,
    currency: capture?.amount?.currencyCode ?? null,
    payer: { email: order.payer?.emailAddress ?? null, name: name || null },
    orderStatus: order.status ?? null,
  };
}
