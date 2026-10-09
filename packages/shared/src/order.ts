import { z } from 'zod';
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
