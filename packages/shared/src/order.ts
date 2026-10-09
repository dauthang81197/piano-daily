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
