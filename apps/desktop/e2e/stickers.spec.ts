import { expect, test } from '@playwright/test';
import type { AssetRef, StickerElement } from '@travelbook/core';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
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
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-stickers-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

// Offline packs only: nothing here reaches the network.
test('search avion, place the first result and tint it; import alpha.png, place it; credits list both', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await pickFolders(app, albums);
    await createFromHome(page, 'Stickers');
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
    await evalEditor(
      page,
      (e) => {
        e.setState({ currentSpreadId: e.getState().book.spreads[1]!.id });
      },
      null,
    );
    await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Stickers' }).click();
    await expect(page.getByRole('tablist', { name: 'Origine des stickers' })).toBeVisible();

    const stickers = () =>
      evalEditor(
        page,
        (e) =>
          e
            .getState()
            .book.spreads[1]!.elements.filter((el) => el.type === 'sticker') as StickerElement[],
        null,
      );

    await test.step('the French word avion finds stickers, and the first one is placed at 40 mm', async () => {
      await page.getByRole('searchbox', { name: 'Rechercher un sticker' }).fill('avion');
      const first = page.locator('.stk-tile__button').first();
      await expect(first).toBeVisible();
      // The thumbnail comes from tb://sticker (the packs), not from the network.
      await expect(first.locator('img')).toHaveAttribute('src', /^tb:\/\/sticker\//);
      await first.click();
      await expect.poll(async () => (await stickers()).length).toBe(1);
      const [sticker] = await stickers();
      expect(sticker).toMatchObject({ w: 40, tint: null, flipH: false });
      expect(sticker!.h).toBeGreaterThan(0);
    });

    await test.step('the inspector tints the pictogram and flips it', async () => {
      await page.getByRole('checkbox', { name: 'Colorier le sticker en aplat' }).check();
      await expect.poll(async () => (await stickers())[0]!.tint).not.toBeNull();
      await expect(page.locator('.canvas-paper [data-role="tint"]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Retourner horizontalement' }).click();
      await expect.poll(async () => (await stickers())[0]!.flipH).toBe(true);
    });

    await test.step('alpha.png goes into Récents and is placed', async () => {
      await expect(page.getByRole('tab', { name: 'Mes stickers' })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Récents' }).click();
      await expect(page.getByText('Aucun sticker')).toHaveCount(0);
      await app.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
        },
        [fixturePath('alpha.png')],
      );
      await page.getByRole('button', { name: 'Importer des images' }).click();
      const tile = page.getByRole('button', { name: 'Placer alpha' });
      await expect(tile).toBeVisible();
      await tile.click();
      await expect.poll(async () => (await stickers()).length).toBe(2);
      const second = (await stickers())[1]!;
      // 400 x 300 px: a 4:3 sticker, 40 mm wide.
      expect(second.w).toBe(40);
      expect(second.h).toBeCloseTo(30, 1);
    });

    await test.step('a sticker dragged onto the page lands where it is dropped', async () => {
      const paper = page.locator('.canvas-paper');
      const box = (await paper.boundingBox())!;
      await page
        .getByRole('button', { name: 'Placer alpha' })
        .dragTo(paper, { targetPosition: { x: box.width * 0.2, y: box.height * 0.25 } });
      await expect.poll(async () => (await stickers()).length).toBe(3);
      const dropped = (await stickers())[2]!;
      // Centred on the drop point (20 % of the width, 25 % of the height of the spread).
      const size = await evalEditor(
        page,
        (e) => {
          const b = e.getState().book;
          return { w: b.format.width * 2, h: b.format.height };
        },
        null,
      );
      // Within a millimetre: at the fit zoom of a small window (CI) one pixel is about 0.6 mm.
      expect(Math.abs(dropped.x + dropped.w / 2 - size.w * 0.2)).toBeLessThan(1);
      expect(Math.abs(dropped.y + dropped.h / 2 - size.h * 0.25)).toBeLessThan(1);
    });

    await test.step('the credits dialog lists both, and inserts them as text', async () => {
      await page.getByRole('button', { name: 'Crédits des images' }).click();
      const dialog = page.getByRole('dialog', { name: 'Crédits des images' });
      // The dragged copy is the same asset: still two lines.
      await expect(dialog.getByRole('listitem')).toHaveCount(2);
      await expect(
        dialog.getByRole('listitem').filter({ hasText: 'alpha, fichier personnel' }),
      ).toHaveCount(1);
      await expect(
        dialog.getByRole('listitem').filter({ hasText: /(MIT|Apache-2\.0|CC-BY|CC0)/ }),
      ).toHaveCount(1);
      await dialog.getByRole('button', { name: 'Insérer comme texte sur la page' }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () =>
          evalEditor(
            page,
            (e) => e.getState().book.spreads[1]!.elements.filter((el) => el.type === 'text').length,
            null,
          ),
        )
        .toBe(1);
    });

    await test.step('book.json holds both assets, the files are in assets/, one undo removes a sticker and its asset', async () => {
      const book = await savedBook(page, albums, 'stickers');
      const assets = Object.values(book.assets) as AssetRef[];
      const stickerAssets = assets.filter((a) => a.kind === 'sticker');
      expect(stickerAssets).toHaveLength(2);
      expect((await stickers()).length).toBe(3);
      expect(stickerAssets.filter((a) => a.licence !== undefined)).toHaveLength(1);
      for (const a of stickerAssets) {
        await access(join(albums, 'stickers.travelbook', a.file));
      }
    });

    await test.step('travelbook is the first tab and lists our drawings; Bibliothèque opens on its recommended stickers', async () => {
      await page.getByRole('tab', { name: 'travelbook' }).click();
      await page.getByRole('searchbox', { name: 'Rechercher un sticker' }).fill('');
      const own = page.locator('.stk-tile__button img').first();
      await expect(own).toHaveAttribute('src', /^tb:\/\/sticker\/(croquis|boheme|deco|affiches)\//);
      await page.getByRole('tab', { name: 'Bibliothèque' }).click();
      await expect(page.getByRole('combobox', { name: 'Collection' })).toHaveValue('__recommended');
      await expect(page.locator('.stk-tile__button img').first()).toHaveAttribute(
        'src',
        'tb://sticker/fluent-emoji-flat/airplane.svg',
      );
    });
  } finally {
    await app.close();
  }
});
