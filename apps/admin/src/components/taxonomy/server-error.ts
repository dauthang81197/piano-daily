import { isApiError } from '@/lib/api/client';

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';

/**
 * Chuyển lỗi API thành thông báo cho form:
 * - `VALIDATION_FAILED` có `details` trỏ tới trường của form -> gọi `setFieldError` (hiện ngay dưới trường), trả `null`;
 * - còn lại (409 `RESOURCE_IN_USE`, 404, lỗi mạng…) -> thông điệp cho `FormError` đầu form.
 */
export function applyServerError<F extends string>(
  err: unknown,
  fields: readonly F[],
  setFieldError: (field: F, message: string) => void,
): string | null {
  if (!isApiError(err)) return GENERIC_ERROR;
  if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details)) {
    let unmapped = false;
    for (const detail of err.details as { path?: unknown; message?: unknown }[]) {
      const field = fields.find((f) => f === detail.path);
      if (field && typeof detail.message === 'string') setFieldError(field, detail.message);
      else unmapped = true;
    }
    return unmapped ? 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.' : null;
  }
  if (err.code === 'NOT_FOUND') return 'Bản ghi không còn tồn tại (có thể đã bị xoá). Hãy đóng hộp thoại và tải lại danh sách.';
  if (err.code === 'INTERNAL_ERROR') return GENERIC_ERROR;
  // Các mã còn lại (RESOURCE_IN_USE, VALIDATION_FAILED không có details, FORBIDDEN, TOO_MANY_REQUESTS,
  // NETWORK_ERROR, 401…) mang thông điệp tiếng Việt dành cho người dùng.
  return err.message;
}

/** Thông báo khi tải danh sách thất bại. */
export function loadErrorMessage(err: unknown): string {
  if (isApiError(err) && (err.code === 'NETWORK_ERROR' || err.status === 401)) return err.message;
  return 'Không tải được danh sách. Vui lòng thử lại.';
}
