import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('the app starts and the window title is travelbook', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('travelbook');
    await expect(page.locator('h1')).toHaveText('travelbook');

    // The sandboxed preload ran and exposed the API through contextBridge.
    expect(await page.evaluate(() => typeof (window as { tb?: unknown }).tb)).toBe('object');
    // The renderer is isolated: no Node globals.
    expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe(
      'undefined',
    );
    expect(await page.evaluate(() => typeof (window as { process?: unknown }).process)).toBe(
      'undefined',
    );
  } finally {
    await app.close();
  }
});
