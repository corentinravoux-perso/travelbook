import { expect, test, type Page } from '@playwright/test';
import type { Book } from '@travelbook/core';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

/** The e2e build exposes the editor store (see `App.tsx`). */
interface EditorHandle {
  getState(): { flush(): Promise<void> };
}
const flush = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __tbEditor: EditorHandle }).__tbEditor.getState().flush(),
  );

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-spreads-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const bookFile = (slug: string) => join(albums, `${slug}.travelbook`, 'book.json');

async function savedBook(page: Page, slug: string): Promise<Book> {
  await flush(page);
  return JSON.parse(await readFile(bookFile(slug), 'utf8')) as Book;
}

/** What is written under each tile of the strip, cover first. */
const captions = (page: Page) =>
  page.locator('.shell-strip .tile .tile__caption').allTextContents();

/** The ids of the spreads, in the strip. */
const stripIds = (page: Page) =>
  page
    .locator('.shell-strip .tile')
    .evaluateAll((tiles) => tiles.map((t) => t.dataset['spreadId']));

async function open(page: Page, title: string) {
  await createFromHome(page, title);
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
}

test('adds, moves and deletes spreads and the numbering follows', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await open(page, 'Spreads');

    const strip = page.getByRole('navigation', { name: 'Doubles pages' });
    await expect(strip.getByText('24 pages')).toBeVisible();
    expect((await captions(page)).slice(0, 4)).toEqual(['Couverture', '1', '2–3', '4–5']);

    // Two new spreads: 24 -> 28 pages. Each goes after the one being edited.
    await page.getByRole('button', { name: 'Ajouter une double page' }).click();
    await page.getByRole('button', { name: 'Ajouter une double page' }).click();
    await expect(strip.getByText('28 pages')).toBeVisible();
    let names = await captions(page);
    expect(names).toHaveLength(1 + 15);
    expect(names.at(-1)).toBe('28');
    expect(names[1]).toBe('1');
    expect(names.slice(2, -1)).toEqual(
      Array.from({ length: 13 }, (_, i) => `${2 + 2 * i}–${3 + 2 * i}`),
    );

    // Move one: drag the second inner spread before the first inner one.
    const ids = await stripIds(page);
    const moved = ids[3]!;
    const tile = (id: string) => page.locator(`.shell-strip .tile[data-spread-id="${id}"]`);
    await tile(moved).dragTo(tile(ids[2]!), { targetPosition: { x: 4, y: 20 } });
    await expect
      .poll(() => stripIds(page))
      .toEqual([ids[0], ids[1], moved, ids[2], ...ids.slice(4)]);

    // The keyboard reorders too: Alt+Right moves the spread one place later.
    await tile(moved).click();
    await page.keyboard.press('Alt+ArrowRight');
    await expect
      .poll(() => stripIds(page))
      .toEqual([ids[0], ids[1], ids[2], moved, ...ids.slice(4)]);

    // Delete one: the moved spread is the one shown.
    await page.getByRole('button', { name: 'Supprimer la double page' }).click();
    await expect(strip.getByText('26 pages')).toBeVisible();
    names = await captions(page);
    expect(names.at(-1)).toBe('26');
    expect(await stripIds(page)).not.toContain(moved);

    const saved = await savedBook(page, 'spreads');
    expect(saved.spreads).toHaveLength(14);
    expect(saved.spreads.map((s) => s.kind)).toEqual(['first', ...Array(12).fill('inner'), 'last']);
  } finally {
    await app.close();
  }
});

test('warns when the page count breaks the page rule, without blocking', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await open(page, 'Rule');
    await page.getByRole('button', { name: 'Ajouter une double page' }).click();
    await page.getByRole('button', { name: 'Supprimer la double page' }).click();
    await page.getByRole('button', { name: 'Supprimer la double page' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '22 pages' })).toContainText(
      'au moins 24 pages',
    );
    await page.getByRole('button', { name: 'Ajouter une double page' }).click();
    await page.getByRole('button', { name: 'Ajouter une double page' }).click();
    await expect(page.getByText('26 pages')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a spine width of 12 mm makes the cover 432 mm wide', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await open(page, 'Spine');
    await page.getByRole('button', { name: 'Couverture', exact: true }).click();
    const layer = page.locator('.canvas-paper [data-role="spread-layer"]');
    await expect(layer).toHaveAttribute('style', /width: 420mm/);

    await page.getByRole('button', { name: 'Réglages du livre' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages du livre' });
    await dialog.getByLabel('Largeur du dos').fill('12');
    await dialog.getByRole('button', { name: 'Appliquer' }).click();

    await expect(layer).toHaveAttribute('style', /width: 432mm/);
    await expect(page.locator('.spine-zone')).toBeVisible();
    expect((await savedBook(page, 'spine')).spineWidth).toBe(12);

    // The spine takes text turned by 90°.
    await page.getByRole('button', { name: 'Texte sur le dos' }).click();
    const cover = (await savedBook(page, 'spine')).cover;
    expect(cover.elements).toHaveLength(1);
    expect(cover.elements[0]).toMatchObject({ type: 'text', rotation: 90 });
  } finally {
    await app.close();
  }
});

test('the overview reorders spreads by drag and shows the order in book.json', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await open(page, 'Overview');
    const before = (await savedBook(page, 'overview')).spreads.map((s) => s.id);

    await page.getByRole('button', { name: 'Vue d’ensemble des doubles pages' }).click();
    const overview = page.getByRole('dialog', { name: 'Vue d’ensemble' });
    await expect(overview).toBeVisible();
    const tiles = overview.locator('.tile');
    await expect(tiles).toHaveCount(1 + 13);
    await expect(tiles.first()).toHaveAttribute('data-kind', 'cover');

    const lastInner = before.at(-2)!;
    const tile = (id: string) => overview.locator(`.tile[data-spread-id="${id}"]`);
    await tile(lastInner).dragTo(tile(before[1]!), { targetPosition: { x: 4, y: 40 } });

    const expected = [before[0], lastInner, ...before.slice(1, -2), before.at(-1)];
    await expect
      .poll(async () => (await savedBook(page, 'overview')).spreads.map((s) => s.id))
      .toEqual(expected);

    // Insert point between two thumbnails, then Escape closes the overview.
    await overview.getByRole('button', { name: 'Insérer une double page ici' }).first().click();
    await expect(overview.locator('.tile')).toHaveCount(1 + 14);
    await page.keyboard.press('Escape');
    await expect(overview).toHaveCount(0);

    // A click on a thumbnail opens that spread.
    await page.getByRole('button', { name: 'Vue d’ensemble des doubles pages' }).click();
    await overview.locator(`.tile[data-spread-id="${lastInner}"]`).click();
    await expect(overview).toHaveCount(0);
    await expect(page.locator('.canvas-paper')).toHaveAttribute('data-spread-id', lastInner);
  } finally {
    await app.close();
  }
});

test('the cover thumbnail is written to the project and shown on the home screen', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await open(page, 'Cover');
    const file = join(albums, 'cover.travelbook', 'cache', 'cover-thumb.jpg');
    await expect
      .poll(
        () =>
          stat(file).then(
            (s) => s.size,
            () => 0,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(300);
    const jpeg = await readFile(file);
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    await page.getByRole('button', { name: 'Accueil' }).click();
    const image = page.getByRole('img', { name: 'Couverture de Cover' });
    await expect(image).toBeVisible();
    const size = await image.evaluate((img: HTMLImageElement) => [
      img.naturalWidth,
      img.naturalHeight,
    ]);
    expect(Math.max(...size!)).toBe(320);
  } finally {
    await app.close();
  }
});
