import { z } from 'zod';

/**
 * Danh mục mã lỗi duy nhất của API (SCREAMING_SNAKE).
 * Mọi response lỗi phải dùng một mã trong danh mục này.
 * Các story sau bổ sung mã mới tại đây (vd. UNAUTHORIZED ở Story 1.2).
 */
export const ErrorCode = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
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
