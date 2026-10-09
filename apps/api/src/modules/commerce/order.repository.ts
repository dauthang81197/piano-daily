import { Injectable } from '@nestjs/common';
import type { OrderItem, OrderStatus } from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NewOrder = {
  orderCode: string;
  sheetId: string;
  email: string;
  items: OrderItem[];
  amountCents: number;
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
} as const;

export type OrderForCapture = Prisma.OrderGetPayload<{ select: typeof ORDER_FOR_CAPTURE }>;
