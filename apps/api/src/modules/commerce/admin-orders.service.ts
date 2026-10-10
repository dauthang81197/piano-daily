import { Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_ORDER_DOWNLOADS_MAX,
  type AdminOrderDetail,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  orderItemSchema,
  type OrderItem,
  type OrderStatus,
  type Page,
  REPORT_TZ,
} from '@piano-daily/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/client';
import { notFound } from '../catalog/catalog.helpers';
import { DownloadLogRepository } from './download-log.repository';
import { tokenStatus } from './download-token.repository';
import { OrderRepository, type AdminOrderRow } from './order.repository';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Độ lệch (ms) của múi giờ `tz` so với UTC tại thời điểm `at`. */
function zoneOffsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Thời điểm UTC của 00:00 ngày `YYYY-MM-DD` theo múi giờ `tz` (mặc định `REPORT_TZ`). */
export function dayStartUtc(date: string, tz: string = REPORT_TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let at = wall - zoneOffsetMs(wall, tz);
  at = wall - zoneOffsetMs(at, tz);
  return new Date(at);
}

/** Biên UTC `[gte, lt)` của khoảng ngày `from`..`to` (cả hai đầu) theo `REPORT_TZ`. */
export function reportRangeToUtc(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = dayStartUtc(from);
  if (to) {
    // Đầu ngày kế tiếp (tính theo lịch, không cộng 24h cứng để an toàn khi múi giờ có DST).
    const [y, m, d] = to.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
    range.lt = dayStartUtc(next.toISOString().slice(0, 10));
  }
  return range;
}

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

/** Đọc đơn hàng cho admin (Story 4.1). Chỉ đọc; không log email. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly downloadLogs: DownloadLogRepository,
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
}
