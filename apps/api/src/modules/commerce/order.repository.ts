import { Injectable } from '@nestjs/common';
import type { OrderItem, OrderLocale, OrderStatus } from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NewOrder = {
  orderCode: string;
  sheetId: string;
  email: string;
  items: OrderItem[];
  amountCents: number;
  locale?: OrderLocale;
};

/** Nơi DUY NHẤT ghi bảng `orders` (AD-1, AD-20). Đổi `status` chỉ qua `OrderService`. */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo đơn PENDING. Trùng `order_code` ném P2002 để caller thử lại mã khác. */
  async createPending(order: NewOrder): Promise<{ id: string; orderCode: string }> {
    return this.prisma.order.create({
      data: { ...order, items: order.items, currency: 'USD', status: 'PENDING' },
      select: { id: true, orderCode: true },
    });
  }

  async findStatus(id: string): Promise<OrderStatus | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    return row?.status ?? null;
  }

  /** UPDATE có điều kiện `status = from`: trả true nếu chính lệnh này đổi trạng thái (an toàn khi chạy song song). */
  async updateStatus(id: string, from: OrderStatus, to: OrderStatus): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({ where: { id, status: from }, data: { status: to } });
    return count === 1;
  }

  async setPaypalOrderId(id: string, paypalOrderId: string): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { paypalOrderId } });
  }

  async findByPaypalOrderId(paypalOrderId: string): Promise<OrderForCapture | null> {
    return this.prisma.order.findUnique({ where: { paypalOrderId }, select: ORDER_FOR_CAPTURE });
  }

  async findByOrderCode(orderCode: string): Promise<OrderForCapture | null> {
    return this.prisma.order.findUnique({ where: { orderCode }, select: ORDER_FOR_CAPTURE });
  }

  /** UPDATE có điều kiện PAID -> REFUNDED trong transaction của caller; trả true nếu chính lệnh này đổi trạng thái. */
  async markRefunded(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id, status: 'PAID' },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    return count === 1;
  }

  async findById(id: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<OrderForCapture | null> {
    return client.order.findUnique({ where: { id }, select: ORDER_FOR_CAPTURE });
  }

  /**
   * UPDATE có điều kiện sang PAID trong transaction của caller: chỉ từ PENDING/CANCELLED/FAILED (máy trạng thái ở shared).
   * Trả true nếu chính lệnh này đổi trạng thái; hai lệnh song song thì lệnh sau chờ khoá dòng rồi nhận 0 dòng.
   */
  async markPaid(tx: Prisma.TransactionClient, id: string, payment: PaymentDetails): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id, status: { in: ['PENDING', 'CANCELLED', 'FAILED'] } },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paypalCaptureId: payment.captureId,
        payerEmail: payment.payerEmail,
        payerName: payment.payerName,
      },
    });
    return count === 1;
  }

  async markReviewRequired(id: string): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { reviewRequired: true } });
  }

  /** Ghi `email_sent_at` đúng một lần (UPDATE ... WHERE email_sent_at IS NULL); trả true nếu chính lệnh này ghi. */
  async setEmailSentAt(id: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({ where: { id, emailSentAt: null }, data: { emailSentAt: new Date() } });
    return count === 1;
  }

  /** Ghi đè `email_sent_at` bằng thời điểm hiện tại (admin gửi lại email thành công). */
  async overwriteEmailSentAt(id: string): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { emailSentAt: new Date() } });
  }

  /** Đơn PENDING tạo trước `cutoff`, cũ nhất trước, tối đa `limit`. */
  async findStalePending(cutoff: Date, limit: number): Promise<StalePendingOrder[]> {
    return this.prisma.order.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, orderCode: true, paypalOrderId: true },
    });
  }

  /** Các đơn PAID của cùng email (đã chữ thường) và Sheet, mới nhất trước; tối đa 20. */
  async findPaidByEmailAndSheet(email: string, sheetId: string): Promise<PaidOrderRef[]> {
    const rows = await this.prisma.order.findMany({
      where: { email: email.toLowerCase(), sheetId, status: 'PAID' },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, orderCode: true, locale: true, sheet: { select: { title: true } } },
    });
    return rows.map((row) => ({ id: row.id, orderCode: row.orderCode, locale: toLocale(row.locale), sheetTitle: row.sheet.title }));
  }

  /** Danh sách đơn cho admin: mới nhất trước, kèm tổng số khớp. Chỉ đọc. */
  async listForAdmin(where: Prisma.OrderWhereInput, page: { page: number; pageSize: number }): Promise<{ rows: AdminOrderRow[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: ADMIN_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { rows, total };
  }

  /** Chi tiết một đơn cho admin (không có chuỗi token); null nếu không tồn tại. */
  async findDetailForAdmin(id: string): Promise<AdminOrderDetailRow | null> {
    return this.prisma.order.findUnique({ where: { id }, select: ADMIN_DETAIL_SELECT });
  }
}

export type StalePendingOrder = { id: string; orderCode: string; paypalOrderId: string | null };

export type PaidOrderRef = { id: string; orderCode: string; locale: OrderLocale; sheetTitle: string };

/** Locale lưu trong DB (nullable); giá trị lạ hoặc thiếu coi như `vi`. */
export function toLocale(value: string | null | undefined): OrderLocale {
  return value === 'en' ? 'en' : 'vi';
}

export type PaymentDetails = { captureId: string | null; payerEmail: string | null; payerName: string | null };

const ORDER_FOR_CAPTURE = {
  id: true,
  orderCode: true,
  sheetId: true,
  status: true,
  amountCents: true,
  currency: true,
  items: true,
  email: true,
  locale: true,
  sheet: { select: { title: true } },
} as const;

export type OrderForCapture = Prisma.OrderGetPayload<{ select: typeof ORDER_FOR_CAPTURE }>;

const ADMIN_LIST_SELECT = {
  id: true,
  orderCode: true,
  email: true,
  items: true,
  amountCents: true,
  currency: true,
  status: true,
  reviewRequired: true,
  createdAt: true,
  sheet: { select: { id: true, title: true } },
} as const;

const ADMIN_DETAIL_SELECT = {
  ...ADMIN_LIST_SELECT,
  paypalOrderId: true,
  paypalCaptureId: true,
  payerEmail: true,
  payerName: true,
  paidAt: true,
  refundedAt: true,
  emailSentAt: true,
  // Không chọn `token.token` (secret) — chỉ trạng thái hiệu lực.
  token: { select: { id: true, expiresAt: true, maxDownloads: true, usedDownloads: true, revokedAt: true } },
} as const;

export type AdminOrderRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_LIST_SELECT }>;
export type AdminOrderDetailRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_DETAIL_SELECT }>;
