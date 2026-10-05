import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { buildCsp } from './src/lib/csp';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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
