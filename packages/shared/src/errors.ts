import { z } from 'zod';

/**
 * Danh mục mã lỗi duy nhất của API (SCREAMING_SNAKE).
 * Mọi response lỗi phải dùng một mã trong danh mục này.
 * Các story sau bổ sung mã mới tại đây.
 */
export const ErrorCode = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  /** Xoá bản ghi đang được bản ghi khác tham chiếu (FK RESTRICT). */
  RESOURCE_IN_USE: 'RESOURCE_IN_USE',
  /** File upload vượt dung lượng cho phép (413). */
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  /** Nội dung file không đúng định dạng yêu cầu (415, kiểm magic bytes). */
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  /** File đúng định dạng nhưng không xử lý được (hỏng, quá nhiều trang…) (422). */
  FILE_PROCESSING_FAILED: 'FILE_PROCESSING_FAILED',
  /** Giá client gửi lệch báo giá hiện tại (409, `details` = báo giá mới). */
  PRICE_CHANGED: 'PRICE_CHANGED',
  /** Thanh toán đang tắt (`payments_enabled=false`) (403). */
  PAYMENTS_DISABLED: 'PAYMENTS_DISABLED',
  /** PayPal từ chối khoản thanh toán (402, `message` là lý do hiển thị được). */
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  /** Link tải đã quá hạn (410). */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Link tải đã dùng hết lượt (410). */
  TOKEN_EXHAUSTED: 'TOKEN_EXHAUSTED',
  /** Link tải bị vô hiệu: đơn không còn PAID hoặc token bị thu hồi (410). */
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  /** Cùng email đã mua đủ các định dạng này và link tải còn hiệu lực: không tạo đơn, link được gửi lại qua email (409). */
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  /** Số Sheet khớp tiêu chí lúc áp dụng giá hàng loạt khác số đã xem trước (409, `details.count` = số mới). */
  BULK_COUNT_CHANGED: 'BULK_COUNT_CHANGED',
  /** Thao tác admin chỉ áp dụng cho đơn PAID (gửi lại email, gia hạn token) (409). */
  ORDER_NOT_PAID: 'ORDER_NOT_PAID',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.enum(ErrorCode);

/** Định dạng lỗi chuẩn: `{ error: { code, message, details? } }`. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
