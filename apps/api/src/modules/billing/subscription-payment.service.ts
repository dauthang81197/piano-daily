import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SubscriptionPayment, SubscriptionPaymentProvider } from '@piano-daily/shared';
import type { Plan as PlanRow, SubscriptionPayment as PaymentRow } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isPrismaError } from '../catalog/prisma-errors';

/** 32 ký tự khác nhau, bỏ ký tự dễ nhầm (I, O, 0, 1) nên `byte % 32` chọn đều. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generatePaymentCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return `PS-${Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('')}`;
}

/** Điều khoản gói chụp lúc mua (cột `terms`). */
export type PaymentTerms = {
  nameVi: string;
  nameEn: string;
  durationDays: number;
  downloadQuota: number | null;
  priceVnd: number;
  priceUsdCents: number;
};

export function termsOf(plan: PlanRow): PaymentTerms {
  return {
    nameVi: plan.nameVi,
    nameEn: plan.nameEn,
    durationDays: plan.durationDays,
    downloadQuota: plan.downloadQuota,
    priceVnd: plan.priceVnd,
    priceUsdCents: plan.priceUsdCents,
  };
}

export type NewPayment = {
  customerId: string;
  plan: PlanRow;
  provider: SubscriptionPaymentProvider;
  /** Đơn vị nhỏ nhất của `currency` (USD cents / VND nguyên). */
  amount: number;
  currency: 'USD' | 'VND';
};

/** Nơi DUY NHẤT ghi bảng `subscription_payments` (cùng `SubscriptionActivationService` cho các chuyển trạng thái PAID/REFUNDED). */
@Injectable()
export class SubscriptionPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo thanh toán PENDING; thử lại khi trùng mã (P2002), lỗi khác ném nguyên. */
  async createPending(input: NewPayment): Promise<PaymentRow> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.subscriptionPayment.create({
          data: {
            code: generatePaymentCode(),
            customerId: input.customerId,
            planId: input.plan.id,
            provider: input.provider,
            amount: input.amount,
            currency: input.currency,
            terms: termsOf(input.plan),
          },
        });
      } catch (err) {
        if (!isPrismaError(err, 'P2002') || attempt >= 5) throw err;
      }
    }
  }

  async setProviderRef(id: string, providerRef: string): Promise<void> {
    await this.prisma.subscriptionPayment.update({ where: { id }, data: { providerRef } });
  }

  findById(id: string): Promise<PaymentRow | null> {
    return this.prisma.subscriptionPayment.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<PaymentRow | null> {
    return this.prisma.subscriptionPayment.findUnique({ where: { code } });
  }

  findByProviderRef(providerRef: string): Promise<PaymentRow | null> {
    return this.prisma.subscriptionPayment.findUnique({ where: { providerRef } });
  }

  /** PENDING -> FAILED có điều kiện (UPDATE … WHERE status = PENDING). Trả true nếu chính lệnh này đổi. */
  async failIfPending(id: string): Promise<boolean> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    return count === 1;
  }

  /** Đánh dấu cần xem xét. Trả true chỉ ở lần đầu (để chỉ cảnh báo một lần dù PayPal gửi lại webhook nhiều lần). */
  async markReviewRequired(id: string): Promise<boolean> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, reviewRequired: false },
      data: { reviewRequired: true },
    });
    return count === 1;
  }

  /** Danh sách gần đây cho admin (chỉ đọc), mới nhất trước. */
  async listForAdmin(limit = 100): Promise<SubscriptionPayment[]> {
    const rows = await this.prisma.subscriptionPayment.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { customer: { select: { email: true } }, plan: { select: { nameVi: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      customerEmail: row.customer.email,
      planNameVi: row.plan.nameVi,
      provider: row.provider as SubscriptionPaymentProvider,
      status: row.status,
      amount: row.amount,
      currency: row.currency as 'USD' | 'VND',
      reviewRequired: row.reviewRequired,
      paidAt: row.paidAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
