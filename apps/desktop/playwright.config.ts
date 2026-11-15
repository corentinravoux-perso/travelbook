import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Checks the installed layout: `npm run e2e:packaged`, after `npm run dist:linux`.
  testIgnore: 'packaged/**',
  timeout: 30_000,
  reporter: [['list']],
});
