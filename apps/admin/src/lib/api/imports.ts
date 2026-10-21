import type { CreateSheetImportRequest, Page, SheetImportBatch, SheetImportDetail, SheetImportItem } from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';
import { type UploadProgress, uploadMultipart } from './upload';

const PATH = '/admin/sheet-imports';
const batch = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Import Sheet hàng loạt (PDF → MIDI → Sheet, chạy nền). */
export const importsApi = {
  list: (query: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) =>
    apiFetch<Page<SheetImportBatch>>(`${PATH}${toQueryString(query)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<SheetImportDetail>(batch(id), { signal }),
  create: (body: CreateSheetImportRequest) => apiFetch<SheetImportDetail>(PATH, { method: 'POST', json: body }),
  cancel: (id: string) => apiFetch<SheetImportDetail>(`${batch(id)}/cancel`, { method: 'POST' }),
  cancelItem: (id: string, itemId: string) => apiFetch<SheetImportDetail>(`${batch(id)}/items/${encodeURIComponent(itemId)}/cancel`, { method: 'POST' }),
  retryItem: (id: string, itemId: string) => apiFetch<SheetImportDetail>(`${batch(id)}/items/${encodeURIComponent(itemId)}/retry`, { method: 'POST' }),
  remove: (id: string) => apiFetch<void>(batch(id), { method: 'DELETE' }),
};

/** Thêm một PDF vào đợt (multipart `file`) với tiến trình %. */
export function uploadImportFile(batchId: string, file: File, onProgress?: UploadProgress, signal?: AbortSignal): Promise<SheetImportItem> {
  const form = () => {
    const data = new FormData();
    data.append('file', file, file.name);
    return data;
  };
  return uploadMultipart<SheetImportItem>(`${batch(batchId)}/files`, form, onProgress, signal);
}
