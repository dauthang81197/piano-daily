import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // next-intl import `next/server` không đuôi: phải để Vite xử lý (không externalize) thì Node mới resolve được.
    server: { deps: { inline: ['next-intl'] } },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
