/**
 * The whole scenario of the app, on the installed layout (see `packaged.spec.ts` for how to build
 * and point at it): a new book, twelve photos, templates on three spreads, a caption, a sticker, a
 * pattern background, the cover, both exports, then quit and reopen. The reopened book must be
 * the one that was saved.
 *
 * The packaged app has no test handle on its editor, so everything is done through the interface
 * the user has, and the result is read from `book.json` on disk.
 *
 *   npm run dist:linux && npm run e2e:packaged
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { Book, Element, Spread } from '@travelbook/core';
import { stressPhoto } from '../../../../tests/fixtures/make-stress-book';
import type { TbApi } from '../../src/shared/api';
import { createFromHome, pickFolders } from '../home';
import {
  expectNoMainErrors,
  launchPackaged,
  quitPackaged,
  requirePackagedApp,
} from '../packagedApp';

test.describe.configure({ mode: 'serial', timeout: 300_000 });

const TITLE = 'Scénario complet';
const SLUG = 'scenario-complet';
const PHOTOS = 12;
const CAPTION = 'Un matin sur le port de Reykjavik';
const COVER_TITLE = 'Islande, été 2026';

let work: string;
let userData: string;
let albums: string;
let photoFiles: string[];
let exportedImages: string;
let exportedPdf: string;

test.beforeAll(async () => {
  await requirePackagedApp();
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-scenario-'));
  userData = join(work, 'user data');
  albums = join(work, 'albums');
  exportedImages = join(work, 'images');
  exportedPdf = join(work, 'pdf');
  const photos = join(work, 'photos');
  await Promise.all([albums, exportedImages, exportedPdf, photos].map((d) => mkdir(d)));
  // Twelve different pictures of 1800 x 1200 px (every third one upright), named IMG_01 to IMG_12.
  photoFiles = await Promise.all(
    Array.from({ length: PHOTOS }, async (_, i) => {
      const file = join(photos, `IMG_${String(i + 1).padStart(2, '0')}.jpg`);
      const upright = i % 3 === 2;
      await writeFile(file, await stressPhoto(i, upright ? 1200 : 1800, upright ? 1800 : 1200));
      return file;
    }),
  );
});
test.afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

const bookFile = (): string => join(albums, `${SLUG}.travelbook`, 'book.json');
const readBook = async (): Promise<Book> => JSON.parse(await readFile(bookFile(), 'utf8')) as Book;

/** Wait for the autosave to catch up with the screen, then read the book it wrote. */
async function savedBook(page: Page, until: (book: Book) => boolean = () => true): Promise<Book> {
  await expect(page.getByRole('banner', { name: 'Barre du haut' })).toContainText('Enregistré');
  await expect.poll(async () => until(await readBook())).toBe(true);
  return readBook();
}

const inner = (book: Book, n: number): Spread => book.spreads[n] as Spread;
const ofType = <T extends Element['type']>(spread: Spread, type: T) =>
  spread.elements.filter((e): e is Extract<Element, { type: T }> => e.type === type);
const textOf = (doc: unknown): string => {
  const out: string[] = [];
  const walk = (n: { text?: string; content?: unknown[] }) => {
    if (typeof n.text === 'string') out.push(n.text);
    for (const c of n.content ?? []) walk(c as Parameters<typeof walk>[0]);
  };
  walk(doc as Parameters<typeof walk>[0]);
  return out.join('');
};

/** The tile of a spread in the strip: 0 is page 1, 1 is pages 2 and 3, and so on. */
const spreadTile = (page: Page, n: number): Locator => page.locator('.strip__list .tile').nth(n);
const coverTile = (page: Page): Locator => page.locator('.shell-strip > .tile');
const photoFrames = (page: Page): Locator =>
  page.locator('.canvas-paper [data-element-type="photo"]');

/** Open a panel of the rail. */
const openPanel = (page: Page, name: string): Promise<void> =>
  page.getByRole('button', { name, exact: true }).click();

/**
 * Put `count` photos of the tray, from the `first` one, on the spread in view: tick them, then drag
 * them onto the page at `at` (fractions of the canvas). They land as as many frames, in one drop.
 */
