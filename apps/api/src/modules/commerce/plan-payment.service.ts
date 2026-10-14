import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CapturePlanOrderRequest,
  type CreatePlanOrderResponse,
  type Entitlement,
  ErrorCode,
  formatUsd,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { SubscriptionPayment as PaymentRow } from '../../generated/client';
import { EntitlementService } from '../billing/entitlement.service';
import { PlansService } from '../billing/plans.service';
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
