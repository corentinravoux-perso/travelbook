import { expect, test } from '@playwright/test';
import type { AssetRef, TextElement } from '@travelbook/core';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalEditor, openAlbum, savedBook } from './editorHelpers';
import { pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-fonts-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const FONT_FILE = join(
  import.meta.dirname,
  '../src/main/library/fixtures/fixture-sans-regular.ttf',
);

// No network: the catalogue is not touched; a font file the user imports stands for a library font.
test('the picker lists the bundled fonts, a user font joins the album and survives a fresh user-data folder', async () => {
  const userData = join(work, 'user data');
  let app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    let page = await app.firstWindow();
    await openAlbum(page, 'polices');

    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    await page.locator('[data-preset="body"]').click();
    await page.keyboard.type('Été « œuvre »');
    await page.keyboard.press('Escape');
    // Escape ends the typing and leaves the text selected: the inspector has its font field.
    const select = page.getByLabel('Police');
    await expect(select).toBeVisible();

    await test.step('the picker offers about forty bundled fonts, by category, in their own face', async () => {
      const options = select.locator('optgroup:not([label="Mes polices"]) option');
      expect(await options.count()).toBeGreaterThanOrEqual(40);
      await expect(select.locator('optgroup').first()).toHaveAttribute('label', 'Manuscrites');
      expect(await options.first().evaluate((o) => (o as HTMLElement).style.fontFamily)).toMatch(
        /\w/,
      );
      await select.selectOption({ label: 'Anton' });
      await expect
        .poll(() =>
          evalEditor(
            page,
            (e) => (e.getState().book.spreads[1]!.elements.at(-1) as TextElement).style.fontFamily,
            null,
          ),
        )
        .toContain('Anton');
    });

    await test.step('an imported font appears under "Mes polices" and is chosen', async () => {
      await page.evaluate(
        (path) =>
          (
            window as unknown as {
              tb: { library: { fonts: { importFile(p: string): Promise<unknown> } } };
            }
          ).tb.library.fonts.importFile(path),
        FONT_FILE,
      );
      // The list is read again when the dialog adds a family; here the page asks for it directly.
      await page.evaluate(() =>
        (window as unknown as { __tbFonts: { refresh(): Promise<void> } }).__tbFonts.refresh(),
      );
      await expect(select.locator('optgroup[label="Mes polices"] option')).toHaveText([
        'Fixture Sans',
      ]);
      await select.selectOption({ label: 'Fixture Sans' });
      // The album carries the font: its files joined assets/ and the records joined the book.
      await expect
        .poll(async () =>
          evalEditor(
            page,
            (e) =>
              Object.values(e.getState().book.assets).filter((a) => (a as AssetRef).kind === 'font')
                .length,
            null,
          ),
        )
        .toBe(1);
    });

    const book = await savedBook(page, albums, 'polices');
    const fonts = Object.values(book.assets).filter((a) => a.kind === 'font');
    expect(fonts.map((a) => a.originalName)).toEqual(['Fixture Sans|400|normal.ttf']);
    await access(join(albums, 'polices.travelbook', fonts[0]!.file));
    await app.close();

    await test.step('on a fresh user-data folder the album still draws the font', async () => {
      app = await launchApp(join(work, 'fresh user data'));
      await pickFolders(app, join(albums, 'polices.travelbook'));
      page = await app.firstWindow();
      await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
      await expect(page.getByRole('img', { name: /Double page|Couverture/ }).first()).toBeVisible();
      await evalEditor(
        page,
        (e) => {
          e.setState({ currentSpreadId: e.getState().book.spreads[1]!.id });
        },
        null,
      );
      await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
      // The album declared its own copy of the font, from the project folder.
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Fixture Sans'),
          ),
        )
        .toBe(true);
      const loaded = await page.evaluate(async () => {
        const faces = await document.fonts.load('16px "Fixture Sans"');
        return faces.length;
      });
      expect(loaded).toBe(1);
    });
  } finally {
    await app.close().catch(() => undefined);
  }
});
