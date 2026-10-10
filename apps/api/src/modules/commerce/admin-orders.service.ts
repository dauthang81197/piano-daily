import { Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_ORDER_DOWNLOADS_MAX,
  type AdminOrderDetail,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  type ExtendTokenBody,
  orderItemSchema,
  type OrderItem,
  type OrderStatus,
  type Page,
  reportRangeToUtc,
} from '@piano-daily/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/client';
import { notFound } from '../catalog/catalog.helpers';
import { DownloadLogRepository } from './download-log.repository';
import { tokenStatus } from './download-token.repository';
import { OrderRepository, type AdminOrderRow } from './order.repository';
import { OrderService } from './order.service';
import { TokenService } from './token.service';

const logger = new Logger('AdminOrdersService');
const itemsSchema = z.array(orderItemSchema);
const parseItems = (value: unknown, orderCode?: string): OrderItem[] => {
  const parsed = itemsSchema.safeParse(value);
  if (!parsed.success && orderCode) logger.warn(`Đơn ${orderCode} có items snapshot không hợp lệ.`);
  return parsed.success ? parsed.data : [];
};

function toListItem(row: AdminOrderRow): AdminOrderListItem {
  return {
    id: row.id,
    orderCode: row.orderCode,
    email: row.email,
    sheet: row.sheet,
    fileTypes: parseItems(row.items, row.orderCode).map((item) => item.fileType),
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status as OrderStatus,
    reviewRequired: row.reviewRequired,
    createdAt: row.createdAt.toISOString(),
  };
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** Đọc đơn hàng (Story 4.1) và thao tác gửi lại email / gia hạn token (Story 4.2) cho admin. Không log email. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly downloadLogs: DownloadLogRepository,
    private readonly orderService: OrderService,
    private readonly tokenService: TokenService,
  ) {}

  async list(query: AdminOrderListQuery): Promise<Page<AdminOrderListItem>> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reviewRequired !== undefined) where.reviewRequired = query.reviewRequired;
    if (query.email) where.email = { contains: query.email, mode: 'insensitive' };
    const range = reportRangeToUtc(query.from, query.to);
    if (range.gte || range.lt) where.createdAt = range;
    const { rows, total } = await this.orders.listForAdmin(where, query);
    return { items: rows.map(toListItem), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<AdminOrderDetail> {
    const row = await this.orders.findDetailForAdmin(id);
    if (!row) throw notFound('Không tìm thấy đơn hàng.');
    const token = row.token;
    const logs = token ? await this.downloadLogs.listByToken(token.id, ADMIN_ORDER_DOWNLOADS_MAX) : [];
    return {
      ...toListItem(row),
      items: parseItems(row.items, row.orderCode),
      paypalOrderId: row.paypalOrderId,
      paypalCaptureId: row.paypalCaptureId,
      payerEmail: row.payerEmail,
      payerName: row.payerName,
      paidAt: iso(row.paidAt),
      refundedAt: iso(row.refundedAt),
      emailSentAt: iso(row.emailSentAt),
      token: token
        ? {
            status: tokenStatus({ ...token, orderStatus: row.status as OrderStatus }),
            expiresAt: token.expiresAt.toISOString(),
            usedDownloads: token.usedDownloads,
            maxDownloads: token.maxDownloads,
            revokedAt: iso(token.revokedAt),
          }
        : null,
      downloads: logs.map((log) => ({ id: log.id, fileType: log.fileType, ua: log.ua, createdAt: log.createdAt.toISOString() })),
    };
  }

  /** Gửi lại email link tải rồi trả chi tiết đơn đã làm mới. */
  async resendEmail(id: string): Promise<AdminOrderDetail> {
    await this.orderService.resendDownloadEmail(id);
    return this.get(id);
  }

  /** Hoàn tiền toàn phần qua PayPal rồi trả chi tiết đơn đã làm mới. */
  async refund(id: string): Promise<AdminOrderDetail> {
    await this.orderService.adminRefund(id);
    return this.get(id);
  }

  /** Gia hạn token (qua `TokenService`) rồi trả chi tiết đơn đã làm mới. */
  async extendToken(id: string, body: ExtendTokenBody): Promise<AdminOrderDetail> {
    await this.tokenService.extend(id, body);
    return this.get(id);
  }
}
