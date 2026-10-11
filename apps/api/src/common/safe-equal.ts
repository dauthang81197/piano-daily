import { createHash, timingSafeEqual } from 'node:crypto';

/** So sánh timing-safe (hash trước để độ dài khác nhau không làm lộ thông tin / ném lỗi). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
