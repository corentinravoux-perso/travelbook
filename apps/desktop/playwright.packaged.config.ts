import { defineConfig } from '@playwright/test';

// The check of the packaged app (`e2e/packaged/`), kept out of `npm run e2e`, which tests `out/`.
export default defineConfig({
  testDir: 'e2e/packaged',
  timeout: 180_000,
  reporter: [['list']],
});
