import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, pageSchema } from './catalog';
import { PURCHASABLE_FILE_TYPES, priceCentsSchema } from './pricing';

/** Trạng thái đơn hàng (Story 3.3); phải trùng enum `OrderStatus` của Prisma (có test kiểm tra). */
export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const orderStatusSchema = z.enum(OrderStatus);

/**
 * Máy trạng thái Order: chỉ `commerce.OrderService` được đổi `Order.status` và chỉ theo bảng này.
 * PENDING→PAID|FAILED|CANCELLED; CANCELLED|FAILED→PAID (thanh toán đến muộn); PAID→REFUNDED.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [OrderStatus.PAID, OrderStatus.FAILED, OrderStatus.CANCELLED],
  CANCELLED: [OrderStatus.PAID],
  FAILED: [OrderStatus.PAID],
  PAID: [OrderStatus.REFUNDED],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Mã đơn hiển thị: `PD-` + 6 ký tự base32 (Crockford, không có I, L, O, U). */
export const ORDER_CODE_PATTERN = /^PD-[0-9A-HJKMNP-TV-Z]{6}$/;

/** Một dòng snapshot của đơn: type đã resolve kèm giá lúc mua (bundle được tách ra từng type). */
export const orderItemSchema = z.object({
  fileType: z.enum(PURCHASABLE_FILE_TYPES),
  priceCents: priceCentsSchema,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/** Locale lưu cùng Order (Story 3.7); khớp CHECK của cột `orders.locale`. */
export const ORDER_LOCALES = ['vi', 'en'] as const;
export type OrderLocale = (typeof ORDER_LOCALES)[number];

/**
 * Body `POST /payments/paypal/create-order`. Đúng một trong `fileTypes` / `bundle: true`.
 * `email` ở đây chỉ kiểm là chuỗi: định dạng được kiểm sau bước `payments_enabled` (xem `orderEmailSchema`).
 */
export const createOrderRequestSchema = z
  .strictObject({
    sheetId: z.string().min(1),
    fileTypes: z.array(z.enum(PURCHASABLE_FILE_TYPES)).min(1).max(PURCHASABLE_FILE_TYPES.length).optional(),
    bundle: z.literal(true).optional(),
    email: z.string().max(320),
    expectedTotalCents: z.number().int().min(0),
    /** Ngôn ngữ của người mua (email link tải gửi theo locale này); thiếu thì mặc định `vi`. */
    locale: z.enum(ORDER_LOCALES).optional(),
  })
  .refine((v) => (v.fileTypes !== undefined) !== (v.bundle !== undefined), {
    error: 'Chỉ gửi một trong fileTypes hoặc bundle.',
    path: ['fileTypes'],
  });
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

/** Email người mua: cắt khoảng trắng, về chữ thường, đúng định dạng. */
export const orderEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Email không hợp lệ.' }));

export const createOrderResponseSchema = z.object({
  orderCode: z.string(),
  paypalOrderId: z.string(),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/** Body `POST /payments/paypal/capture-order` (Story 3.4). */
export const captureOrderRequestSchema = z.strictObject({
  paypalOrderId: z.string().min(1).max(64),
});
export type CaptureOrderRequest = z.infer<typeof captureOrderRequestSchema>;

/** File người mua được tải: chỉ loại và tên hiển thị, không bao giờ có `storage_key`. */
export const capturedFileSchema = z.object({
  fileType: z.enum(PURCHASABLE_FILE_TYPES),
  name: z.string(),
});
export type CapturedFile = z.infer<typeof capturedFileSchema>;

export const captureOrderResponseSchema = z.object({
  orderCode: z.string(),
  token: z.string(),
  files: z.array(capturedFileSchema),
});
export type CaptureOrderResponse = z.infer<typeof captureOrderResponseSchema>;

/** Trạng thái hiệu lực của link tải (`GET /downloads/:token`). */
export const DOWNLOAD_STATUSES = ['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED'] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

/** Response `GET /downloads/:token` (Story 3.5): không có `storage_key` hay email. */
export const downloadStatusResponseSchema = z.object({
  sheetTitle: z.string(),
  files: z.array(capturedFileSchema),
  remainingDownloads: z.number().int().min(0),
  expiresAt: z.string(),
  status: z.enum(DOWNLOAD_STATUSES),
});
export type DownloadStatusResponse = z.infer<typeof downloadStatusResponseSchema>;

// ── Admin: danh sách và chi tiết đơn (Story 4.1) ─────────────

/** Múi giờ báo cáo: mọi ngày ở admin và ranh giới ngày của bộ lọc/báo cáo tính theo múi giờ này. */
export const REPORT_TZ = 'Asia/Ho_Chi_Minh';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateMessage = 'Ngày phải có dạng YYYY-MM-DD.';

/** Chuỗi `YYYY-MM-DD` là ngày lịch có thật (không nhận 2026-02-30). */
export function isValidDateOnly(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const dateOnlySchema = z.string().refine(isValidDateOnly, { error: dateMessage });
const pageMessage = 'Trang phải là số nguyên từ 1.';
const pageSizeMessage = `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.`;

/** Query `GET /admin/orders`. `from`/`to` là ngày theo `REPORT_TZ` (gồm cả hai đầu). */
export const adminOrderListQuerySchema = z
  .object({
    status: orderStatusSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    email: z
      .string()
      .trim()
      .max(254, { error: 'Email tối đa 254 ký tự.' })
      .optional()
      .transform((value) => value || undefined),
    reviewRequired: z
      .enum(['true', 'false'], { error: 'reviewRequired phải là true hoặc false.' })
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    page: z.coerce
      .number({ error: pageMessage })
      .int({ error: pageMessage })
      .min(1, { error: pageMessage })
      .max(1_000_000, { error: 'Trang quá lớn.' })
      .default(1),
    pageSize: z.coerce
      .number({ error: pageSizeMessage })
      .int({ error: pageSizeMessage })
      .min(1, { error: pageSizeMessage })
      .max(PAGE_SIZE_MAX, { error: pageSizeMessage })
      .default(PAGE_SIZE_DEFAULT),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', path: ['from'] });
export type AdminOrderListQueryInput = z.input<typeof adminOrderListQuerySchema>;
export type AdminOrderListQuery = z.output<typeof adminOrderListQuerySchema>;

/** Một dòng danh sách đơn: không có secret, token hay payload PayPal. */
export const adminOrderListItemSchema = z.object({
  id: z.string(),
  orderCode: z.string(),
  email: z.string(),
  sheet: z.object({ id: z.string(), title: z.string() }),
  fileTypes: z.array(z.enum(PURCHASABLE_FILE_TYPES)),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  status: orderStatusSchema,
  reviewRequired: z.boolean(),
  createdAt: z.string(),
});
export type AdminOrderListItem = z.infer<typeof adminOrderListItemSchema>;
export const adminOrderListResponseSchema = pageSchema(adminOrderListItemSchema);

/** Trạng thái token của đơn: không có chuỗi token. */
export const adminOrderTokenSchema = z.object({
  status: z.enum(DOWNLOAD_STATUSES),
  expiresAt: z.string(),
  usedDownloads: z.number().int().nonnegative(),
  maxDownloads: z.number().int().nonnegative(),
  revokedAt: z.string().nullable(),
});
export type AdminOrderToken = z.infer<typeof adminOrderTokenSchema>;

/** Một lượt tải: thời điểm, loại file, UA. Không có `ipHash`. */
export const adminOrderDownloadSchema = z.object({
  id: z.string(),
  fileType: z.string(),
  ua: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminOrderDownload = z.infer<typeof adminOrderDownloadSchema>;

/** Số dòng lịch sử tải tối đa trong chi tiết đơn. */
export const ADMIN_ORDER_DOWNLOADS_MAX = 100;

export const adminOrderDetailSchema = adminOrderListItemSchema.extend({
  items: z.array(orderItemSchema),
  paypalOrderId: z.string().nullable(),
  paypalCaptureId: z.string().nullable(),
  payerEmail: z.string().nullable(),
  payerName: z.string().nullable(),
  paidAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
  emailSentAt: z.string().nullable(),
  token: adminOrderTokenSchema.nullable(),
  downloads: z.array(adminOrderDownloadSchema),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

// ── Admin: gia hạn token (Story 4.2) ─────────────────────────

/** Giới hạn một lần gia hạn. */
export const EXTEND_TOKEN_DAYS_MAX = 3650;
export const EXTEND_TOKEN_DOWNLOADS_MAX = 1000;

/** Body `POST /admin/orders/:id/extend-token`: ít nhất một trong hai, đều là số nguyên dương. */
export const extendTokenBodySchema = z
  .strictObject({
    addDays: z
      .number({ error: 'Số ngày phải là số nguyên dương.' })
      .int({ error: 'Số ngày phải là số nguyên dương.' })
      .min(1, { error: 'Số ngày phải là số nguyên dương.' })
      .max(EXTEND_TOKEN_DAYS_MAX, { error: `Số ngày tối đa ${EXTEND_TOKEN_DAYS_MAX}.` })
      .optional(),
    addDownloads: z
      .number({ error: 'Số lượt phải là số nguyên dương.' })
      .int({ error: 'Số lượt phải là số nguyên dương.' })
      .min(1, { error: 'Số lượt phải là số nguyên dương.' })
      .max(EXTEND_TOKEN_DOWNLOADS_MAX, { error: `Số lượt tối đa ${EXTEND_TOKEN_DOWNLOADS_MAX}.` })
      .optional(),
  })
  .refine((v) => v.addDays !== undefined || v.addDownloads !== undefined, {
    error: 'Nhập số ngày hoặc số lượt cần thêm.',
    path: ['addDays'],
  });
export type ExtendTokenBody = z.infer<typeof extendTokenBodySchema>;
