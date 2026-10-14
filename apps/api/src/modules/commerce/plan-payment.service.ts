import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CapturePlanOrderRequest,
  type CreatePlanOrderResponse,
  type CreateVietqrResponse,
  type PaymentStatusResponse,
  type Entitlement,
  ErrorCode,
  formatUsd,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import type { SubscriptionPayment as PaymentRow } from '../../generated/client';
import { EntitlementService } from '../billing/entitlement.service';
import { PlansService } from '../billing/plans.service';
import { buildQrUrl, compactPaymentCode, readSepayConfig } from '../billing/sepay';
import { SubscriptionActivationService } from '../billing/subscription-activation.service';
import { SubscriptionPaymentService } from '../billing/subscription-payment.service';
import { notFound } from '../catalog/catalog.helpers';
import { CustomerAccessService } from '../customers/customer-access.service';
import { AlertService } from '../notify/alert.service';
import { SettingsService } from '../settings/settings.service';
import {
  type CaptureResult,
  OrderAlreadyCapturedError,
  PAYMENT_PROVIDER,
  type PaymentProvider,
  ProviderOrderNotFoundError,
} from './payment-provider';

/** Payment VietQR PENDING còn được tái dùng trong khoảng này. */
const VIETQR_REUSE_MS = 24 * 60 * 60 * 1000;

const unavailable = (): AppException => new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);

/**
 * Mua gói bằng PayPal (S3, trả trước theo kỳ): tạo đơn PayPal USD theo giá gói ở server, capture, rồi kích hoạt qua
 * `SubscriptionActivationService` (dùng chung với webhook và VietQR). Không tin client về giá; không log email/payload.
 */
