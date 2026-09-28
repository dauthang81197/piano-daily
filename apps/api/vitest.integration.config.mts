import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration test với Postgres thật (service `postgres-test`, profile `test`).
// Vitest (esbuild) không emit decorator metadata -> bắt buộc dùng unplugin-swc, nếu không DI của Nest hỏng.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
