import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { AssetRef, Background } from '@travelbook/core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureFixtures, fixturePath } from '../../../tests/fixtures/make-fixtures';
import { evalEditor, savedBook } from './editorHelpers';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeAll(async () => {
  await ensureFixtures();
});
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-backgrounds-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** A new album on its first inner spread (pages 2 and 3), one photo imported, Fonds panel open. */
async function openAlbum(app: ElectronApplication, page: Page, title: string) {
  await pickFolders(app, albums);
  await createFromHome(page, title);
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [fixturePath('landscape.jpg')],
  );
  await page.getByRole('button', { name: 'Importer des photos' }).click();
  await expect(page.locator('.photo-thumb')).toHaveCount(1);
  await evalEditor(
    page,
    (e) => {
      e.setState({ currentSpreadId: e.getState().book.spreads[1]!.id });
    },
    null,
  );
  await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Fonds' }).click();
  await expect(page.getByRole('tablist', { name: 'Types de fonds' })).toBeVisible();
}

const spreadBackground = (page: Page) =>
  evalEditor(page, (e) => e.getState().book.spreads[1]!.background, null);
/** The thumbnail of the spread in the strip, as a PNG. */
const thumb = (page: Page, spreadIndex: number) =>
  page
    .locator('.thumb')
    .nth(spreadIndex + 1)
    .screenshot();

