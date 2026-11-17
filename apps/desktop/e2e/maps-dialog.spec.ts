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

    await test.step('places panel: untick, add by search, click on the map, drag a label', async () => {
      const places = dialog.getByRole('group', { name: 'Lieux' });
      await expect(places.getByRole('heading', { name: 'Villes' })).toBeVisible();
      await expect(places.getByRole('heading', { name: 'Sites' })).toBeVisible();
      const preview = dialog.getByLabel('Aperçu de la carte');
      // untick Chiang Mai: its label leaves the preview
      await expect(preview).toContainText('Chiang Mai');
      await places.getByRole('checkbox', { name: 'Afficher Chiang Mai' }).uncheck();
      await expect(preview).not.toContainText('Chiang Mai');
      await places.getByRole('checkbox', { name: 'Afficher Chiang Mai' }).check();
      await expect(preview).toContainText('Chiang Mai');
      // add a bundled place by search
      await places.getByRole('searchbox', { name: 'Lieu à ajouter' }).fill('lampang');
      await places.getByRole('option', { name: 'Lampang' }).click();
      await expect(preview).toContainText('Lampang');
      // a click on the sea adds a custom place
      const box = (await preview.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.5);
      await expect(places.getByRole('heading', { name: 'Lieux ajoutés' })).toBeVisible();
      // drag the label of Bangkok
      const label = preview.locator('[data-label]', { hasText: 'Bangkok' });
      const lb = (await label.boundingBox())!;
      await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
      await page.mouse.down();
      await page.mouse.move(lb.x + lb.width / 2 + 30, lb.y + lb.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      await expect(
        places.getByRole('button', { name: 'Position automatique de Bangkok' }),
      ).toBeEnabled();
      await page.screenshot({ path: shot('task17-places') });
      await places.getByRole('button', { name: 'Position automatique de Bangkok' }).click();
      await expect(
        places.getByRole('button', { name: 'Position automatique de Bangkok' }),
      ).toBeDisabled();
    });

    await test.step('itinerary: Bangkok, Chiang Mai (avion), Phuket (bus), numbered', async () => {
      const places = dialog.getByRole('group', { name: 'Lieux' });
      const route = dialog.getByRole('group', { name: 'Itinéraire' });
      const preview = dialog.getByLabel('Aperçu de la carte');
      await places.getByRole('searchbox', { name: 'Lieu à ajouter' }).fill('phuket');
      await places.getByRole('option', { name: 'Phuket', exact: true }).click();
      const add = route.getByRole('combobox', { name: 'Étape à ajouter' });
      for (const name of ['Bangkok', 'Chiang Mai', 'Phuket']) {
        await add.selectOption({ label: name });
      }
      await route.getByLabel('Mode du trajet 1').selectOption('avion');
      await route.getByLabel('Pictogramme du trajet 1').check();
      await route.getByLabel('Mode du trajet 2').selectOption('bus');
      await route.getByLabel('Forme du trajet 2').selectOption('courbe');
      await route.getByLabel('Courbure du trajet 2').fill('0.4');
      await expect(preview.locator('[data-layer="route"] path').first()).toBeVisible();
      await expect(preview.locator('[data-layer="badges"] text')).toHaveText(['1', '2', '3']);
      // a tall window for the picture only: the dialog fits whole
      const size = page.viewportSize();
      await page.setViewportSize({ width: 1280, height: 1250 });
      await dialog.evaluate((el) => el.scrollTo(0, 0));
      await page.screenshot({ path: shot('task18-route') });
      if (size) await page.setViewportSize(size);
      await route.getByRole('button', { name: 'Descendre l’étape 1 (Bangkok)' }).click();
      await expect(preview.locator('[data-layer="badges"] text')).toHaveCount(3);
      await route.getByRole('button', { name: 'Monter l’étape 2 (Bangkok)' }).click();
    });

    await test.step('wheel zooms, drag pans, Recentrer goes back', async () => {
      const preview = dialog.getByLabel('Aperçu de la carte');
      await preview.scrollIntoViewIfNeeded();
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
