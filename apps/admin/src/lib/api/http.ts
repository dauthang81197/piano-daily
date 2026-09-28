import { type ErrorCode, errorResponseSchema } from '@piano-daily/shared';

/** URL API mà trình duyệt gọi. `NEXT_PUBLIC_*` được inline lúc build (Dockerfile cần `ARG`). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

/** Mã lỗi phía client: danh mục của API cộng `NETWORK_ERROR` (không tới được máy chủ). */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

export const NETWORK_ERROR_MESSAGE = 'Không kết nối được máy chủ. Vui lòng thử lại.';

/** Lỗi thống nhất cho mọi lời gọi API từ admin. `status = 0` khi lỗi mạng. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Mã dự phòng khi body lỗi không theo định dạng chuẩn (vd. proxy trả HTML). */
function fallbackCode(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

/** Chuyển response lỗi thành `ApiError` theo `errorResponseSchema` (`{error:{code,message,details?}}`). */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(res.status, code, message, details);
  }
  return new ApiError(res.status, fallbackCode(res.status), `Máy chủ trả lỗi HTTP ${res.status}.`);
}

/** `fetch` tới API; lỗi mạng (không có response) thành `ApiError` mã `NETWORK_ERROR`. */
export async function sendRequest(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
}
