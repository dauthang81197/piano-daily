import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Build standalone để image Docker chỉ chứa phần cần chạy.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  // Không bật cacheComponents (ràng buộc Story 1.1).
};

export default nextConfig;
