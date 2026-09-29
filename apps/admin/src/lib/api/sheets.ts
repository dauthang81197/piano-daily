import type {
  CreateSheetRequest,
  Page,
  RemovableFileType,
  Sheet,
  SheetListItem,
  SheetListQueryInput,
  UpdateSheetRequest,
} from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';

const PATH = '/admin/sheets';
const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** API Sheet của admin (Story 1.5: list, get, create, update; Story 1.7: gỡ file — chưa có publish/xoá Sheet). */
export const sheetsApi = {
  list: (query: SheetListQueryInput = {}, signal?: AbortSignal) =>
    apiFetch<Page<SheetListItem>>(`${PATH}${toQueryString(query)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<Sheet>(item(id), { signal }),
  create: (body: CreateSheetRequest) => apiFetch<Sheet>(PATH, { method: 'POST', json: body }),
  update: (id: string, body: UpdateSheetRequest) => apiFetch<Sheet>(item(id), { method: 'PATCH', json: body }),
  /** `DELETE /admin/sheets/:id/files/:type` — đánh `superseded_at`, không trả body (204). */
  removeFile: (id: string, type: RemovableFileType) => apiFetch<void>(`${item(id)}/files/${type}`, { method: 'DELETE' }),
};

export type SheetsApi = typeof sheetsApi;
