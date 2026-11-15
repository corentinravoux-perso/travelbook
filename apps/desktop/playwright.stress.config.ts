import { defineConfig } from '@playwright/test';

// The measurements of Task 8.2 (`e2e/stress/`): `npm run e2e:stress`, on the packaged app. They
// take about an hour and use several GB of disk and memory, so no other run includes them.
export default defineConfig({
  testDir: 'e2e/stress',
  timeout: 3 * 60 * 60 * 1000,
  reporter: [['list']],
});
