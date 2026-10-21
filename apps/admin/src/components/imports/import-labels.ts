import type { ImportBatchStatus, ImportItemStatus, ImportItemStep } from '@piano-daily/shared';

export const BATCH_STATUS_LABELS: Record<ImportBatchStatus, string> = {
  EMPTY: 'Chưa có file',
  RUNNING: 'Đang chạy',
  DONE: 'Hoàn tất',
  DONE_WITH_ERRORS: 'Xong, có file lỗi',
  CANCELLED: 'Đã huỷ',
};

export const ITEM_STATUS_LABELS: Record<ImportItemStatus, string> = {
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  DONE: 'Xong',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã huỷ',
};

export const ITEM_STEP_LABELS: Record<ImportItemStep, string> = {
  CONVERTING: 'Đang chuyển PDF sang MIDI',
  CREATING: 'Đang tạo Sheet',
  ATTACHING: 'Đang đính PDF và MIDI',
};

/** Màu chữ + nền theo trạng thái (kèm chữ nên không chỉ dựa vào màu). */
export const ITEM_STATUS_CLASS: Record<ImportItemStatus, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  PROCESSING: 'bg-secondary text-secondary-foreground',
  DONE: 'bg-primary/10 text-primary',
  FAILED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
