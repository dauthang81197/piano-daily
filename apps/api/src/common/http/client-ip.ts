import { isIP } from 'node:net';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | undefined } | undefined;
};

/**
 * Nguồn IP khách DUY NHẤT của API (AD-18): `CF-Connecting-IP` do Cloudflare đặt nếu có và hợp lệ,
 * ngược lại (chạy local) là IP của socket. Không dùng `X-Forwarded-For` hay `req.ip`.
 */
export function getClientIp(req: RequestLike): string {
  const header = req.headers['cf-connecting-ip'];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  if (value && isIP(value) !== 0) return value;
  return req.socket?.remoteAddress ?? 'unknown';
}
