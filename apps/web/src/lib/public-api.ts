import {
  type CaptureOrderResponse,
  type CreateOrderRequest,
  type CreateOrderResponse,
  captureOrderResponseSchema,
  createOrderResponseSchema,
  type ErrorCode,
  errorResponseSchema,
  type Quote,
  quoteSchema,
} from '@piano-daily/shared';
import type { z } from 'zod';
import { publicApiUrl } from '@/lib/public-env';

/** Mã lỗi phía client: danh mục của API cộng `NETWORK_ERROR` (không tới được máy chủ hoặc thiếu cấu hình). */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

/** Lỗi thống nhất cho mọi lời gọi API công khai từ trình duyệt. `status = 0` khi lỗi mạng. */
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

function fallbackCode(status: number): ErrorCode {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

/** Chuyển response lỗi thành `ApiError` theo `{error:{code,message,details?}}`. */
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

const NETWORK_MESSAGE = 'Không kết nối được máy chủ.';

async function request<S extends z.ZodType>(path: string, schema: S, init: RequestInit = {}): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(`${publicApiUrl()}${path}`, { ...init, credentials: 'omit', cache: 'no-store' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }
  if (!res.ok) throw await toApiError(res);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(res.status, 'INTERNAL_ERROR', 'Phản hồi của máy chủ không hợp lệ.');
  return parsed.data;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Báo giá hiện tại, luôn `no-store` (AD-17); kèm `paymentsEnabled`. */
export function fetchQuote(sheetId: string, signal?: AbortSignal): Promise<Quote> {
  return request(`/sheets/${encodeURIComponent(sheetId)}/quote`, quoteSchema, signal ? { signal } : {});
}

export function createPaypalOrder(body: CreateOrderRequest): Promise<CreateOrderResponse> {
  return request('/payments/paypal/create-order', createOrderResponseSchema, json(body));
}

export function capturePaypalOrder(paypalOrderId: string): Promise<CaptureOrderResponse> {
  return request('/payments/paypal/capture-order', captureOrderResponseSchema, json({ paypalOrderId }));
}
