import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import type { Book, PhotoElement } from '@travelbook/core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureFixtures,
  fixturePath,
  type FixtureName,
} from '../../../tests/fixtures/make-fixtures';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

/** The e2e build exposes the editor store (see `App.tsx`). */
interface EditorHandle {
  getState(): {
    book: Book;
    history: { labels: string[] };
    apply(op: (book: Book) => Book, label: string): void;
  };
  setState(patch: { currentSpreadId?: string; activePage?: string }): void;
}
const evalEditor = <R, A>(page: Page, fn: (e: EditorHandle, arg: A) => R, arg: A) =>
  page.evaluate(
    ([source, a]) =>
      new Function('e', 'a', `return (${source})(e, a)`)(
        (window as unknown as { __tbEditor: EditorHandle }).__tbEditor,
        a,
      ) as R,
    [fn.toString(), arg] as const,
  );

let work: string;
let albums: string;

test.beforeAll(async () => {
  await ensureFixtures();
});
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-templates-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const PHOTOS: FixtureName[] = ['landscape.jpg', 'portrait-o6.jpg', 'day1.jpg'];

/**
 * A new album on its first inner spread (pages 2 and 3), three imported photos placed in frames
 * on the left page, and the Modèles panel open.
 */
async function openAlbum(app: ElectronApplication, page: Page, title: string) {
  await pickFolders(app, albums);
  await createFromHome(page, title);
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
  }, PHOTOS.map(fixturePath));
  await page.getByRole('button', { name: 'Importer des photos' }).click();
  await expect(page.locator('.photo-thumb')).toHaveCount(PHOTOS.length);
  await evalEditor(
    page,
    (e) => {
      const book = e.getState().book;
      const id = book.spreads[1]!.id;
      const frames = Object.keys(book.assets).map((assetId, i) => ({
        id: `frame${i}`,
        type: 'photo',
        assetId,
        crop: { scale: 1, cx: 0.5, cy: 0.5 },
        flipH: false,
        flipV: false,
        mask: { kind: 'rect' },
        border: null,
        shadow: null,
        adjust: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, vignette: 0 },
        edge: null,
        x: 20,
        y: 10 + i * 90,
        w: 80,
        h: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
      }));
      e.setState({ currentSpreadId: id, activePage: 'left' });
      e.getState().apply(
        (b) => ({
          ...b,
          spreads: b.spreads.map((s) =>
            s.id === id ? { ...s, elements: [...s.elements, ...(frames as never[])] } : s,
          ),
        }),
        'Ajouter',
      );
    },
    null,
  );
  await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Modèles' }).click();
  await expect(page.getByRole('tablist', { name: 'Type de modèles' })).toBeVisible();
}

const tiles = (page: Page): Locator => page.locator('.shell-panel .tpl-tile');
/** The template the page last took: the pressed tile. */
const applied = (page: Page) =>
  page.locator('.shell-panel .tpl-tile[aria-pressed="true"]').getAttribute('data-template-id');
/** Frames of a page of the spread in view, from the book in memory. */
const frames = (page: Page, side: 'left' | 'right') =>
  evalEditor(
    page,
    (e, which) =>
      (e.getState().book.spreads[1]!.elements as PhotoElement[])
        .filter((el) => el.type === 'photo' && el.x + el.w / 2 < 210 === (which === 'left'))
        .map((el) => ({ assetId: el.assetId, w: el.w, h: el.h })),
    side,
  );
/** The photo frames drawn on the canvas, and how many of them show a photo. */
const drawn = async (page: Page) => ({
  frames: await page.locator('.canvas-paper [data-element-type="photo"]').count(),
  filled: await page.locator('.canvas-paper [data-element-type="photo"] img').count(),
});
const widthsOnCanvas = (page: Page) =>
  page
    .locator('.canvas-paper [data-element-type="photo"]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().width * 100) / 100),
    );

