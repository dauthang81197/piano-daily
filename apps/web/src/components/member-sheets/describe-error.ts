import { ApiError } from '@/lib/public-api';

export type FieldErrors = Partial<Record<string, string>>;

/** Mã lỗi API → khoá chữ trong `MySheets.errors` (hoặc `message` của máy chủ khi là lỗi nghiệp vụ có lời giải thích). */
export function errorKey(err: unknown): 'generic' | 'network' | 'fileTooLarge' | 'unsupported' | 'processing' | 'forbidden' | 'notFound' {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'NETWORK_ERROR':
      return 'network';
    case 'FILE_TOO_LARGE':
      return 'fileTooLarge';
    case 'UNSUPPORTED_FILE_TYPE':
      return 'unsupported';
    case 'FILE_PROCESSING_FAILED':
      return 'processing';
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'notFound';
    default:
      return 'generic';
  }
}

/** Lỗi theo trường của API (`details: [{ path, message }]`), mỗi trường lấy thông báo đầu tiên. */
export function fieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: FieldErrors = {};
  for (const item of err.details as { path?: unknown; message?: unknown }[]) {
    if (typeof item?.path === 'string' && typeof item.message === 'string' && out[item.path] === undefined) out[item.path] = item.message;
  }
  return out;
}
