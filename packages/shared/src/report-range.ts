import { REPORT_TZ } from './order';

const DAY_MS = 24 * 3_600_000;

/** Tách `YYYY-MM-DD` (đã được kiểm định dạng) thành [năm, tháng, ngày]. */
function ymd(date: string): [number, number, number] {
  const [y = 0, m = 0, d = 0] = date.split('-').map(Number);
  return [y, m, d];
}

/** Độ lệch (ms) của múi giờ `tz` so với UTC tại thời điểm `at`. */
function zoneOffsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Thời điểm UTC của 00:00 ngày `YYYY-MM-DD` theo múi giờ `tz` (mặc định `REPORT_TZ`). */
export function dayStartUtc(date: string, tz: string = REPORT_TZ): Date {
  const [y, m, d] = ymd(date);
  const wall = Date.UTC(y, m - 1, d);
  let at = wall - zoneOffsetMs(wall, tz);
  at = wall - zoneOffsetMs(at, tz);
  return new Date(at);
}

/** Biên UTC `[gte, lt)` của khoảng ngày `from`..`to` (cả hai đầu) theo `REPORT_TZ`. */
export function reportRangeToUtc(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = dayStartUtc(from);
  if (to) {
    // Đầu ngày kế tiếp (tính theo lịch, không cộng 24h cứng để an toàn khi múi giờ có DST).
    const [y, m, d] = ymd(to);
    const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
    range.lt = dayStartUtc(next.toISOString().slice(0, 10));
  }
  return range;
}

/** Cộng `days` ngày lịch vào ngày `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày lịch của khoảng `from`..`to` (gồm cả hai đầu). */
export function daysInRange(from: string, to: string): number {
  const [fy, fm, fd] = ymd(from);
  const [ty, tm, td] = ymd(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS) + 1;
}

/** Ngày hiện tại (`YYYY-MM-DD`) theo `REPORT_TZ`. */
export function todayInReportTz(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
