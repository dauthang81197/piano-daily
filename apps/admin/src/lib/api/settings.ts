import type { AdminSettings, UpdateSettingsBody } from '@piano-daily/shared';
import { apiFetch } from './client';
import { uploadMultipart } from './upload';

const PATH = '/admin/settings';

/** Admin Settings API (Story 4.4). */
export const settingsApi = {
  get: (signal?: AbortSignal) => apiFetch<AdminSettings>(PATH, { signal }),
  /** `PUT /admin/settings` — body đủ trường; trả cài đặt đã lưu. */
  update: (body: UpdateSettingsBody) => apiFetch<AdminSettings>(PATH, { method: 'PUT', json: body }),
  /** `POST /admin/settings/logo` — multipart `file` (PNG/JPEG/WebP ≤ 2 MB); trả cài đặt đã lưu. */
  uploadLogo: (file: File) =>
    uploadMultipart<AdminSettings>(`${PATH}/logo`, () => {
      const form = new FormData();
      form.append('file', file, file.name);
      return form;
    }),
};

export type SettingsApi = typeof settingsApi;
