import { defineConfig } from 'vitest/config';

// Pure-function tests only — no DOM, no React. Keeps the suite fast.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
