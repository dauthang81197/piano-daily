import type { PreviewTokenResponse } from '@piano-daily/shared';
import { apiFetch } from './client';

/** Admin xin preview token (hạn 10 phút, gắn `sheetId`) để xem Sheet Draft như người dùng (AD-19). */
export const previewApi = {
  issue: (sheetId: string) => apiFetch<PreviewTokenResponse>('/admin/preview-tokens', { method: 'POST', json: { sheetId } }),
};
