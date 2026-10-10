import type { Sheet, UploadableFileType } from '@piano-daily/shared';
import { clearSession, getAccessToken, refreshSession } from '../auth/session';
import { API_URL, ApiError, NETWORK_ERROR_MESSAGE, toApiError } from './http';

const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

/** Thời gian tối đa cho một lần upload (gửi file + máy chủ xử lý PDF). */
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export const UPLOAD_TIMEOUT_MESSAGE =
  'Upload quá lâu nên đã dừng (quá 5 phút). Hãy kiểm tra kết nối mạng hoặc thử file nhỏ hơn.';

/** Tiến trình upload theo % (0–100). */
export type UploadProgress = (percent: number) => void;

interface XhrResult {
  status: number;
  body: string;
}

/** Một lần gửi multipart bằng XHR (fetch không báo tiến trình upload). */
function send(path: string, form: FormData, token: string | null, onProgress?: UploadProgress, signal?: AbortSignal) {
  return new Promise<XhrResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload bị huỷ.', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE));
    xhr.ontimeout = () => reject(new ApiError(0, 'NETWORK_ERROR', UPLOAD_TIMEOUT_MESSAGE));
    xhr.onabort = () => reject(new DOMException('Upload bị huỷ.', 'AbortError'));
    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener('abort', abort);
    xhr.send(form);
  });
}

/** Response lỗi → `ApiError` theo `errorResponseSchema` (dùng chung `toApiError` với `apiFetch`). */
function errorOf({ status, body }: XhrResult): Promise<ApiError> {
  return toApiError(new Response(body || null, { status }));
}

/**
 * Gửi multipart `POST path` bằng XHR với tiến trình %. Dùng chung phiên của `session.ts`: Bearer token trong bộ nhớ;
 * gặp 401 thì refresh MỘT lần rồi gửi lại (`buildForm` được gọi lại cho mỗi lần gửi). Lỗi HTTP -> `ApiError`.
 */
export async function uploadMultipart<T>(
  path: string,
  buildForm: () => FormData,
  onProgress?: UploadProgress,
  signal?: AbortSignal,
): Promise<T> {
  onProgress?.(0);
  let res = await send(path, buildForm(), getAccessToken(), onProgress, signal);
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new ApiError(401, 'UNAUTHORIZED', SESSION_EXPIRED_MESSAGE);
    onProgress?.(0);
    res = await send(path, buildForm(), getAccessToken(), onProgress, signal);
    if (res.status === 401) {
      clearSession('unauthenticated');
      throw await errorOf(res);
    }
  }
  if (res.status < 200 || res.status >= 300) throw await errorOf(res);
  return JSON.parse(res.body) as T;
}

/**
 * Upload file cho Sheet (`POST /admin/sheets/:id/files`, multipart `type` + `file`) với tiến trình %.
 * Lỗi HTTP → `ApiError{status, code, message}`; lỗi mạng → `NETWORK_ERROR`.
 */
export function uploadSheetFile(
  sheetId: string,
  file: File,
  onProgress?: UploadProgress,
  { type = 'PDF', signal }: { type?: UploadableFileType; signal?: AbortSignal } = {},
): Promise<Sheet> {
  const form = () => {
    const data = new FormData();
    data.append('type', type);
    data.append('file', file, file.name);
    return data;
  };
  return uploadMultipart<Sheet>(`/admin/sheets/${encodeURIComponent(sheetId)}/files`, form, onProgress, signal);
}
