import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit test: không cần DB. SWC để giữ decorator metadata (DI của Nest).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/unit/**/*.spec.ts'],
    environment: 'node',
  },
});
