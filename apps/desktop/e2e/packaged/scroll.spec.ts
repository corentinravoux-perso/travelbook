/**
 * The sticker grid of the packaged app survives fast scrolling. A wheel sends scroll events in
 * bursts; reading the React event inside a state updater threw on the second one, React unmounted
 * the app and the window turned white (v0.1.0, fixed in TileGrid and PhotoGrid).
 */
import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, pickFolders } from '../home';
import { launchPackaged, requirePackagedApp } from '../packagedApp';

test.setTimeout(180_000);

test('scrolling the sticker library keeps the window drawn', async () => {
  await requirePackagedApp();
  const work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-scroll-'));
  const albums = join(work, 'albums');
  await mkdir(albums);
  const { app } = await launchPackaged(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await pickFolders(app, albums);
    await createFromHome(page, 'Défilement');
    await page.getByRole('button', { name: 'Stickers', exact: true }).first().click();
    const grid = page.locator('.stk-grid').first();
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid.locator('img').first()).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 10; i++) {
      // Two events in one task, as a wheel burst sends them.
      await grid.evaluate((el) => {
        el.scrollTop += 600;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
        el.scrollTop += 600;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await page.waitForTimeout(50);
    }
    expect(errors).toEqual([]);
    await expect(grid).toBeVisible();
    await expect(page.getByText('Un problème d’affichage est survenu')).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    await rm(work, { recursive: true, force: true });
  }
});
