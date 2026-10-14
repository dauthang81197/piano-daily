import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { z } from 'zod';
import { AppException } from '../../common/http-exception.filter';
import { safeEqual } from '../../common/safe-equal';
import type { Env } from '../../config/env';
import { extractPaymentCodes, readSepayConfig } from '../billing/sepay';
import { SubscriptionActivationService } from '../billing/subscription-activation.service';
import { SubscriptionPaymentService } from '../billing/subscription-payment.service';
import { AlertService } from '../notify/alert.service';
import { PaymentEventRepository } from './payment-event.repository';

/** Payload webhook SePay (chỉ các trường dùng tới; phần còn lại bỏ qua). */
const payloadSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  transferType: z.string(),
  // SePay có thể gửi số dạng chuỗi: ép kiểu thay vì từ chối.
  transferAmount: z.coerce.number().nonnegative(),
  accountNumber: z.coerce.string().nullish(),
  content: z.coerce.string().nullish(),
  code: z.coerce.string().nullish(),
});

const SUCCESS = { success: true } as const;
const unavailable = (): AppException => new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);

/**
 * Webhook SePay (S4): xác thực `Authorization: Apikey <key>` -> ghi `PaymentEvent` idempotent (`sepay:<id>`) -> đối soát mã
 * `PS…` trong `code`/`content` -> kích hoạt qua `SubscriptionActivationService`. Giao dịch không liên quan vẫn trả
 * `{success:true}` để SePay không gửi lại vô ích; lỗi hệ thống ném 5xx để SePay gửi lại (tối đa 7 lần / 5 giờ).
 * Không log payload, nội dung chuyển khoản hay API key.
 */
@Injectable()
export class SepayWebhookService {
  private readonly logger = new Logger(SepayWebhookService.name);

  constructor(
    private readonly payments: SubscriptionPaymentService,
    private readonly activation: SubscriptionActivationService,
    private readonly events: PaymentEventRepository,
    private readonly alerts: AlertService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle(authorization: string | undefined, body: unknown): Promise<typeof SUCCESS> {
    const sepay = readSepayConfig(this.config);
    if (!sepay) {
      this.logger.warn('Thiếu cấu hình SePay: không nhận được webhook SePay.');
      throw unavailable();
    }
    const key = /^Apikey\s+(\S+)$/i.exec(authorization ?? '')?.[1];
    if (!key || !safeEqual(key, sepay.apiKey)) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      // Không trả 4xx: SePay sẽ gửi lại vô ích. Ghi log + cảnh báo để phát hiện khi định dạng webhook đổi.
      this.logger.error('Webhook SePay có nội dung không đúng định dạng đã biết, bỏ qua.');
      void this.alerts.alert('WEBHOOK_ERROR', 'Lỗi webhook SePay', 'Nhận webhook SePay có nội dung không đúng định dạng đã biết (có thể SePay đã đổi định dạng).', 'sepay-format');
      return SUCCESS;
    }
    const tx = parsed.data;
    if (tx.transferType !== 'in') return SUCCESS;
    // Tiền vào tài khoản khác (cùng khoá SePay liên kết nhiều tài khoản) thì không phải khoản thanh toán gói.
    if (tx.accountNumber && normalizeAccount(tx.accountNumber) !== normalizeAccount(sepay.bankAccount)) return SUCCESS;

    const eventId = `sepay:${tx.id}`;
    const recorded = await this.events.record(eventId, 'SEPAY.TRANSFER_IN', body);
    if (!recorded.created && recorded.processedAt) return SUCCESS;

    try {
      await this.reconcile(tx.transferAmount, tx.code, tx.content);
    } catch (err) {
      // Lỗi nghiệp vụ không thể thành công khi gửi lại (vd. payment vừa bị hoàn tiền): coi như đã xử lý, không bắt SePay retry.
      if (err instanceof AppException && err.getStatus() < 500) {
        this.logger.warn(`Webhook SePay: giao dịch không kích hoạt được (${err.code}).`);
        await this.events.markProcessed(eventId);
        return SUCCESS;
      }
      if (err instanceof AppException) throw err;
      this.logger.error(`Xử lý webhook SePay thất bại: ${err instanceof Error ? err.name : 'unknown'}`);
      void this.alerts.alert('WEBHOOK_ERROR', 'Lỗi webhook SePay', `Xử lý webhook SePay thất bại (${err instanceof Error ? err.name : 'unknown'}).`, 'sepay');
      throw unavailable();
    }
    await this.events.markProcessed(eventId);
    return SUCCESS;
  }

  /** So giao dịch tiền vào với thanh toán VietQR: đủ/thừa tiền → kích hoạt, thiếu tiền → cần xem xét, không khớp → bỏ qua. */
  private async reconcile(amount: number, code: string | null | undefined, content: string | null | undefined): Promise<void> {
    for (const candidate of extractPaymentCodes(code, content)) {
      const payment = await this.payments.findByProviderRef(candidate);
      if (!payment || payment.provider !== 'VIETQR') continue;
      if (payment.status === 'PAID' || payment.status === 'REFUNDED') return;

      if (amount < payment.amount) {
        const first = await this.payments.markReviewRequired(payment.id);
        this.logger.warn(`Chuyển khoản thiếu tiền cho thanh toán gói ${payment.code}.`);
        // Mỗi giao dịch được so riêng (không cộng dồn): khách chuyển bù phần thiếu thì cần admin xác nhận thủ công.
        if (first) void this.alerts.alert('REVIEW_REQUIRED', `Thanh toán gói ${payment.code} chuyển thiếu tiền`, `Thanh toán gói ${payment.code}: số tiền nhận được ít hơn số tiền cần trả, chưa kích hoạt. Hãy đối chiếu sao kê; nếu khách chuyển bù phần thiếu hoặc bạn chấp nhận, bấm "Xác nhận đã nhận tiền" ở admin, nếu không thì hoàn tiền cho khách.`, payment.code);
        return;
      }
      const result = await this.activation.activate(payment.id, {});
      if (result.activated && result.previousStatus !== 'PENDING') {
        void this.alerts.alert('LATE_CAPTURE', `Tiền về muộn cho thanh toán gói ${payment.code}`, `Thanh toán gói ${payment.code} (từ ${result.previousStatus}) đã kích hoạt sau khi nhận chuyển khoản.`, payment.code);
      }
      if (result.activated && amount > payment.amount) {
        void this.alerts.alert('REVIEW_REQUIRED', `Thanh toán gói ${payment.code} chuyển thừa tiền`, `Thanh toán gói ${payment.code}: nhận nhiều hơn số tiền cần trả, đã kích hoạt; cần hoàn phần thừa cho khách.`, payment.code);
      }
      return;
    }
  }
}

/** Số tài khoản so sánh không phân biệt khoảng trắng/dấu gạch. */
function normalizeAccount(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}
