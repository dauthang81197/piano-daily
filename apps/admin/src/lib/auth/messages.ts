import { isApiError } from '../api/http';

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';
const NETWORK_ERROR = 'Không kết nối được máy chủ. Vui lòng thử lại.';

/** Thông báo lỗi đăng nhập (tiếng Việt, trang trọng, nói rõ cần làm gì tiếp). */
export function loginErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Email hoặc mật khẩu không đúng.';
    if (err.status === 429 || err.code === 'TOO_MANY_REQUESTS')
      return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi khoảng một phút rồi thử lại.';
    if (err.code === 'NETWORK_ERROR') return NETWORK_ERROR;
    if (err.code === 'VALIDATION_FAILED') return 'Thông tin đăng nhập chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  return GENERIC_ERROR;
}

/** Thông báo lỗi đổi mật khẩu. */
export function changePasswordErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Mật khẩu hiện tại không đúng.';
    if (err.status === 429 || err.code === 'TOO_MANY_REQUESTS')
      return 'Bạn đã thử quá nhiều lần. Vui lòng đợi khoảng một phút rồi thử lại.';
    if (err.code === 'NETWORK_ERROR') return NETWORK_ERROR;
    if (err.code === 'VALIDATION_FAILED') return 'Mật khẩu mới chưa hợp lệ. Vui lòng kiểm tra lại.';
    if (err.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  return GENERIC_ERROR;
}
