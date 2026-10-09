import { Injectable } from '@nestjs/common';
import type { OrderItem, OrderStatus } from '@piano-daily/shared';
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
}
