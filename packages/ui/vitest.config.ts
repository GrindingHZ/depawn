import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
