import type { AdminOrderDetail, AdminOrderListItem, AdminOrderListQueryInput, Page } from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';

const PATH = '/admin/orders';

/** Admin Order API (chỉ đọc). */
export const ordersApi = {
  list: (query: AdminOrderListQueryInput = {}, signal?: AbortSignal) =>
    apiFetch<Page<AdminOrderListItem>>(`${PATH}${toQueryString(query)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<AdminOrderDetail>(`${PATH}/${encodeURIComponent(id)}`, { signal }),
};

export type OrdersApi = typeof ordersApi;