@Injectable()
export class PlanPaymentService {
  private readonly logger = new Logger(PlanPaymentService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payments: SubscriptionPaymentService,
    private readonly activation: SubscriptionActivationService,
    private readonly plans: PlansService,
    private readonly entitlement: EntitlementService,
    private readonly access: CustomerAccessService,
    private readonly settings: SettingsService,
    private readonly alerts: AlertService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createPaypalOrder(customerId: string, planId: string): Promise<CreatePlanOrderResponse> {
    if (!(await this.settings.paymentsEnabled())) throw new AppException(ErrorCode.PAYMENTS_DISABLED, HttpStatus.FORBIDDEN);
    await this.access.requireDownloadAccess(customerId); // khách còn hoạt động và đã xác minh email
    const plan = await this.plans.findActiveRow(planId);
    if (!plan) throw notFound('Không tìm thấy gói.');
    if (plan.priceUsdCents <= 0) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'planId', message: 'Gói này không có giá USD nên không thanh toán bằng PayPal được.' },
      ]);
    }

    const payment = await this.payments.createPending({
      customerId,
      plan,
      provider: 'PAYPAL',
      amount: plan.priceUsdCents,
      currency: 'USD',
    });
    try {
      const { providerOrderId } = await this.provider.createOrder({
        amountCents: plan.priceUsdCents,
        currency: 'USD',
        orderCode: payment.code,
        description: `Piano Daily ${payment.code}`,
      });
      await this.payments.setProviderRef(payment.id, providerOrderId);
      return { paymentCode: payment.code, paypalOrderId: providerOrderId };
    } catch (err) {
      this.logger.error(`Tạo đơn PayPal cho gói thất bại (${payment.code}): ${err instanceof Error ? err.name : 'unknown'}`);
      await this.payments.failIfPending(payment.id).catch(() => undefined);
      throw unavailable();
    }
  }

  /**
   * Tạo (hoặc tái dùng trong 24 giờ) thanh toán VietQR cho một gói: số tiền VND của gói, nội dung chuyển khoản là mã gọn.
   * Chưa cấu hình SePay → 503 trước mọi thứ khác.
   */
  async createVietqr(customerId: string, planId: string, now = new Date()): Promise<CreateVietqrResponse> {
    const sepay = readSepayConfig(this.config);
    if (!sepay) throw unavailable();
    if (!(await this.settings.paymentsEnabled())) throw new AppException(ErrorCode.PAYMENTS_DISABLED, HttpStatus.FORBIDDEN);
    await this.access.requireDownloadAccess(customerId);
    const plan = await this.plans.findActiveRow(planId);
    if (!plan) throw notFound('Không tìm thấy gói.');
    if (plan.priceVnd <= 0) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'planId', message: 'Gói này không có giá VND nên không thanh toán bằng VietQR được.' },
      ]);
    }
    const since = new Date(now.getTime() - VIETQR_REUSE_MS);
    // Tái dùng chỉ khi giá gói không đổi kể từ lúc tạo (QR cũ có số tiền cũ); tạo mới được serialize theo khách+gói.
    const payment = await this.payments.findOrCreatePending(
      { customerId, plan, provider: 'VIETQR', amount: plan.priceVnd, currency: 'VND', compactRef: true },
      since,
    );
    const content = compactPaymentCode(payment.code);
    return {
      paymentCode: payment.code,
      transferContent: content,
      amount: payment.amount,
      currency: 'VND',
      qrUrl: buildQrUrl(sepay, payment.amount, content),
      bankAccount: sepay.bankAccount,
      bankName: sepay.bankName,
      accountHolder: sepay.accountHolder,
    };
  }

  /** Trạng thái thanh toán của chính khách (web polling); kèm entitlement khi đã PAID. Mã của khách khác/lạ → 404. */
  async paymentStatus(customerId: string, code: string): Promise<PaymentStatusResponse> {
    const wanted = code.trim().toUpperCase();
    // Chấp nhận cả dạng có dấu gạch (PS-ABC234) lẫn dạng gọn dùng làm nội dung chuyển khoản (PSABC234).
    const payment = (await this.payments.findByCode(wanted)) ?? (await this.payments.findByProviderRef(compactPaymentCode(wanted)));
    if (!payment || payment.customerId !== customerId) throw notFound('Không tìm thấy đơn thanh toán.');
    return {
      status: payment.status,
      entitlement: payment.status === 'PAID' ? await this.entitlement.getEntitlement(customerId) : null,
    };
  }

  /** Capture rồi kích hoạt. Đơn không thuộc khách này hoặc lạ → 404 trước khi gọi PayPal. Gọi lại an toàn. */
  async capturePaypalOrder(customerId: string, { paypalOrderId }: CapturePlanOrderRequest): Promise<Entitlement> {
    const payment = await this.payments.findByProviderRef(paypalOrderId);
    if (!payment || payment.customerId !== customerId || payment.provider !== 'PAYPAL' || payment.status === 'REFUNDED') {
      throw notFound('Không tìm thấy đơn thanh toán.');
    }
    if (payment.status === 'PAID') return this.entitlement.getEntitlement(customerId);

    const capture = await this.callProvider(paypalOrderId, payment.code);
    if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
      await this.payments.failIfPending(payment.id).catch(() => undefined);
      throw new AppException(ErrorCode.PAYMENT_DECLINED, HttpStatus.PAYMENT_REQUIRED);
    }
    if (capture.status !== 'COMPLETED') {
      this.logger.error(`Capture gói chưa hoàn tất (${payment.code}): ${capture.status}`);
      throw unavailable();
    }
    await this.fulfil(payment.id, capture);
    return this.entitlement.getEntitlement(customerId);
  }

  /**
   * Kích hoạt khi capture `COMPLETED` và số tiền/tiền tệ khớp payment (nơi DUY NHẤT gọi kích hoạt cho PayPal; cả
   * capture-order lẫn webhook đi qua đây). Lệch → `review_required`, cảnh báo, 503; không kích hoạt.
   */
  async fulfil(paymentId: string, capture: CaptureResult): Promise<void> {
    const payment = await this.payments.findById(paymentId);
    if (!payment || payment.status === 'REFUNDED') throw notFound('Không tìm thấy đơn thanh toán.');
    if (payment.status === 'PAID') return;
    if (capture.status !== 'COMPLETED') throw unavailable();
    if (capture.amount !== formatUsd(payment.amount) || capture.currency !== payment.currency) {
      const first = await this.payments.markReviewRequired(payment.id);
      if (first) void this.alerts.alert('REVIEW_REQUIRED', `Thanh toán gói ${payment.code} cần xem xét (lệch số tiền)`, `Thanh toán gói ${payment.code}: capture lệch amount/currency, đã chuyển review_required.`, payment.code);
      this.logger.error(`Capture gói lệch amount/currency, cần xem xét thủ công (${payment.code}).`);
      throw unavailable();
    }
    const result = await this.activation.activate(payment.id, { paypalCaptureId: capture.captureId, payerEmail: capture.payer.email });
    if (result.activated && result.previousStatus !== 'PENDING') {
      this.logger.warn(`LATE_CAPTURE gói ${payment.code} (từ ${result.previousStatus})`);
      void this.alerts.alert('LATE_CAPTURE', `Capture muộn cho thanh toán gói ${payment.code}`, `Thanh toán gói ${payment.code} (từ ${result.previousStatus}) đã kích hoạt sau capture muộn.`, payment.code);
    }
  }

  /** Webhook REFUNDED toàn phần: payment REFUNDED và huỷ gói do nó kích hoạt. */
  refund(paymentId: string): Promise<boolean> {
    return this.activation.refund(paymentId);
  }

  /** Webhook DENIED: chỉ payment PENDING sang FAILED. */
  failIfPending(paymentId: string): Promise<boolean> {
    return this.payments.failIfPending(paymentId);
  }

  /** Tìm payment của một event webhook: theo PayPal order id, rồi theo `custom_id` (mã `PS-…`). */
  async findForWebhook(paypalOrderId: string | null, customId: string | null): Promise<PaymentRow | null> {
    if (paypalOrderId) {
      const found = await this.payments.findByProviderRef(paypalOrderId);
      if (found) return found;
    }
    return customId?.startsWith('PS-') ? this.payments.findByCode(customId) : null;
  }

  private async callProvider(paypalOrderId: string, requestId: string): Promise<CaptureResult> {
    try {
      return await this.provider.capture(paypalOrderId, requestId);
    } catch (err) {
      if (err instanceof OrderAlreadyCapturedError) return this.readOrder(paypalOrderId);
      if (err instanceof ProviderOrderNotFoundError) throw notFound('Không tìm thấy đơn thanh toán.');
      this.logger.error(`Capture PayPal cho gói thất bại (${requestId}): ${err instanceof Error ? err.name : 'unknown'}`);
      throw unavailable();
    }
  }

  private async readOrder(paypalOrderId: string): Promise<CaptureResult> {
    try {
      return await this.provider.getOrder(paypalOrderId);
    } catch (err) {
      this.logger.error(`Đọc đơn PayPal thất bại: ${err instanceof Error ? err.name : 'unknown'}`);
      throw unavailable();
    }
  }
}
