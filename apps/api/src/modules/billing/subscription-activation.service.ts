import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import type { PaymentTerms } from './subscription-payment.service';

const DAY_MS = 86_400_000;

export type ActivationInfo = {
  /** Id capture PayPal (nếu có). */
  paypalCaptureId?: string | null;
  payerEmail?: string | null;
};

export type ActivationResult = {
  subscriptionId: string;
  /** true nếu chính lệnh này kích hoạt; false nếu payment đã PAID từ trước (gọi lại / thua cuộc đua). */
  activated: boolean;
  /** Trạng thái của payment ngay trước lệnh này (để caller ghi nhận capture muộn). */
  previousStatus: string;
};

/** Hạn mức cộng dồn khi gia hạn cùng gói: null (không giới hạn) nếu một trong hai không giới hạn, ngược lại tổng. */
export function stackQuota(current: number | null, added: number | null): number | null {
  return current === null || added === null ? null : current + added;
}

/**
 * Kích hoạt gói sau khi tiền về (PayPal S3, VietQR S4). Nguyên tử và idempotent: khoá dòng payment rồi dòng khách trong
 * một transaction nên capture-order, webhook và đối soát ngân hàng đồng thời chỉ kích hoạt một lần.
 * - Cùng gói còn hạn: gia hạn (`current_period_end` += `durationDays`, hạn mức cộng dồn, giữ lượt đã dùng).
 * - Khác gói hoặc đã hết hạn: gói cũ -> CANCELLED (hoặc EXPIRED nếu quá hạn), gói mới bắt đầu từ bây giờ.
 */
@Injectable()
export class SubscriptionActivationService {
  constructor(private readonly prisma: PrismaService) {}

  async activate(paymentId: string, info: ActivationInfo = {}, now = new Date()): Promise<ActivationResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM subscription_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });
      if (payment.status === 'PAID' && payment.subscriptionId) {
        return { subscriptionId: payment.subscriptionId, activated: false, previousStatus: payment.status };
      }
      // Hoàn tiền thắng cuộc đua với capture/webhook: coi như không còn đơn (không phải lỗi 500).
      if (payment.status === 'REFUNDED') throw notFound('Không tìm thấy đơn thanh toán.');

      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${payment.customerId}::uuid FOR UPDATE`;
      const terms = payment.terms as PaymentTerms;
      // Bản ACTIVE đã quá hạn không còn hiệu lực: ghi EXPIRED để nhường chỗ cho unique một phần.
      await tx.subscription.updateMany({
        where: { customerId: payment.customerId, status: 'ACTIVE', currentPeriodEnd: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      const active = await tx.subscription.findFirst({ where: { customerId: payment.customerId, status: 'ACTIVE' } });

      let subscriptionId: string;
      if (active && active.planId === payment.planId) {
        const renewed = await tx.subscription.update({
          where: { id: active.id },
          data: {
            currentPeriodEnd: new Date(active.currentPeriodEnd.getTime() + terms.durationDays * DAY_MS),
            downloadQuota: stackQuota(active.downloadQuota, terms.downloadQuota),
            provider: payment.provider,
          },
        });
        subscriptionId = renewed.id;
      } else {
        if (active) await tx.subscription.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
        const created = await tx.subscription.create({
          data: {
            customerId: payment.customerId,
            planId: payment.planId,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + terms.durationDays * DAY_MS),
            downloadQuota: terms.downloadQuota,
            provider: payment.provider,
          },
        });
        subscriptionId = created.id;
      }

      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: now,
          subscriptionId,
          ...(info.paypalCaptureId ? { paypalCaptureId: info.paypalCaptureId } : {}),
          ...(info.payerEmail ? { payerEmail: info.payerEmail } : {}),
        },
      });
      return { subscriptionId, activated: true, previousStatus: payment.status };
    });
  }

  /**
   * Hoàn tiền toàn phần của MỘT thanh toán: payment PAID -> REFUNDED, và thu hồi phần quyền lợi của riêng thanh toán đó.
   * Subscription chỉ do thanh toán này kích hoạt -> CANCELLED. Subscription còn được gia hạn bởi thanh toán PAID khác
   * -> chỉ rút ngắn `current_period_end` đúng `durationDays` và trừ hạn mức đã cộng dồn (hết hạn thì CANCELLED), để khoản
   * tiền khách vẫn đã trả cho kỳ khác không bị thu hồi. Payment không PAID thì không làm gì. Trả true nếu chính lệnh này hoàn.
   */
  async refund(paymentId: string, now = new Date()): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM subscription_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.status !== 'PAID') return false;
      await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: now } });
      if (!payment.subscriptionId) return true;

      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${payment.customerId}::uuid FOR UPDATE`;
      const sub = await tx.subscription.findUnique({ where: { id: payment.subscriptionId } });
      if (!sub || sub.status !== 'ACTIVE') return true; // gói đã bị thay/hết hạn: không còn gì để thu hồi
      const others = await tx.subscriptionPayment.count({
        where: { subscriptionId: sub.id, status: 'PAID', id: { not: payment.id } },
      });
      if (others === 0) {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
        return true;
      }
      const terms = payment.terms as PaymentTerms;
      const end = new Date(sub.currentPeriodEnd.getTime() - terms.durationDays * DAY_MS);
      if (end.getTime() <= now.getTime()) {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
      } else {
        const quota = sub.downloadQuota !== null && terms.downloadQuota !== null ? Math.max(1, sub.downloadQuota - terms.downloadQuota) : sub.downloadQuota;
        await tx.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: end, downloadQuota: quota } });
      }
      return true;
    });
  }
}
