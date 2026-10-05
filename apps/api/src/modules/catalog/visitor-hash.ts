import { createHash } from 'node:crypto';

/** UA dài hơn mức này bị cắt trước khi băm (chống input khổng lồ; không ảnh hưởng độ phân biệt thực tế). */
export const USER_AGENT_MAX_LENGTH = 256;

/** Ký tự phân tách cố định: tránh `("a", "bc")` và `("ab", "c")` ra cùng hash. */
const SEPARATOR = '\u0000';

/**
 * `visitor_hash = sha256(ip + ua + VIEW_SALT)` dạng hex 64 ký tự (AD-11). Không lưu IP/UA thô ở bất kỳ đâu:
 * chỉ hash này được ghi vào `sheet_view_dedupe`.
 */
export function visitorHash(ip: string, userAgent: string | undefined, salt: string): string {
  const ua = (userAgent ?? '').slice(0, USER_AGENT_MAX_LENGTH);
  return createHash('sha256').update([ip, ua, salt].join(SEPARATOR)).digest('hex');
}

/** Mốc giờ UTC (đầu giờ) chứa `now`: khoá thời gian của dedupe. */
export function hourBucket(now: Date): Date {
  const bucket = new Date(now);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}