async function dropPhotos(page: Page, first: number, count: number, at: { x: number; y: number }) {
  await openPanel(page, 'Photos');
  const thumbs = page.locator('.photo-thumb');
  for (let i = 0; i < count; i++) {
    await thumbs.nth(first + i).click({ modifiers: i === 0 ? [] : ['Control'] });
  }
  const paper = page.locator('.canvas-paper');
  const box = (await paper.boundingBox())!;
  await thumbs
    .nth(first)
    .dragTo(paper, { targetPosition: { x: box.width * at.x, y: box.height * at.y } });
  await expect(photoFrames(page)).toHaveCount(count);
}

/**
 * Apply a template of the Modèles panel by its id. A page template goes on the page `target` names
 * (the label of its button, "Cibler la page 2"); a spread template, or none, on the default one.
 */
async function applyTemplate(page: Page, id: string, target?: string): Promise<void> {
  await openPanel(page, 'Modèles');
  await expect(page.getByRole('tablist', { name: 'Type de modèles' })).toBeVisible();
  if (target) await page.getByRole('button', { name: target }).click();
  const tile = page.locator(`.shell-panel .tpl-tile[data-template-id="${id}"]`);
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
}

test('a book from nothing to both exports, then quit', async () => {
  const { app, stderr } = await launchPackaged(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator('h1')).toHaveText('travelbook');

    await test.step('a new book opens on its first spread', async () => {
      await pickFolders(app, albums);
      await createFromHome(page, TITLE);
      await expect(page.getByRole('img', { name: 'Double page 1' })).toBeVisible();
      const book = await savedBook(page);
      expect(book.title).toBe(TITLE);
      expect(book.spreads).toHaveLength(13);
    });

    await test.step('twelve photos are imported, none of them touched', async () => {
      await app.evaluate(({ dialog }, files) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
      }, photoFiles);
      await openPanel(page, 'Photos');
      await page.getByRole('button', { name: 'Importer des photos' }).click();
      await expect(page.locator('.photos__count')).toHaveText('12 photos');
      const book = await savedBook(page, (b) => Object.keys(b.assets).length === PHOTOS);
      const assets = Object.values(book.assets);
      expect(assets.map((a) => a.kind)).toEqual(Array(PHOTOS).fill('photo'));
      // An original is a byte-for-byte copy of its source.
      for (const asset of assets) {
        const source = photoFiles.find((f) => f.endsWith(asset.originalName))!;
        const [copy, original] = await Promise.all([
          readFile(join(albums, `${SLUG}.travelbook`, asset.file)),
          readFile(source),
        ]);
        expect(copy.equals(original)).toBe(true);
      }
    });

    await test.step('templates on three spreads: four photos each, three different layouts', async () => {
      // Pages 2 and 3: four boxes and a caption line, on the left page.
      await spreadTile(page, 1).click();
      await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
      await dropPhotos(page, 0, 4, { x: 0.25, y: 0.5 });
      await applyTemplate(page, 'b-p4-cases-c', 'Cibler la page 2');

      // Pages 4 and 5: the four-box template made for a whole spread.
      await spreadTile(page, 2).click();
      await expect(page.getByRole('img', { name: 'Double page 3' })).toBeVisible();
      await dropPhotos(page, 4, 4, { x: 0.25, y: 0.5 });
      await applyTemplate(page, 'b-d-quatre');

      // Pages 6 and 7: a mosaic, on the right page.
      await spreadTile(page, 3).click();
      await expect(page.getByRole('img', { name: 'Double page 4' })).toBeVisible();
      await dropPhotos(page, 8, 4, { x: 0.75, y: 0.5 });
      await applyTemplate(page, 'b-p4-mosaique-m', 'Cibler la page 7');

      const book = await savedBook(page, (b) =>
        [1, 2, 3].every((n) => ofType(inner(b, n), 'photo').length >= 4),
      );
      const used = [1, 2, 3].flatMap((n) => ofType(inner(book, n), 'photo').map((p) => p.assetId));
      expect(new Set(used).size).toBe(PHOTOS);
      expect(used.every((id) => id !== null && book.assets[id] !== undefined)).toBe(true);
      // Three layouts: the frames are not at the same places.
      const layouts = [1, 2, 3].map((n) =>
        JSON.stringify(ofType(inner(book, n), 'photo').map((p) => [p.x, p.y, p.w, p.h])),
      );
      expect(new Set(layouts).size).toBe(3);
    });

    await test.step('a caption is typed into the text frame of the first template', async () => {
      await spreadTile(page, 1).click();
      await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
      const caption = page.locator('.canvas-paper .tb-text').first();
      await caption.dblclick();
      const editor = page.getByTestId('text-editor');
      await expect(editor.locator('.ProseMirror')).toBeFocused();
      await page.keyboard.type(CAPTION);
      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      const book = await savedBook(page, (b) =>
        ofType(inner(b, 1), 'text').some((t) => textOf(t.doc) === CAPTION),
      );
      expect(ofType(inner(book, 1), 'text').map((t) => textOf(t.doc))).toContain(CAPTION);
    });

    await test.step('a sticker goes on the page', async () => {
      await openPanel(page, 'Stickers');
      await page.getByRole('searchbox', { name: 'Rechercher un sticker' }).fill('avion');
      const first = page.locator('.stk-tile__button').first();
      await expect(first).toBeVisible();
      await first.click();
      const book = await savedBook(page, (b) => ofType(inner(b, 1), 'sticker').length === 1);
      const [sticker] = ofType(inner(book, 1), 'sticker');
      const asset = book.assets[sticker!.assetId];
      expect(asset).toMatchObject({ kind: 'sticker' });
      expect(asset?.licence?.licence).toBeTruthy();
      await access(join(albums, `${SLUG}.travelbook`, asset!.file));
    });

    await test.step('a pattern is the background of the right page', async () => {
      await spreadTile(page, 2).click();
      await expect(page.getByRole('img', { name: 'Double page 3' })).toBeVisible();
      await openPanel(page, 'Fonds');
      await page.locator('[data-target="right"]').click();
      await page.getByRole('tab', { name: 'Motif' }).click();
      await page.getByRole('button', { name: 'Petits pois', exact: true }).click();
      await expect(page.locator('.canvas-paper [data-background="right"]')).toHaveAttribute(
        'data-background-kind',
        'pattern',
      );
      const book = await savedBook(page, (b) => inner(b, 2).background.right !== undefined);
      const right = inner(book, 2).background.right;
      expect(right).toMatchObject({ kind: 'pattern' });
      expect(book.assets[(right as { assetId: string }).assetId]).toMatchObject({
        kind: 'pattern',
        licence: { licence: 'CC0-1.0' },
      });
    });

    await test.step('the cover takes a template, a photo and a title', async () => {
      await coverTile(page).click();
      await applyTemplate(page, 'b-c-photo-titre-legende');
      await expect(photoFrames(page)).toHaveCount(1);
      // A photo dragged onto the cover's frame fills it.
      await openPanel(page, 'Photos');
      const frame = photoFrames(page).first();
      // The four photos of the last drop are still ticked, and a drag takes the whole selection:
      // a plain click leaves only this photo ticked.
      const thumb = page.locator('.photo-thumb').nth(11);
      await thumb.click();
      await thumb.dragTo(frame);
      await expect(frame.locator('img')).toBeVisible();
      const title = page.locator('.canvas-paper .tb-text').first();
      await title.dblclick();
      await expect(page.getByTestId('text-editor').locator('.ProseMirror')).toBeFocused();
      await page.keyboard.type(COVER_TITLE);
      await page.keyboard.press('Escape');
      const book = await savedBook(page, (b) =>
        ofType(b.cover, 'text').some((t) => textOf(t.doc) === COVER_TITLE),
      );
      expect(ofType(book.cover, 'photo').filter((p) => p.assetId !== null)).toHaveLength(1);
    });

    const exportWith = async (
      preset: string,
      outDir: string,
      setup: (d: Locator) => Promise<void>,
    ) => {
      await pickFolders(app, outDir);
      await page.getByRole('button', { name: 'Exporter', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Exporter le livre' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Vérification en cours…')).toBeHidden();
      await dialog.getByLabel('Préréglage', { exact: true }).selectOption({ label: preset });
      await dialog.getByRole('button', { name: 'Choisir…' }).click();
      await expect(dialog.getByLabel('Dossier de destination')).toHaveValue(outDir);
      await setup(dialog);
      await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible({
        timeout: 240_000,
      });
      await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };

    await test.step('the book is exported as one image per page', async () => {
      await exportWith('Imprimeur en ligne (images)', exportedImages, async (dialog) => {
        await dialog.getByLabel('Résolution', { exact: true }).selectOption('150');
      });
      const files = (await readdir(exportedImages)).sort();
      // The cover is one sheet; the 24 pages follow.
      expect(files.filter((f) => f.startsWith('page-'))).toHaveLength(24);
      expect(files).toHaveLength(25);
      const meta = await sharp(join(exportedImages, 'page-002.jpg')).metadata();
      // 216 x 303 mm (210 x 297 with the 3 mm bleed) at 150 dpi.
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1276, 1789]);
      // Page 2 holds the photos, the caption and the sticker: it is not the white of the paper.
      const { channels } = await sharp(join(exportedImages, 'page-002.jpg')).stats();
      expect(Math.min(...channels.map((c) => c.mean))).toBeLessThan(235);
    });

    await test.step('the book is exported as a print PDF', async () => {
      await exportWith('Impression sur mesure (PDF)', exportedPdf, async (dialog) => {
        // The PDF route takes the resolution of the raster fallback from the page, not the dialog.
        await expect(dialog.getByLabel('Préréglage', { exact: true })).toHaveValue(
          'Impression sur mesure (PDF)',
        );
      });
      const files = (await readdir(exportedPdf)).sort();
      expect(files).toEqual([`${SLUG}-couverture.pdf`, `${SLUG}-interieur.pdf`]);
      const inside = await PDFDocument.load(await readFile(join(exportedPdf, files[1]!)));
      expect(inside.getPageCount()).toBe(24);
      const first = inside.getPage(0);
      const mm = (points: number): number => (points * 25.4) / 72;
      // The page is 210 x 297 mm, with 3 mm of bleed; the crop marks add a margin around it.
      expect(
        [first.getTrimBox().width, first.getTrimBox().height].map((v) => Math.round(mm(v))),
      ).toEqual([210, 297]);
      expect(
        [first.getBleedBox().width, first.getBleedBox().height].map((v) => Math.round(mm(v))),
      ).toEqual([216, 303]);
      expect(first.getMediaBox().width).toBeGreaterThan(first.getBleedBox().width);
      const cover = await PDFDocument.load(await readFile(join(exportedPdf, files[0]!)));
      expect(cover.getPageCount()).toBe(1);
    });
  } finally {
    await quitPackaged(app).catch(() => app.close().catch(() => {}));
  }
  expectNoMainErrors(stderr());
});

