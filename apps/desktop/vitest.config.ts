import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'desktop',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Main-process modules run in plain Node. A renderer test that needs a DOM opts in with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    // Builds the image fixtures (tests/fixtures/out/) the first time; a no-op afterwards.
    globalSetup: ['../../tests/fixtures/make-fixtures.ts'],
  },
});