test('a gradient on the left page and a photo across the spread reach book.json and the thumbnail', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await openAlbum(app, page, 'Fonds');
    const before = await thumb(page, 1);

    await test.step('a gradient preset goes on the left page only', async () => {
      await page.locator('[data-target="left"]').click();
      await page.getByRole('tab', { name: 'Dégradé' }).click();
      await page.getByRole('button', { name: 'Océan' }).click();
      const bg = await spreadBackground(page);
      expect(bg.left).toMatchObject({ kind: 'gradient', type: 'linear', angle: 180 });
      expect(bg.right).toBeUndefined();
      expect(bg.spread).toBeUndefined();
      await expect(page.locator('.canvas-paper [data-background="left"]')).toHaveAttribute(
        'data-background-kind',
        'gradient',
      );
    });

    const afterGradient = await test.step('the thumbnail of the spread shows it', async () => {
      await expect.poll(async () => (await thumb(page, 1)).equals(before)).toBe(false);
      return thumb(page, 1);
    });

    await test.step('the editor changes the angle and adds a stop', async () => {
      await page.getByLabel('Angle').fill('90');
      await page.getByRole('button', { name: 'Ajouter un repère' }).click();
      const left = (await spreadBackground(page)).left as Extract<Background, { kind: 'gradient' }>;
      expect(left.angle).toBe(90);
      expect(left.stops).toHaveLength(3);
      await page.getByRole('button', { name: 'Radial' }).click();
      await expect(page.getByRole('button', { name: 'Radial' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(((await spreadBackground(page)).left as { type: string }).type).toBe('radial');
      await expect(page.getByLabel('Angle')).toHaveCount(0);
    });

    await test.step('a photo goes across the double page and replaces the page backgrounds', async () => {
      await page.locator('[data-target="spread"]').click();
      await page.getByRole('tab', { name: 'Photo' }).click();
      await page.locator('.bg-swatch--image').first().click();
      const bg = await spreadBackground(page);
      expect(bg.spread).toMatchObject({
        kind: 'image',
        fit: 'cover',
        opacity: 1,
        blur: 0,
        tint: null,
      });
      expect(bg.left).toBeUndefined();
      await expect(page.locator('.canvas-paper [data-background="spread"]')).toHaveCount(1);
      await page.getByLabel('Opacité').fill('60');
      await expect
        .poll(async () => ((await spreadBackground(page)).spread as { opacity: number }).opacity)
        .toBe(0.6);
      await expect.poll(async () => (await thumb(page, 1)).equals(afterGradient)).toBe(false);
    });

    await test.step('book.json holds the background and the photo it uses', async () => {
      const book = await savedBook(page, albums, 'fonds');
      const spread = book.spreads[1]!.background.spread as Extract<Background, { kind: 'image' }>;
      expect(spread.kind).toBe('image');
      expect(book.assets[spread.assetId]?.kind).toBe('photo');
      expect(book.spreads[1]!.background.left).toBeUndefined();
    });

    await test.step('undo steps back through the changes', async () => {
      const labels = await evalEditor(page, (e) => e.getState().history.labels, null);
      expect(labels).toContain('Changer le fond');
    });
  } finally {
    await app.close();
  }
});

test('a bundled pattern and texture are copied into the album with their licence, and removing clears the page', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await openAlbum(app, page, 'Motifs');
    await page.locator('[data-target="right"]').click();

    await test.step('a pattern is drawn in the two colours', async () => {
      await page.getByRole('tab', { name: 'Motif' }).click();
      await expect(page.locator('.bg-swatch--pattern').first()).toBeVisible();
      expect(await page.locator('.bg-swatch--pattern').count()).toBeGreaterThanOrEqual(60);
      await page.getByRole('button', { name: 'Petits pois', exact: true }).click();
      await expect(page.locator('.canvas-paper [data-background="right"]')).toHaveAttribute(
        'data-background-kind',
        'pattern',
      );
      const right = (await spreadBackground(page)).right as Extract<
        Background,
        { kind: 'pattern' }
      >;
      expect(right).toMatchObject({ fg: '#9aa5b1', bg: '#f5f5f2', scale: 1 });
      const asset = (await evalEditor(page, (e) => e.getState().book.assets, null))[
        right.assetId
      ] as AssetRef;
      expect(asset).toMatchObject({
        kind: 'pattern',
        licence: { licence: 'CC0-1.0', author: 'travelbook' },
      });
      // The tile is a stencil of the pattern colour: the page shows it, not a blank.
      const paint = await page
        .locator('.canvas-paper [data-background="right"] [data-role="pattern"]')
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return { color: style.backgroundColor, mask: style.maskImage };
        });
      expect(paint.color).toBe('rgb(154, 165, 177)');
      expect(paint.mask).toContain('tb://asset/pattern-');
    });

    await test.step('the pattern colour and scale edit the same background', async () => {
      await page.getByLabel('Échelle').fill('2');
      await expect
        .poll(async () => ((await spreadBackground(page)).right as { scale: number }).scale)
        .toBe(2);
    });

    await test.step('a texture fills the page, with image settings', async () => {
      await page.getByRole('tab', { name: 'Texture' }).click();
      expect(await page.locator('.bg-swatch--image').count()).toBeGreaterThanOrEqual(20);
      await page.getByRole('button', { name: 'Papier kraft', exact: true }).click();
      // The file is copied by main first, so the background follows a moment later.
      await expect
        .poll(async () => ((await spreadBackground(page)).right as { kind: string }).kind)
        .toBe('image');
      const right = (await spreadBackground(page)).right as Extract<Background, { kind: 'image' }>;
      const asset = (await evalEditor(page, (e) => e.getState().book.assets, null))[
        right.assetId
      ] as AssetRef;
      expect(asset).toMatchObject({ kind: 'background', pixel: { w: 1131, h: 1600 } });
      await expect(page.getByRole('group', { name: 'Ajustement' })).toBeVisible();
      await page.getByRole('button', { name: 'Mosaïque' }).click();
      await expect
        .poll(async () => ((await spreadBackground(page)).right as { fit: string }).fit)
        .toBe('tile');
    });

    await test.step('an imported image of Mes fonds fills the page', async () => {
      await page.getByRole('tab', { name: 'Mes fonds' }).click();
      await expect(page.getByText('Importez des images', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Importer des fonds' }).click();
      const item = page.locator('.bg-swatch--image');
      await expect(item).toHaveCount(1);
      await item.click();
      await expect
        .poll(async () => ((await spreadBackground(page)).right as { assetId: string }).assetId)
        .toMatch(/^background-[0-9a-f]{16}$/);
      await expect(page.getByRole('group', { name: 'Ajustement' })).toBeVisible();
    });

    await test.step('a colour from the palette of the photos, then removing the background', async () => {
      await evalEditor(
        page,
        (e) => {
          const assetId = Object.keys(e.getState().book.assets).find((id) => id.length === 16)!;
          const id = e.getState().book.spreads[1]!.id;
          e.getState().apply(
            (b) => ({
              ...b,
              spreads: b.spreads.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      elements: [
                        {
                          id: 'ph',
                          type: 'photo',
                          assetId,
                          crop: { scale: 1, cx: 0.5, cy: 0.5 },
                          flipH: false,
                          flipV: false,
                          mask: { kind: 'rect' },
                          border: null,
                          shadow: null,
                          adjust: {
                            brightness: 1,
                            contrast: 1,
                            saturation: 1,
                            grayscale: 0,
                            sepia: 0,
                            vignette: 0,
                          },
                          edge: null,
                          x: 20,
                          y: 20,
                          w: 60,
                          h: 40,
                          rotation: 0,
                          opacity: 1,
                          locked: false,
                          hidden: false,
                        } as never,
                      ],
                    }
                  : s,
              ),
            }),
            'Ajouter',
          );
        },
        null,
      );
      await page.getByRole('tab', { name: 'Couleur' }).click();
      const swatches = page
        .getByRole('group', { name: 'Couleurs des photos de la double page' })
        .getByRole('button');
      await expect(swatches.first()).toBeVisible();
      const hex = (await swatches.first().getAttribute('title'))!;
      await swatches.first().click();
      expect(((await spreadBackground(page)).right as { color: string }).color).toBe(hex);
      await page.getByRole('button', { name: 'Retirer le fond' }).click();
      expect((await spreadBackground(page)).right).toBeUndefined();
      await expect(page.getByRole('button', { name: 'Retirer le fond' })).toBeDisabled();
    });
  } finally {
    await app.close();
  }
});
