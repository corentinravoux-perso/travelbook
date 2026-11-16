import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalEditor, openAlbum } from './editorHelpers';
import { pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-preview-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const position = (page: Page) => page.locator('.preview__position');

test('opens on the spread in view, turns with the keys and the mouse, and Escape returns', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await pickFolders(app, albums);
    // A photo frame with no photo yet: the editor draws it, the preview must not.
    await openAlbum(page, 'Aperçu', [
      {
        id: 'empty',
        type: 'photo',
        assetId: null,
        crop: { scale: 1, cx: 0.5, cy: 0.5 },
        flipH: false,
        flipV: false,
        mask: { kind: 'rect' },
        border: null,
        shadow: null,
        adjust: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, vignette: 0 },
        edge: null,
        x: 20,
        y: 20,
        w: 60,
        h: 40,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
      },
    ]);
    const total = await evalEditor(page, (e) => e.getState().book.spreads.length + 1, null);
    await expect(page.locator('.canvas-paper [data-element-type="photo"]')).toHaveCount(1);

    await test.step('the Aperçu button opens a full-window preview on the current spread', async () => {
      await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Aperçu de l’album' });
      await expect(preview).toBeVisible();
      expect(await preview.boundingBox()).toEqual(
        await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight })),
      );
      await expect(position(page)).toHaveText(`Pages 2–3, 3 sur ${total}`);
      await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    });

    await test.step('no guides, no frame for the empty photo slot, no editing handles', async () => {
      const scope = page.locator('.preview');
      await expect(scope.locator('[data-spread-id]').first()).toBeVisible();
      await expect(scope.locator('[data-element-type="photo"]')).toHaveCount(0);
      await expect(scope.locator('.guides, .guide, .selection')).toHaveCount(0);
    });

    await test.step('Home goes to the cover, the arrows turn pages, End goes to the last spread', async () => {
      await page.keyboard.press('Home');
      await expect(position(page)).toHaveText(`Couverture, 1 sur ${total}`);
      await page.keyboard.press('ArrowLeft');
      await expect(position(page)).toHaveText(`Couverture, 1 sur ${total}`);
      await page.keyboard.press('ArrowRight');
      await expect(position(page)).toHaveText(`Page 1, 2 sur ${total}`);
      await page.keyboard.press('End');
      await expect(position(page)).toHaveText(new RegExp(`^Page \\d+, ${total} sur ${total}$`));
      await page.keyboard.press('ArrowRight');
      await expect(position(page)).toHaveText(new RegExp(`${total} sur ${total}$`));
    });

    await test.step('"Zones rognées", on by default, hatches the bleed the cut removes', async () => {
      const spread = page.locator('.preview__spread');
      const cut = page.locator('.preview .preview__cut');
      const toggle = page.getByRole('checkbox', { name: 'Zones rognées' });
      await expect(toggle).toBeChecked();
      await expect(cut).toHaveCount(1);
      const { format, bleed } = await evalEditor(
        page,
        (e) => ({ format: e.getState().book.format, bleed: e.getState().book.bleed }),
        null,
      );
      const withBleed = (await spread.boundingBox())!;
      // A single-page spread: the page and its three outer bleeds.
      expect(withBleed.width / withBleed.height).toBeCloseTo(
        (format.width + bleed) / (format.height + 2 * bleed),
        2,
      );
      await toggle.uncheck();
      await expect(cut).toHaveCount(0);
      const trimOnly = (await spread.boundingBox())!;
      expect(trimOnly.width / trimOnly.height).toBeCloseTo((2 * format.width) / format.height, 2);
      await toggle.check();
    });

    await test.step('a click on the left half goes back, on the right half goes on', async () => {
      const stage = (await page.locator('.preview__stage').boundingBox())!;
      const y = stage.y + stage.height / 2;
      await page.mouse.click(stage.x + stage.width * 0.2, y);
      await expect(position(page)).toHaveText(new RegExp(`${total - 1} sur ${total}$`));
      await page.mouse.click(stage.x + stage.width * 0.8, y);
      await expect(position(page)).toHaveText(new RegExp(`${total} sur ${total}$`));
    });

    await test.step('Escape returns to the editor, on the spread it left', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Aperçu de l’album' })).toHaveCount(0);
      await expect(page.locator('.shell')).not.toHaveAttribute('inert', '');
      await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
    });

    await test.step('the close button returns too', async () => {
      await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
      await page.getByRole('button', { name: 'Fermer l’aperçu' }).click();
      await expect(page.getByRole('dialog', { name: 'Aperçu de l’album' })).toHaveCount(0);
    });
  } finally {
    await app.close();
  }
});
