import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

test('the app starts and the window title is travelbook', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'travelbook-e2e-smoke-'));
  const app = await launchApp(userData);
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

    // No permission is granted: a page asking for the position gets "permission denied" (code 1).
    expect(
      await page.evaluate(
        () =>
          new Promise<number>((resolve) =>
            navigator.geolocation.getCurrentPosition(
              () => resolve(0),
              (error) => resolve(error.code),
            ),
          ),
      ),
    ).toBe(1);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
