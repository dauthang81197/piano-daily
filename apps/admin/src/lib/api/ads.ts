import type { AdSlot, CreateAdSlotBody, UpdateAdSlotBody } from '@piano-daily/shared';
import { apiFetch } from './client';

const PATH = '/admin/ads';
const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Admin Ads API (Story 4.5). Ghi chỉ SUPER_ADMIN (API trả 403 cho EDITOR). */
export const adsApi = {
  list: (signal?: AbortSignal) => apiFetch<AdSlot[]>(PATH, { signal }),
  create: (body: CreateAdSlotBody) => apiFetch<AdSlot>(PATH, { method: 'POST', json: body }),
  update: (id: string, body: UpdateAdSlotBody) => apiFetch<AdSlot>(item(id), { method: 'PATCH', json: body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<AdSlot>(`${item(id)}/active`, { method: 'PATCH', json: { isActive } }),
  remove: (id: string) => apiFetch<void>(item(id), { method: 'DELETE' }),
};

export type AdsApi = typeof adsApi;
