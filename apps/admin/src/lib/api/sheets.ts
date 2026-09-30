import type {
  CreateSheetRequest,
  Page,
  RemovableFileType,
  Sheet,
  SheetListItem,
  SheetListQueryInput,
  UpdateSheetRequest,
  SheetStatus,
} from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';

const PATH = '/admin/sheets';
const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Admin Sheet API, including dedicated lifecycle operations. */
export const sheetsApi = {
  list: (query: SheetListQueryInput = {}, signal?: AbortSignal) =>
    apiFetch<Page<SheetListItem>>(`${PATH}${toQueryString(query)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<Sheet>(item(id), { signal }),
  create: (body: CreateSheetRequest) => apiFetch<Sheet>(PATH, { method: 'POST', json: body }),
  update: (id: string, body: UpdateSheetRequest) => apiFetch<Sheet>(item(id), { method: 'PATCH', json: body }),
  /** `DELETE /admin/sheets/:id/files/:type` — đánh `superseded_at`, không trả body (204). */
  removeFile: (id: string, type: RemovableFileType) => apiFetch<void>(`${item(id)}/files/${type}`, { method: 'DELETE' }),
  setStatus: (id: string, status: SheetStatus) => apiFetch<Sheet>(`${item(id)}/status`, { method: 'PATCH', json: { status } }),
  setHot: (id: string, isHot: boolean) => apiFetch<Sheet>(`${item(id)}/hot`, { method: 'PATCH', json: { isHot } }),
  remove: (id: string) => apiFetch<Sheet | { deleted: true }>(item(id), { method: 'DELETE' }),
};

export type SheetsApi = typeof sheetsApi;
