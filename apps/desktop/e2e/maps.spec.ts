import { expect, test, type Page } from '@playwright/test';
import type { Book, MapElement } from '@travelbook/core';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ensureFixtures, fixturePath } from '../../../tests/fixtures/make-fixtures';
import type { ExportOptions, ExportReport, TbApi } from '../src/shared/api';
import { evalEditor, savedBook } from './editorHelpers';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

test.describe.configure({ timeout: 180_000 });

const run = promisify(execFile);

let work: string;
let albums: string;

test.beforeAll(async () => {
  await ensureFixtures();
});
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-maps-full-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Screenshots go to MAPS_SHOTS_DIR when it is set (to look at them), else to the test output. */
const shot = (name: string) =>
  join(process.env['MAPS_SHOTS_DIR'] ?? test.info().outputPath('.'), `${name}.png`);

const mapsOf = (book: Book): MapElement[] =>
  [book.cover, ...book.spreads]
    .flatMap((s) => s.elements)
    .filter((e): e is MapElement => e.type === 'map');

const currentMaps = (page: Page) => evalEditor(page, (e) => e.getState().book, null).then(mapsOf);

const OPTIONS: ExportOptions = {
  route: 'pdf',
  pages: 'all',
  includeCover: false,
  dpi: 150,
  nativeResolution: false,
  bleed: false,
  cropMarks: false,
  imageFormat: 'jpeg',
  jpegQuality: 90,
  perSpread: false,
  coverMode: 'flat',
  outDir: '',
};

