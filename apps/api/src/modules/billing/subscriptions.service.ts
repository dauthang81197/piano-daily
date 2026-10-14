import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type GrantPlanBody, type GrantPlanResponse } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionActivationService } from './subscription-activation.service';
import { SubscriptionPaymentService } from './subscription-payment.service';
import { notFound } from '../catalog/catalog.helpers';

const DAY_MS = 86_400_000;

/** Nơi DUY NHẤT ghi bảng `subscriptions`. S2 chỉ có cấp tay (`provider=ADMIN`); S3/S4 thêm thanh toán. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: SubscriptionPaymentService,
    private readonly activation: SubscriptionActivationService,
  ) {}

  /**
   * Admin xác nhận đã nhận tiền cho thanh toán VietQR (khách ghi sai nội dung nên đối soát tự động không khớp). Kích hoạt qua
   * dịch vụ dùng chung nên idempotent. Chỉ VIETQR đang PENDING/FAILED; PAID trả hiện trạng; REFUNDED/PayPal → 409.
   */
  async confirmVietqr(paymentId: string, adminId: string): Promise<{ status: 'PAID' }> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw notFound('Không tìm thấy thanh toán.');
    if (payment.provider !== 'VIETQR') {
      throw new AppException(ErrorCode.ORDER_NOT_PAID, HttpStatus.CONFLICT, 'Chỉ xác nhận thủ công được thanh toán VietQR đang chờ hoặc thất bại.');
    }
    if (payment.status === 'PAID') return { status: 'PAID' };
    if (payment.status === 'REFUNDED' || payment.status === 'CANCELLED') {
      throw new AppException(ErrorCode.ORDER_NOT_PAID, HttpStatus.CONFLICT, 'Chỉ xác nhận thủ công được thanh toán VietQR đang chờ hoặc thất bại.');
    }
    const result = await this.activation.activate(payment.id, {});
    // Dấu vết ai xác nhận (chưa có bảng audit riêng): chỉ id admin và mã thanh toán, không dữ liệu khách.
    if (result.activated) this.logger.log(`Admin ${adminId} xác nhận thủ công thanh toán VietQR ${payment.code}.`);
    return { status: 'PAID' };
  }

  /**
   * Cấp gói cho khách theo email: gói ACTIVE hiện có (nếu có) sang CANCELLED rồi tạo gói mới với hạn = now + `duration_days`.
   * Email lạ → 404; gói không tồn tại hoặc đang tắt → 400.
   */
  async grant({ email, planId }: GrantPlanBody, now = new Date()): Promise<GrantPlanResponse> {
    const customer = await this.prisma.customer.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } });
    if (!customer) throw notFound('Không tìm thấy khách với email này.');
    if (!customer.isActive) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, 'Tài khoản khách đã bị khoá nên không cấp gói được.');
    }
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan?.isActive) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'planId', message: 'Gói không tồn tại hoặc đang tắt.' },
      ]);
    }
    const end = new Date(now.getTime() + plan.durationDays * DAY_MS);
    await this.prisma.$transaction(async (tx) => {
      // Khoá dòng khách để hai lần cấp đồng thời xếp hàng (unique một phần không bao giờ bị vi phạm → không 500).
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      await tx.subscription.updateMany({
        where: { customerId: customer.id, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      await tx.subscription.create({
        data: { customerId: customer.id, planId: plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end, downloadQuota: plan.downloadQuota, provider: 'ADMIN' },
      });
    });
    return {
      customerEmail: customer.email,
      planId: plan.id,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: end.toISOString(),
    };
  }
}
