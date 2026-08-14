import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    environment: 'jsdom',
    // Testing-library auto-cleanup hooks into the global afterEach.
    globals: true,
    passWithNoTests: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