test('a Thailand map end to end: create, edit, resize, export as vector text, save, delete', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await pickFolders(app, albums);
    await createFromHome(page, 'voyage');
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();

    // one album photo, for the Escape check of the photo chooser
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
    }, fixturePath('landscape.jpg'));
    await page.getByRole('button', { name: 'Importer des photos' }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(1);

    const dialog = page.getByRole('dialog', { name: 'Créer une carte' });
    const places = dialog.getByRole('group', { name: 'Lieux' });
    const preview = dialog.getByLabel('Aperçu de la carte');

    await test.step('Thailand in carnet, four stops, one plane leg, a moved label', async () => {
      await page.getByRole('button', { name: 'Cartes', exact: true }).click();
      await page.getByRole('button', { name: 'Créer une carte…' }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('searchbox', { name: 'Pays ou région' }).fill('thai');
      await dialog.getByRole('option', { name: 'Thaïlande' }).click();
      await expect(page.locator('.map-preview[aria-busy="false"]')).toBeVisible();
      await expect(preview).toContainText('Bangkok');

      for (const [query, name] of [
        ['lampang', 'Lampang'],
        ['phuket', 'Phuket'],
      ] as const) {
        await places.getByRole('searchbox', { name: 'Lieu à ajouter' }).fill(query);
        await places.getByRole('option', { name, exact: true }).click();
      }
      await dialog.getByRole('tab', { name: 'Itinéraire' }).click();
      const route = dialog.getByRole('group', { name: 'Itinéraire' });
      const add = route.getByRole('combobox', { name: 'Étape à ajouter' });
      for (const name of ['Bangkok', 'Chiang Mai', 'Lampang', 'Phuket']) {
        await add.selectOption({ label: name });
      }
      await route.getByLabel('Mode du trajet 1').selectOption('avion');
      await expect(preview.locator('[data-layer="badges"] text')).toHaveText(['1', '2', '3', '4']);
      await expect(preview.locator('[data-layer="route"] path').first()).toBeVisible();

      // drag the label of Bangkok
      await dialog.getByRole('tab', { name: 'Lieux' }).click();
      const label = preview.locator('[data-label]', { hasText: 'Bangkok' });
      const lb = (await label.boundingBox())!;
      await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
      await page.mouse.down();
      await page.mouse.move(lb.x + lb.width / 2 + 30, lb.y + lb.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      await expect(
        places.getByRole('button', { name: 'Position automatique de Bangkok' }),
      ).toBeEnabled();
    });

    await test.step('Escape in the photo chooser closes the chooser only', async () => {
      await places.getByRole('checkbox', { name: 'Médaillons' }).check();
      await places.getByRole('button', { name: 'Photo de Bangkok…' }).click();
      const picker = dialog.locator('.photo-picker');
      await expect(picker).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveJSProperty('open', true);
      // the photo is still wanted on the placed map
      await places.getByRole('button', { name: 'Photo de Bangkok…' }).click();
      await dialog.locator('.photo-picker .photo-thumb').first().click();
      await expect(preview.locator('[data-medallion] image')).toHaveCount(1);
    });

    await test.step('apply: the map is placed on the page', async () => {
      await dialog.getByRole('button', { name: 'Placer la carte' }).click();
      await expect(dialog).toBeHidden();
      const map = page.locator('[data-element-type="map"]').first();
      await expect(map).toBeVisible();
      const maps = await currentMaps(page);
      expect(maps).toHaveLength(1);
      expect(maps[0]!.subject.id).toBe('TH');
      expect(maps[0]!.route?.stops).toHaveLength(4);
      expect(maps[0]!.route?.legs[0]?.mode).toBe('avion');
      expect(maps[0]!.places.some((p) => p.label === 'Bangkok' && p.labelOffset !== null)).toBe(
        true,
      );
      await expect(map).toContainText('Bangkok');
      await page.screenshot({ path: shot('task21-carte-placee') });
    });

    await test.step('reopen by double-click, change the preset, apply', async () => {
      const carnetLand = (await currentMaps(page))[0]!.style.land.fill;
      await page.locator('[data-element-type="map"]').first().dblclick();
      const edit = page.getByRole('dialog', { name: 'Modifier la carte' });
      await expect(edit).toBeVisible();
      await edit.getByRole('tab', { name: 'Style' }).click();
      await edit
        .getByRole('group', { name: 'Modèles de style' })
        .getByRole('button', { name: 'Ardoise' })
        .click();
      await edit.getByRole('button', { name: 'Appliquer' }).click();
      await expect(edit).toBeHidden();
      await expect
        .poll(async () => (await currentMaps(page))[0]!.style.land.fill)
        .not.toBe(carnetLand);
      expect(await currentMaps(page)).toHaveLength(1);
      await expect(page.locator('[data-element-type="map"]').first()).toContainText('Bangkok');
    });

    await test.step('resize the element: the map follows its box', async () => {
      const before = (await currentMaps(page))[0]!;
      await evalEditor(
        page,
        (e, id) => {
          e.getState().apply(
            (b) => ({
              ...b,
              spreads: b.spreads.map((s) => ({
                ...s,
                elements: s.elements.map((el) =>
                  el.id === id ? { ...el, w: el.w * 0.8, h: el.h * 0.8 } : el,
                ),
              })),
            }),
            'Redimensionner',
          );
        },
        before.id,
      );
      const after = (await currentMaps(page))[0]!;
      expect(after.w).toBeCloseTo(before.w * 0.8, 3);
      const map = page.locator('[data-element-type="map"]').first();
      const box = (await map.boundingBox())!;
      expect(box.width).toBeGreaterThan(50);
      await expect(map).toContainText('Bangkok');
      await page.screenshot({ path: shot('task21-carte-redimensionnee') });
    });

    await test.step('export the pages to PDF: the map text is vector text', async () => {
      await evalEditor(page, (e) => e.getState().flush(), null);
      const outDir = join(work, 'pdf');
      const report = await page.evaluate(
        (o) => (window as unknown as { tb: TbApi }).tb.exporter.run(o),
        { ...OPTIONS, outDir },
      );
      const files = (report as ExportReport).files;
      expect(files).toHaveLength(1);
      expect((await readdir(outDir)).some((f) => f.endsWith('.pdf'))).toBe(true);
      const { stdout } = await run('pdftotext', [files[0]!, '-'], { maxBuffer: 16 * 1024 * 1024 });
      expect(stdout).toContain('Bangkok');
      expect(stdout).toContain('Chiang Mai');
      // render the page that carries the map, to look at it
      const { stdout: pages } = await run('pdfinfo', [files[0]!]);
      const count = Number(/Pages:\s+(\d+)/.exec(pages)![1]);
      for (let p = 1; p <= count; p += 1) {
        const { stdout: t } = await run('pdftotext', [
          '-f',
          String(p),
          '-l',
          String(p),
          files[0]!,
          '-',
        ]);
        if (t.includes('Bangkok')) {
          const base = shot('task21-pdf').replace(/\.png$/, '');
          await run('pdftoppm', [
            '-png',
            '-r',
            '70',
            '-singlefile',
            '-f',
            String(p),
            '-l',
            String(p),
            files[0]!,
            base,
          ]);
          break;
        }
      }
    });

    await test.step('save: schemaVersion 2; delete the map, save: 1', async () => {
      const withMap = await savedBook(page, albums, 'voyage');
      expect(withMap.schemaVersion).toBe(2);
      expect(mapsOf(withMap)).toHaveLength(1);

      const id = (await currentMaps(page))[0]!.id;
      await evalEditor(page, (e, i) => e.getState().select([i]), id);
      await page.locator('[data-element-type="map"]').first().click();
      await page.keyboard.press('Delete');
      await expect(page.locator('[data-element-type="map"]')).toHaveCount(0);
      const without = await savedBook(page, albums, 'voyage');
      expect(mapsOf(without)).toHaveLength(0);
      expect(without.schemaVersion).toBe(1);
    });

    // zod probes `new Function('')` at load: the CSP logs that refusal, which it catches
    expect(
      errors.filter((e) => !/Autofill|DevTools|'script-src' was not explicitly set/.test(e)),
    ).toEqual([]);
  } finally {
    await app.close();
  }
});
