import { createHash } from 'node:crypto';

/** UA dài hơn mức này bị cắt trước khi lưu (chống input khổng lồ). */
export const USER_AGENT_MAX_LENGTH = 256;

/** `ip_hash = sha256(ip + VIEW_SALT)` dạng hex 64 ký tự (AD-20). Không lưu IP thô ở bất kỳ đâu. */
export function ipHash(ip: string, salt: string): string {
  return createHash('sha256').update(`${ip}\u0000${salt}`).digest('hex');
}
