import type { PublicSheetDetail } from '@piano-daily/shared';
import { publicApiUrl } from '@/lib/public-env';

/**
 * Hàm dùng chung cho server component (`sheet-detail.tsx`) và client component (`download-buttons.tsx`). Phải nằm ngoài file
 * `'use client'`: hàm export từ file client bị React Server Components đổi thành tham chiếu và KHÔNG gọi được ở server
 * (trang chi tiết sheet sẽ lỗi 500 ở production dù test vitest vẫn xanh).
 */
export type DownloadType = PublicSheetDetail['downloadTypes'][number];

export const PATH: Record<DownloadType, string> = { PDF: 'pdf', MIDI: 'midi', MP3: 'mp3' };

/** Base URL API cho trình duyệt; thiếu cấu hình thì không có nút (không ném, như `ViewBeacon`). */
export function apiBase(): string | null {
  try {
    return publicApiUrl();
  } catch {
    return null;
  }
}

/** Định dạng có thật của Sheet theo thứ tự PDF → MIDI → MP3 (tải ngay nếu free, mua qua modal nếu không); rỗng khi đang preview. */
export function availableDownloads(sheet: PublicSheetDetail, enabled: boolean): DownloadType[] {
  return enabled ? sheet.downloadTypes : [];
}
