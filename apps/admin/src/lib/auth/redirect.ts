import type { SessionEndReason } from './session';

/** Tham số `reason` trên `/login` khi vừa đổi mật khẩu. */
export const PASSWORD_CHANGED_REASON = 'password-changed';

/**
 * Chỉ chấp nhận path nội bộ: bắt đầu bằng `/`, không phải `//` hay `/\` (URL giao thức tương đối -> open redirect),
 * không chứa ký tự điều khiển, và không quay lại chính `/login`.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return fallback;
  return next;
}

/** URL trang login ứng với lý do phiên kết thúc. `currentPath` là route đang mở (để quay lại sau khi đăng nhập). */
export function loginUrlFor(reason: SessionEndReason, currentPath: string): string {
  if (reason === 'password-changed') return `/login?reason=${PASSWORD_CHANGED_REASON}`;
  if (reason === 'logout') return '/login';
  const next = safeNextPath(currentPath);
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}
