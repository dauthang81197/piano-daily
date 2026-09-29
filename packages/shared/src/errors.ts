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
