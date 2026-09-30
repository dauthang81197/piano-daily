import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** CSP (Story 2.1): PayPal, YouTube, origin API và media. Dev thêm `unsafe-eval` cho React refresh. */
function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const api = originOf(process.env.NEXT_PUBLIC_API_URL);
  const media = originOf(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
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
    'connect-src': list("'self'", api, paypal),
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

const nextConfig: NextConfig = {
  // Build standalone để image Docker chỉ chứa phần cần chạy.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  // Không bật cacheComponents (ràng buộc Story 1.1).
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: buildCsp() }] }];
  },
};

export default withNextIntl(nextConfig);