test('applies a 3-photo template, filters by photo count, follows the spacing sliders and shuffles', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await openAlbum(app, page, 'Modèles');

    await test.step('only the tiles in view are drawn, and the others are drawn when scrolled to', async () => {
      const total = await tiles(page).count();
      expect(total).toBeGreaterThan(150);
      const drawnTiles = () => page.locator('.shell-panel .tpl-tile svg').count();
      const first = await drawnTiles();
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(total / 2);
      const last = tiles(page).last();
      await last.scrollIntoViewIfNeeded();
      await expect(last.locator('svg')).toBeVisible();
    });

    await test.step('a 3-photo template fills 3 slots, and the photo count chip shows only 3-photo templates', async () => {
      await page.getByRole('button', { name: '3 photos', exact: true }).click();
      const count = await tiles(page).count();
      expect(count).toBeGreaterThanOrEqual(12);
      const photos = await tiles(page).evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-photos')),
      );
      expect(new Set(photos)).toEqual(new Set(['3']));

      await page.locator('.shell-panel .tpl-tile[data-template-id="b-p3-colonnes-m"]').click();
      expect(await drawn(page)).toEqual({ frames: 3, filled: 3 });
      expect((await frames(page, 'left')).map((f) => f.assetId !== null)).toEqual([
        true,
        true,
        true,
      ]);
      expect(await applied(page)).toBe('b-p3-colonnes-m');
      // One click, one undo step.
      expect(await evalEditor(page, (e) => e.getState().history.labels.slice(-1), null)).toEqual([
        'Appliquer un modèle',
      ]);
    });

    await test.step('the gap slider moves the frames, as one undo step', async () => {
      const before = await widthsOnCanvas(page);
      const gap = page.getByLabel('Espacement');
      await gap.focus();
      for (let i = 0; i < 6; i++) await gap.press('ArrowRight');
      const after = await widthsOnCanvas(page);
      expect(after.every((w, i) => w < before[i]!)).toBe(true);
      expect(await drawn(page)).toEqual({ frames: 3, filled: 3 });
      const labels = await evalEditor(page, (e) => e.getState().history.labels, null);
      expect(labels.filter((l) => l === "Régler la marge et l'espacement")).toHaveLength(1);
    });

    await test.step('"Mise en page aléatoire" lays the page out with another 3-photo template', async () => {
      const was = await applied(page);
      await page.getByRole('button', { name: 'Mise en page aléatoire, page 2' }).click();
      const now = await applied(page);
      expect(now).not.toBe(was);
      expect(now).toMatch(/^b-p3-/);
      expect(await drawn(page)).toEqual({ frames: 3, filled: 3 });
      expect((await frames(page, 'left')).map((f) => f.assetId !== null)).toEqual([
        true,
        true,
        true,
      ]);
    });

    await test.step('the page saved as a model applies to the other page', async () => {
      await page.getByRole('button', { name: 'Enregistrer comme modèle' }).click();
      await expect(page.getByRole('tab', { name: 'Mes modèles' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const rows = page.locator('.shell-panel .tpl-mine');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText('Mon modèle 1');
      // Point the templates at page 3, and take the model.
      await page.getByRole('button', { name: 'Cibler la page 3' }).click();
      await rows.first().locator('.tpl-tile').click();
      const right = await frames(page, 'right');
      expect(right).toHaveLength(3);
      expect((await frames(page, 'left')).filter((f) => f.assetId !== null)).toHaveLength(3);
    });
  } finally {
    await app.close();
  }
});

test('with the cover in view the list shows covers, and any page template goes on the front', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await openAlbum(app, page, 'Couverture');
    await evalEditor(
      page,
      (e) => e.setState({ currentSpreadId: e.getState().book.cover.id }),
      null,
    );
    await expect(page.getByText('Pour la face avant de la couverture')).toBeVisible();

    const ids = () =>
      tiles(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-template-id')!));
    const covers = await ids();
    expect(covers.length).toBeGreaterThanOrEqual(30);
    expect(covers.every((id) => id.startsWith('b-c-'))).toBe(true);

    await page.getByRole('button', { name: '1 photo', exact: true }).click();
    await page.locator('.shell-panel .tpl-tile[data-template-id="b-c-polaroid"]').click();
    const cover = () =>
      evalEditor(
        page,
        (e) =>
          e
            .getState()
            .book.cover.elements.filter((el) => el.type === 'photo')
            .map((el) => ({ x: el.x, w: el.w })),
        null,
      );
    expect(await cover()).toHaveLength(1);
    expect((await cover())[0]!.x).toBeGreaterThan(210);

    // A page template goes on the front too, once the page templates are listed.
    await page.getByRole('button', { name: '1 photo', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Afficher aussi les modèles de page' }).check();
    const page3 = page.locator('.shell-panel .tpl-tile[data-template-id="b-p3-bandes-m"]');
    await expect(page3).toBeVisible();
    await page3.click();
    const onFront = await cover();
    expect(onFront).toHaveLength(3);
    expect(onFront.every((f) => f.x > 210)).toBe(true);
    expect(await applied(page)).toBe('b-p3-bandes-m');
  } finally {
    await app.close();
  }
});
