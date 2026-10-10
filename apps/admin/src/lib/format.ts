import { REPORT_TZ } from '@piano-daily/shared';

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: REPORT_TZ });

/** Ngày giờ hiển thị ở admin: luôn theo `REPORT_TZ`, bất kể múi giờ trình duyệt. */
export function formatReportDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

/** Tiền USD từ cent nguyên (không qua số thực nên không sai số làm tròn). */
export function formatUsd(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
