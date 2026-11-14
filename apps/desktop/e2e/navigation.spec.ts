import { expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchApp } from './launch';

test('the window opens no other window and cannot leave the app page', async () => {
  const work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-nav-'));
  const other = join(work, 'other.html');
  await writeFile(other, '<h1>other</h1>');
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const home = page.url();
    // Set before every attempt: if one of them replaced the page, the marker would be gone.
    await page.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
    });

    // window.open and target="_blank" links: refused, so `window.open` answers null.
    const opened = await page.evaluate(() => [
      window.open('https://example.invalid/'),
      window.open('tb://asset/nope?v=thumb'),
      window.open(location.href),
    ]);
    expect(opened).toEqual([null, null, null]);
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = 'https://example.invalid/';
      link.target = '_blank';
      document.body.append(link);
      link.click();
    });

    // Top-level navigation to the web, to our own scheme and to another local file: cancelled.
    // (`.invalid` never resolves, so a missed block cannot reach the network either.)
    for (const url of [
      'https://example.invalid/',
      'tb://asset/nope?v=thumb',
      pathToFileURL(other).href,
    ]) {
      await page.evaluate((target) => {
        window.location.href = target;
      }, url);
      // A cancelled navigation emits nothing to wait for; give a missed block time to show.
      await page.waitForTimeout(300);
      expect(page.url(), url).toBe(home);
    }

    expect(app.windows()).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
    // Still the app, still able to call main.
    expect(
      await page.evaluate(() =>
        (window as unknown as { tb: { app: { version(): Promise<string> } } }).tb.app.version(),
      ),
    ).toMatch(/^\d+\.\d+\.\d+/);

    // The guard does not get in the way of a reload (what dev-server hot reload does).
    await page.reload();
    expect(page.url()).toBe(home);
    await expect(page.locator('h1')).toHaveText('travelbook');
    expect(await page.evaluate(() => typeof (window as { tb?: unknown }).tb)).toBe('object');
  } finally {
    await app.close();
    await rm(work, { recursive: true, force: true });
  }
});
