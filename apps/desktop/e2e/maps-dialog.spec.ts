import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

test.describe.configure({ timeout: 120_000 });

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-maps-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Screenshots go to MAPS_SHOTS_DIR when it is set (to look at them), else to the test output. */
const shot = (name: string) =>
  join(process.env['MAPS_SHOTS_DIR'] ?? test.info().outputPath('.'), `${name}.png`);

/** Milliseconds from now until the preview of the dialog has drawn a land path. */
function landDrawnIn(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const land = document.querySelector('.map-preview [data-layer="land"] path');
          if (land) resolve(Math.round(performance.now() - t0));
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

test('the map dialog: Thailand in carnet, pan and zoom, place, reopen; a region subject', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await pickFolders(app, albums);
    await createFromHome(page, 'Voyage');
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();

    const dialog = page.getByRole('dialog', { name: 'Créer une carte' });
    await page.getByRole('button', { name: 'Cartes', exact: true }).click();
    await page.getByRole('button', { name: 'Créer une carte…' }).click();
    await expect(dialog).toBeVisible();

    await test.step('Thailand: search, preview drawn off the main thread', async () => {
      await dialog.getByRole('searchbox', { name: 'Pays ou région' }).fill('thai');
      await dialog.getByRole('option', { name: 'Thaïlande' }).click();
      const ms = await landDrawnIn(page);
      console.log(`preview latency TH (pick to land drawn): ${ms} ms`);
      await expect(page.locator('.map-preview[aria-busy="false"]')).toBeVisible();
      // a worker was started: the CSP and the file:// page allow it
      expect(page.workers().length).toBeGreaterThan(0);
      await page.screenshot({ path: shot('task16-thailande') });
    });

    await test.step('wheel zooms, drag pans, Recentrer goes back', async () => {
      const preview = dialog.getByLabel('Aperçu de la carte');
      const box = (await preview.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -400);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
      await page.mouse.up();
      await expect(dialog.getByRole('button', { name: 'Recentrer' })).toBeEnabled();
      await page.screenshot({ path: shot('task16-thailande-zoom') });
      await dialog.getByRole('button', { name: 'Recentrer' }).click();
      await expect(dialog.getByRole('button', { name: 'Recentrer' })).toBeDisabled();
    });

    await test.step('place the map, reopen it by double-click and from the Inspector', async () => {
      await dialog.getByRole('button', { name: 'Placer la carte' }).click();
      await expect(dialog).toBeHidden();
      const map = page.locator('[data-element-type="map"]').first();
      await expect(map).toBeVisible();
      await expect(page.getByRole('button', { name: 'Modifier la carte…' }).first()).toBeVisible();
      await map.dblclick();
      const edit = page.getByRole('dialog', { name: 'Modifier la carte' });
      await expect(edit).toBeVisible();
      await expect(edit.getByText('Thaïlande')).toBeVisible();
      await edit.getByRole('button', { name: 'Annuler' }).click();
      await expect(edit).toBeHidden();
      await page.getByRole('button', { name: 'Modifier la carte…' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Modifier la carte' })).toBeVisible();
      await page
        .getByRole('dialog', { name: 'Modifier la carte' })
        .getByRole('button', { name: 'Annuler' })
        .click();
    });

    await test.step('Italie, Sicile: the region is chosen and the preview is drawn', async () => {
      await page.getByRole('button', { name: 'Créer une carte…' }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('searchbox', { name: 'Pays ou région' }).fill('sicile');
      await dialog.getByRole('option', { name: 'Sicile' }).click();
      const ms = await landDrawnIn(page);
      console.log(`preview latency IT/Sicile (pick to land drawn): ${ms} ms`);
      await expect(page.locator('.map-preview[aria-busy="false"]')).toBeVisible();
      await expect(dialog.getByText(/Italie/).first()).toBeVisible();
      // the places are Sicily's own
      const preview = dialog.getByLabel('Aperçu de la carte');
      await expect(preview).toContainText('Palerme');
      await expect(preview).not.toContainText('Rome');
      await expect(preview).not.toContainText('Reggio');
      await page.screenshot({ path: shot('task16-sicile') });
    });

    // zod probes `new Function('')` at load: the CSP logs that refusal, which it catches
    expect(
      errors.filter((e) => !/Autofill|DevTools|'script-src' was not explicitly set/.test(e)),
    ).toEqual([]);
  } finally {
    await app.close();
  }
});
