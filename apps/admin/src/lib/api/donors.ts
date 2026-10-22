import type { CreateDonorBody, Donor, UpdateDonorBody } from '@piano-daily/shared';
import { apiFetch } from './client';

const PATH = '/admin/donors';
const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Người ủng hộ (admin nhập tay), hiện ở hộp thoại "Ủng hộ" của web. */
export const donorsApi = {
  list: (signal?: AbortSignal) => apiFetch<Donor[]>(PATH, { signal }),
  create: (body: CreateDonorBody) => apiFetch<Donor>(PATH, { method: 'POST', json: body }),
  update: (id: string, body: UpdateDonorBody) => apiFetch<Donor>(item(id), { method: 'PATCH', json: body }),
  remove: (id: string) => apiFetch<void>(item(id), { method: 'DELETE' }),
};
