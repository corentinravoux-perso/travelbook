import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Book, PhotoElement } from '@travelbook/core';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
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
    flush(): Promise<void>;
    setZoom(zoom: number): void;
  };
  setState(patch: { currentSpreadId?: string; selection?: string[] }): void;
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
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-look-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const pickFiles = (app: ElectronApplication, names: FixtureName[]) =>
  app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
  }, names.map(fixturePath));

async function savedFrame(page: Page): Promise<PhotoElement> {
  await evalEditor(page, (e) => e.getState().flush(), null);
  const book = JSON.parse(
    await readFile(join(albums, 'look.travelbook', 'book.json'), 'utf8'),
  ) as Book;
  return book.spreads[1]!.elements[0] as PhotoElement;
}

/** The titles of the last `n` undo steps. */
const lastSteps = (page: Page, n: number) =>
  evalEditor(page, (e, count) => e.getState().history.labels.slice(-count), n);

test('the look section applies a preset, the vignette, a soft edge and an irregular mask', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await createFromHome(page, 'Look');
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();

    // One imported photo, in a frame of its own on the first inner spread, selected.
    await pickFiles(app, ['day1.jpg']);
    await page.getByRole('button', { name: 'Importer des photos' }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(1);
    await evalEditor(
      page,
      (e) => {
        const book = e.getState().book;
        const spreadId = book.spreads[1]!.id;
        const assetId = Object.keys(book.assets)[0]!;
        const frame = {
          id: 'look-frame',
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
          w: 100,
          h: 70,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
        };
        e.setState({ currentSpreadId: spreadId });
        e.getState().apply(
          (b) => ({
            ...b,
            spreads: b.spreads.map((s) =>
              s.id === spreadId ? { ...s, elements: [...s.elements, frame as never] } : s,
            ),
          }),
          'Ajouter',
        );
        e.getState().setZoom(1);
        e.setState({ selection: ['look-frame'] });
      },
      null,
    );
    const inspector = page.getByTestId('photo-inspector');
    await expect(inspector).toBeVisible();
    // What the canvas draws of the frame, read from the page itself.
    const frameStyle = () =>
      page
        .locator('.canvas-paper [data-element-id="look-frame"] [data-role="frame"]')
        .evaluate((el) => {
          const css = getComputedStyle(el);
          return { mask: css.maskImage, clip: css.clipPath };
        });

    // A preset: the changed adjustments reach the book and the canvas image.
    await inspector.getByRole('button', { name: 'Monochrome' }).click();
    expect((await savedFrame(page)).adjust).toEqual({
      brightness: 1,
      contrast: 1.15,
      saturation: 1,
      grayscale: 1,
      sepia: 0,
      vignette: 0,
    });
    await expect(page.locator('.canvas-paper [data-element-id="look-frame"] img')).toHaveCSS(
      'filter',
      /grayscale\(1\)/,
    );
    await expect(inspector.getByRole('button', { name: 'Monochrome' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The vignette preset replaces the adjustments by its own, and the canvas draws the overlay.
    await inspector.getByRole('button', { name: 'Vignette', exact: true }).click();
    expect((await savedFrame(page)).adjust).toMatchObject({ grayscale: 0, vignette: 0.5 });
    await expect(
      page.locator('.canvas-paper [data-element-id="look-frame"] [data-role="vignette"]'),
    ).toHaveCount(1);

    // A drag on the vignette slider is one undo step, here the arrow keys held on it.
    const vignette = inspector.getByLabel('Vignettage');
    await vignette.focus();
    for (let i = 0; i < 3; i++) await vignette.press('ArrowRight');
    expect((await savedFrame(page)).adjust.vignette).toBeCloseTo(0.53, 5);
    expect(await lastSteps(page, 2)).toEqual(['Appliquer un style', 'Modifier le vignettage']);

    // The soft edge: 4 mm reaches the book, and the canvas masks the frame.
    expect((await frameStyle()).mask).toBe('none');
    await inspector.getByLabel('Bords adoucis').fill('4');
    expect((await savedFrame(page)).edge).toEqual({ feather: 4 });
    await expect(inspector).toContainText('4 mm');
    expect((await frameStyle()).mask).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(await lastSteps(page, 1)).toEqual(['Adoucir les bords']);

    // An irregular mask: a clip-path on the frame, on top of the soft edge.
    await inspector.getByRole('button', { name: 'Bord déchiré' }).click();
    expect((await savedFrame(page)).mask).toEqual({ kind: 'preset', preset: 'torn' });
    const shaped = await frameStyle();
    expect(shaped.clip).toMatch(/^path\(/);
    expect(shaped.mask).toMatch(/^url\(/);
    await expect(inspector.getByRole('button', { name: 'Bord déchiré' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Each of those was one step: undoing the mask leaves the soft edge, then the edge goes.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    expect((await savedFrame(page)).mask).toEqual({ kind: 'rect' });
    expect((await savedFrame(page)).edge).toEqual({ feather: 4 });
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    expect((await savedFrame(page)).edge).toBeNull();

    // "Original" gives back the neutral adjustments, the vignette included.
    await inspector.getByRole('button', { name: 'Original' }).click();
    expect((await savedFrame(page)).adjust).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
      sepia: 0,
      vignette: 0,
    });
    await expect(
      page.locator('.canvas-paper [data-element-id="look-frame"] [data-role="vignette"]'),
    ).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});
