import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { ExportOptions, ExportReport, TbApi } from '../src/shared/api';
import { evalEditor } from './editorHelpers';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

test.describe.configure({ timeout: 120_000 });

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-posters-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

test('a Japan poster from the cover editor reaches the cover, its export and the credits', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await pickFolders(app, albums);
    await createFromHome(page, 'Voyage');
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
    await evalEditor(
      page,
      (e) => e.setState({ currentSpreadId: e.getState().book.cover.id }),
      null,
    );

    const dialog = page.getByRole('dialog', { name: 'Créer une affiche' });
    await test.step('open the dialog from the cover editor, filter Japon, pick the first preset', async () => {
      await page.getByRole('button', { name: 'Créer une affiche…' }).first().click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Japon', exact: true }).click();
      const tiles = dialog.getByRole('list', { name: "Modèles d'affiche" }).getByRole('button');
      await expect(tiles.first()).toBeVisible();
      await tiles.first().click();
      await expect(dialog.getByLabel('Lieu')).toHaveValue('JAPON');
      await expect(dialog.locator('.poster-dialog__preview .poster-preview')).toBeVisible();
      // The torii is recolourable: once recoloured, the preview shows its own copy, which the
      // page's Content-Security-Policy must let through.
      // A sticker is an SVG <image> (it stretches with its box): its href is loaded as an <img>
      // would be, under the same img-src rule.
      const drawing = dialog.locator('.poster-dialog__preview image');
      await expect
        .poll(() => drawing.evaluate((el) => el.getAttribute('href')?.startsWith('tb:')))
        .toBe(false);
      await expect
        .poll(() =>
          drawing.evaluate(async (el) => {
            const image = new Image();
            image.src = el.getAttribute('href') ?? '';
            return image.decode().then(
              () => image.naturalWidth > 0,
              () => false,
            );
          }),
        )
        .toBe(true);
      await page.screenshot({ path: test.info().outputPath('dialog.png') });
    });

    await test.step('apply: one history entry, a JAPON title and a sticker on the front', async () => {
      const before = await evalEditor(page, (e) => e.getState().history.labels.length, null);
      await dialog.getByRole('button', { name: 'Appliquer à la couverture' }).click();
      const replace = dialog.getByRole('button', { name: 'Remplacer', exact: true });
      if (await replace.isVisible()) await replace.click();
      await expect(dialog).toBeHidden();
      const cover = await evalEditor(
        page,
        (e) => {
          const b = e.getState().book;
          return b.cover.elements
            .filter((el) => el.x + el.w / 2 >= b.format.width)
            .map((el) => ({ type: el.type, json: JSON.stringify(el) }));
        },
        null,
      );
      expect(cover.some((el) => el.type === 'text' && el.json.includes('JAPON'))).toBe(true);
      expect(cover.filter((el) => el.type === 'sticker')).toHaveLength(1);
      const after = await evalEditor(page, (e) => e.getState().history.labels, null);
      expect(after).toHaveLength(before + 1);
      expect(after.at(-1)).toBe('Appliquer une affiche');
      await page.screenshot({ path: test.info().outputPath('cover.png') });
    });

    await test.step('the cover exports as an image with the poster on its front', async () => {
      await evalEditor(page, (e) => e.getState().flush(), null);
      const outDir = join(work, 'export');
      const options: ExportOptions = {
        route: 'images',
        pages: { from: 1, to: 1 },
        includeCover: true,
        dpi: 100,
        nativeResolution: false,
        bleed: true,
        cropMarks: false,
        imageFormat: 'jpeg',
        jpegQuality: 90,
        perSpread: false,
        coverMode: 'flat',
        outDir,
      };
      const report = await page.evaluate(
        (o) => (window as unknown as { tb: TbApi }).tb.exporter.run(o),
        options,
      );
      const coverFile = (report as ExportReport).files.find((f) => f.includes('couverture'));
      expect(coverFile).toBeTruthy();
      // The front (right half) is not a plain ground: the title and the drawing are on it.
      const { width, height } = await sharp(coverFile!).metadata();
      const front = await sharp(coverFile!)
        .extract({
          left: Math.round(width! * 0.55),
          top: 0,
          width: Math.round(width! * 0.4),
          height: height!,
        })
        .stats();
      expect(Math.max(...front.channels.map((c) => c.stdev))).toBeGreaterThan(10);
    });

    await test.step('the credits dialog lists the poster drawing', async () => {
      await page.getByRole('button', { name: 'Crédits des images' }).click();
      const credits = page.getByRole('dialog', { name: 'Crédits des images' });
      await expect(credits.getByRole('listitem').filter({ hasText: 'Affiche JAPON' })).toHaveCount(
        1,
      );
    });
  } finally {
    await app.close();
  }
});
