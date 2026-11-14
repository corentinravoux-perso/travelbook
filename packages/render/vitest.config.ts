import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'render',
    include: ['src/**/*.test.{ts,tsx}'],
    // SpreadView is a DOM component: its structure tests run under jsdom.
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
