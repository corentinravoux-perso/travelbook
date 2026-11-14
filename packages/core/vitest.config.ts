import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/ops/test-helpers.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { statements: 90, lines: 90 },
    },
  },
});