test('reopened, the book is the one that was saved', async () => {
  const before = await readFile(bookFile(), 'utf8');
  const beforeTime = (await stat(bookFile())).mtimeMs;

  const { app, stderr } = await launchPackaged(userData);
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: new RegExp(TITLE) }).click();
    await expect(page.getByRole('img', { name: 'Double page 1' })).toBeVisible();
    await expect(page.locator('.photos__count, .photo-thumb').first()).toBeVisible();

    // What was made is on screen again.
    await spreadTile(page, 1).click();
    await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
    await expect(photoFrames(page)).toHaveCount(4);
    await expect(page.locator('.canvas-paper .tb-text', { hasText: CAPTION })).toBeVisible();
    await expect(page.locator('.canvas-paper [data-element-type="sticker"]')).toHaveCount(1);
    await spreadTile(page, 2).click();
    await expect(page.locator('.canvas-paper [data-background="right"]')).toHaveAttribute(
      'data-background-kind',
      'pattern',
    );
    await coverTile(page).click();
    await expect(page.locator('.canvas-paper .tb-text', { hasText: COVER_TITLE })).toBeVisible();

    // The book as main reads and checks it is the one on disk, field for field.
    const opened = await page.evaluate(
      async (dir) => {
        const info = await (window as unknown as { tb: TbApi }).tb.project.open(dir);
        return info === null ? null : { book: info.book, missing: info.missing };
      },
      join(albums, `${SLUG}.travelbook`),
    );
    expect(opened?.missing).toEqual([]);
    expect(opened?.book).toEqual(JSON.parse(before));
  } finally {
    await quitPackaged(app).catch(() => app.close().catch(() => {}));
  }
  expectNoMainErrors(stderr());

  // book.json holds no save time (the only timestamps in it are the photos' own capture times,
  // which never change), so the whole file is compared. Opening and closing did not rewrite it.
  const after = await readFile(bookFile(), 'utf8');
  expect(JSON.parse(after)).toEqual(JSON.parse(before));
  expect(after).toBe(before);
  expect((await stat(bookFile())).mtimeMs).toBe(beforeTime);
});
