import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Check the installed layout (`npm run e2e:packaged`, after `npm run dist:linux`) and measure a
  // 100-page book (`npm run e2e:stress`).
  testIgnore: ['packaged/**', 'stress/**'],
  timeout: 30_000,
  reporter: [['list']],
});
