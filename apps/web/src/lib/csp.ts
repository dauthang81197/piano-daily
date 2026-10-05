export interface CspEnv {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_API_URL?: string | undefined;
  NEXT_PUBLIC_MEDIA_BASE_URL?: string | undefined;
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSP (Story 2.1): PayPal, YouTube, origin API và media. Dev thêm `unsafe-eval` cho React refresh.
 * `connect-src` có origin media vì MIDI player (Story 2.8) `fetch` note-JSON từ bucket public.
 */
export function buildCsp(env: CspEnv = process.env): string {
  const isDev = env.NODE_ENV !== 'production';
  const api = originOf(env.NEXT_PUBLIC_API_URL);
  const media = originOf(env.NEXT_PUBLIC_MEDIA_BASE_URL);
  const paypal = ['https://www.paypal.com', 'https://*.paypal.com'];
  const youtube = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];
  const list = (...parts: (string | string[] | undefined)[]) => parts.flat().filter(Boolean).join(' ');

  const directives: Record<string, string> = {
    'default-src': "'self'",
    // Next nhúng script inline (không dùng nonce); giữ 'unsafe-inline' thay vì bật cacheComponents/nonce.
    'script-src': list("'self'", "'unsafe-inline'", isDev ? "'unsafe-eval'" : undefined, paypal, youtube),
    'style-src': "'self' 'unsafe-inline'",
    'img-src': list("'self'", 'data:', media),
    'media-src': list("'self'", media),
    'font-src': "'self'",
    'connect-src': list("'self'", api, media, paypal),
    // Tone.js dùng Web Worker dạng blob làm bộ hẹn giờ (thiếu thì tự lùi về setTimeout, kém ổn định ở tab nền).
    'worker-src': "'self' blob:",
    'frame-src': list(paypal, youtube),
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'self'",
  };
  return Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join('; ');
}
