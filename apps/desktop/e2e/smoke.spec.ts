import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('the app starts and the window title is travelbook', async () => {
  // Some hosts (e.g. VS Code terminals) export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node.
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({
    args: [join(import.meta.dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('travelbook');
    await expect(page.locator('h1')).toHaveText('travelbook');
  } finally {
    await app.close();
  }
});
