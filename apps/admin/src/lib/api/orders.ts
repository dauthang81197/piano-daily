import type { AdminOrderDetail, AdminOrderListItem, AdminOrderListQueryInput, ExtendTokenBody, Page } from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';

const PATH = '/admin/orders';

const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Admin Order API: xem đơn, gửi lại email, gia hạn token. */
export const ordersApi = {
  list: (query: AdminOrderListQueryInput = {}, signal?: AbortSignal) =>
    apiFetch<Page<AdminOrderListItem>>(`${PATH}${toQueryString(query)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<AdminOrderDetail>(item(id), { signal }),
  /** `POST /admin/orders/:id/resend-email` — trả chi tiết đơn đã làm mới. */
  resendEmail: (id: string) => apiFetch<AdminOrderDetail>(`${item(id)}/resend-email`, { method: 'POST' }),
  /** `POST /admin/orders/:id/refund` — hoàn tiền toàn phần qua PayPal, trả chi tiết đơn đã làm mới. */
  refund: (id: string) => apiFetch<AdminOrderDetail>(`${item(id)}/refund`, { method: 'POST' }),
  /** `POST /admin/orders/:id/extend-token` — thêm ngày và/hoặc lượt tải. */
  extendToken: (id: string, body: ExtendTokenBody) => apiFetch<AdminOrderDetail>(`${item(id)}/extend-token`, { method: 'POST', json: body }),
};

export type OrdersApi = typeof ordersApi;
