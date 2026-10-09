import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PaymentEventRepository } from './payment-event.repository';
import { type CaptureResult, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/** Header PayPal dùng để xác thực chữ ký (chữ thường theo Node). */
export const PAYPAL_SIGNATURE_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const;

type PaypalEvent = { id: string; event_type: string; resource: Record<string, unknown> };

function badRequest(message: string): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, message);
}

const unavailable = (): AppException => new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * Webhook PayPal (Story 3.8): xác thực chữ ký -> ghi `PaymentEvent` -> xử lý idempotent -> đánh dấu processed.
 * Lỗi xử lý ném 503/500 để PayPal gửi lại (`processed_at` giữ null). Không bao giờ log payload, email, token, webhook id.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly events: PaymentEventRepository,
    private readonly orders: OrderService,
    private readonly orderRepo: OrderRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle(headers: Record<string, string | undefined>, rawBody: string): Promise<void> {
    if (!this.config.get('PAYPAL_WEBHOOK_ID', { infer: true })) {
      this.logger.warn('Thiếu PAYPAL_WEBHOOK_ID: không xác thực được webhook PayPal.');
      throw unavailable();
    }
    if (PAYPAL_SIGNATURE_HEADERS.some((name) => !headers[name])) throw badRequest('Thiếu header chữ ký webhook.');

    let verified: boolean;
    try {
      verified = await this.provider.verifyWebhook(headers, rawBody);
    } catch (err) {
      this.logger.error(`Xác thực webhook PayPal thất bại: ${err instanceof Error ? err.name : 'unknown'}`);
      throw unavailable();
    }
    if (!verified) throw badRequest('Chữ ký webhook không hợp lệ.');

    const event = parseEvent(rawBody);
    if (!event) throw badRequest('Nội dung webhook không hợp lệ.');

    const recorded = await this.events.record(event.id, event.event_type, JSON.parse(rawBody));
    if (!recorded.created && recorded.processedAt) return;

    try {
      await this.dispatch(event);
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error(`Xử lý webhook ${event.event_type} thất bại: ${err instanceof Error ? err.name : 'unknown'}`);
      throw unavailable();
    }
    await this.events.markProcessed(event.id);
  }

  private async dispatch(event: PaypalEvent): Promise<void> {
    const type = event.event_type;
    if (type !== 'PAYMENT.CAPTURE.COMPLETED' && type !== 'PAYMENT.CAPTURE.REFUNDED' && type !== 'PAYMENT.CAPTURE.DENIED') return;

    const order = await this.findOrder(event.resource);
    if (!order) {
      this.logger.warn(`Webhook ${type}: không tìm thấy đơn tương ứng.`);
      return;
    }
    if (type === 'PAYMENT.CAPTURE.COMPLETED') {
      if (order.status === 'REFUNDED') return;
      await this.orders.fulfil(order.id, toCompletedCapture(event.resource));
    } else if (type === 'PAYMENT.CAPTURE.REFUNDED') {
      // PayPal không đảm bảo thứ tự: REFUNDED đến trước COMPLETED thì chưa hoàn được. Báo lỗi để PayPal gửi lại sau khi đơn đã PAID.
      if (order.status !== 'PAID' && order.status !== 'REFUNDED') throw unavailable();
      await this.orders.refund(order.id);
    } else {
      await this.orders.failIfPending(order.id);
    }
  }

  private async findOrder(resource: Record<string, unknown>) {
    const supplementary = isRecord(resource.supplementary_data) ? resource.supplementary_data : {};
    const related = isRecord(supplementary.related_ids) ? supplementary.related_ids : {};
    const paypalOrderId = str(related.order_id);
    if (paypalOrderId) {
      const found = await this.orderRepo.findByPaypalOrderId(paypalOrderId);
      if (found) return found;
    }
    const orderCode = str(resource.custom_id);
    return orderCode ? this.orderRepo.findByOrderCode(orderCode) : null;
  }
}

function parseEvent(rawBody: string): PaypalEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const id = str(json.id);
  const type = str(json.event_type);
  if (!id || !type || !isRecord(json.resource)) return null;
  return { id, event_type: type, resource: json.resource };
}

/** `CaptureResult` COMPLETED dựng từ `resource` của capture; payer không có trong event nên để null. */
function toCompletedCapture(resource: Record<string, unknown>): CaptureResult {
  const amount = isRecord(resource.amount) ? resource.amount : {};
  return {
    status: 'COMPLETED',
    captureId: str(resource.id),
    amount: str(amount.value),
    currency: str(amount.currency_code),
    payer: { email: null, name: null },
  };
}
