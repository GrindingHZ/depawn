import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.spec.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
