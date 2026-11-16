import {
  expect,
  test,
  type CDPSession,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import type { Book, Element, PhotoElement } from '@travelbook/core';
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
    zoom: number;
    selection: string[];
    history: { labels: string[] };
    apply(op: (book: Book) => Book, label: string): void;
    flush(): Promise<void>;
    setZoom(zoom: number): void;
    setActivePage(page: 'left' | 'right'): void;
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

const MM_TO_PX = 96 / 25.4;

let work: string;
let albums: string;

test.beforeAll(async () => {
  await ensureFixtures();
});
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-photos-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** An empty photo frame, as a template would put on a page. */
const slot = (id: string, x: number, y: number, w: number, h: number, extra = {}) => ({
  id,
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
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  ...extra,
});

/** The next dialog of "choose photos" answers with these files, as if the user had picked them. */
const pickFiles = (app: ElectronApplication, names: FixtureName[]) =>
  app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
  }, names.map(fixturePath));

/**
 * Open a new A4 album on its first inner spread (two pages of 210 mm) at zoom 1, with `slots`
 * on it, and wait for the layout to settle before anything is aimed at the page.
 */
async function openAlbum(page: Page, title: string, slots: ReturnType<typeof slot>[] = []) {
  await createFromHome(page, title);
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
  await evalEditor(
    page,
    (e, els) => {
      const id = e.getState().book.spreads[1]!.id;
      e.setState({ currentSpreadId: id });
      e.getState().apply(
        (b) => ({
          ...b,
          spreads: b.spreads.map((s) =>
            s.id === id ? { ...s, elements: [...s.elements, ...(els as Element[])] } : s,
          ),
        }),
        'Ajouter',
      );
      e.getState().setZoom(1);
    },
    slots,
  );
  await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
  const paper = page.locator('.canvas-paper');
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await paper.boundingBox());
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
}

/** Import `names` through the panel's button and wait until the tray shows them all. */
async function importPhotos(app: ElectronApplication, page: Page, names: FixtureName[]) {
  await pickFiles(app, names);
  await page.getByRole('button', { name: 'Importer des photos' }).click();
  await expect(page.locator('.photo-thumb')).toHaveCount(names.length);
}

/** A point of the page in mm, relative to the top left of `.canvas-paper`, in px. */
async function pagePx(page: Page, mmX: number, mmY: number) {
  const zoom = await evalEditor(page, (e) => e.getState().zoom, null);
  return { x: mmX * MM_TO_PX * zoom, y: mmY * MM_TO_PX * zoom };
}

/**
 * Drop image files from the system at a point of the window, as a file manager would: Chromium
 * is handed real paths, so the preload names them with `webUtils.getPathForFile`.
 */
const sessions = new WeakMap<Page, Promise<CDPSession>>();
async function dropFiles(page: Page, names: FixtureName[], x: number, y: number) {
  // One session for the page: Chromium keeps the state of the drag in it.
  const session = sessions.get(page) ?? page.context().newCDPSession(page);
  sessions.set(page, session);
  const cdp = await session;
  const data = { items: [], files: names.map(fixturePath), dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
  }
}

/** Drop a photo of the tray on a point of the page. */
async function dropOnPage(page: Page, name: string, mmX: number, mmY: number) {
  const target = await pagePx(page, mmX, mmY);
  await page
    .locator('.shell-panel .photo-grid')
    .getByLabel(new RegExp(`^${name.replace('.', '\\.')}`))
    .dragTo(page.locator('.canvas-paper'), { targetPosition: target });
}

async function savedBook(page: Page, slug: string): Promise<Book> {
  await evalEditor(page, (e) => e.getState().flush(), null);
  return JSON.parse(
    await readFile(join(albums, `${slug}.travelbook`, 'book.json'), 'utf8'),
  ) as Book;
}

const frames = (book: Book) => book.spreads[1]!.elements as PhotoElement[];
const assetIdOf = (book: Book, name: string) =>
  Object.values(book.assets).find((a) => a.originalName === name)!.id;

test('imports photos, groups them by EXIF day, and the day checkbox selects its photos', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Tray');
    await expect(page.getByText('Aucune photo pour le moment')).toBeVisible();

    // Two photos with an EXIF day, two without one.
    await importPhotos(app, page, ['landscape.jpg', 'small.jpg', 'day1.jpg', 'day2.jpg']);
    const days = page.locator('.photo-day[data-day]');
    await expect(days).toHaveCount(3);
    expect(
      await days.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['day'])),
    ).toEqual(['2026-06-10', '2026-06-11', 'none']);
    await expect(days.nth(0)).toContainText('mercredi 10 juin 2026');
    await expect(days.nth(1)).toContainText('jeudi 11 juin 2026');
    await expect(days.nth(2)).toContainText('Sans date');
    await expect(days.nth(2)).toContainText('2');

    // The day's checkbox selects the photos of that day, and only those.
    const grid = page.locator('.shell-panel .photo-grid');
    const pressed = () =>
      grid
        .locator('.photo-thumb[aria-pressed="true"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).title));
    expect(await pressed()).toEqual([]);
    await page.getByRole('checkbox', { name: /mercredi 10 juin 2026/ }).check();
    expect(await pressed()).toEqual(['day1.jpg']);
    await page.getByRole('checkbox', { name: /sans date/i }).check();
    expect((await pressed()).sort()).toEqual(['day1.jpg', 'landscape.jpg', 'small.jpg']);
    await page.getByRole('checkbox', { name: /mercredi 10 juin 2026/ }).uncheck();
    expect((await pressed()).sort()).toEqual(['landscape.jpg', 'small.jpg']);

    // Sorting by name keeps the groups and orders each by name.
    await page.getByRole('button', { name: 'Nom', exact: true }).click();
    await expect(grid.locator('.photo-thumb').first()).toHaveAttribute('title', 'day1.jpg');

    // The import was one undo step: undoing it empties the tray, redoing brings it back.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(0);
    await page.getByRole('button', { name: 'Rétablir' }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(4);

    const book = await savedBook(page, 'tray');
    expect(
      Object.values(book.assets)
        .map((a) => a.originalName)
        .sort(),
    ).toEqual(['day1.jpg', 'day2.jpg', 'landscape.jpg', 'small.jpg']);
    expect(book.assets[assetIdOf(book, 'day1.jpg')]!.exif?.takenAt).toBe('2026-06-10T14:30:00');
  } finally {
    await app.close().catch(() => {});
  }
});

test('names the files an import could not take and keeps the rest', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Failures');
    await pickFiles(app, ['landscape.jpg', 'script.svg', 'truncated.jpg']);
    await page.getByRole('button', { name: 'Importer des photos' }).click();

    const alert = page.getByRole('alert').filter({ hasText: "n'ont pas pu être importés" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('2 fichiers');
    await expect(alert).toContainText('script.svg : format non pris en charge');
    await expect(alert).toContainText('truncated.jpg : fichier illisible ou abîmé');
    await expect(page.locator('.photo-thumb')).toHaveCount(1);
    await alert.getByRole('button', { name: 'Fermer ce message' }).click();
    await expect(alert).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});

test('drops a photo on a slot, crops it, and shows the resolution badge', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Crop', [
      slot('big', 20, 20, 100, 70),
      // small.jpg is 800 x 600: in a 200 mm frame it shows 102 dpi, under the 150 threshold.
      slot('wide', 5, 150, 200, 120),
    ]);
    await importPhotos(app, page, ['landscape.jpg', 'small.jpg', 'day1.jpg', 'day2.jpg']);

    await dropOnPage(page, 'landscape.jpg', 70, 55);
    await dropOnPage(page, 'small.jpg', 105, 210);
    const placed = await savedBook(page, 'crop');
    expect(frames(placed).map((el) => el.assetId)).toEqual([
      assetIdOf(placed, 'landscape.jpg'),
      assetIdOf(placed, 'small.jpg'),
    ]);
    // The tray counts the placement on the thumbnail.
    await expect(page.locator('.photo-thumb[title="landscape.jpg"] .photo-thumb__uses')).toHaveText(
      '1',
    );

    // small.jpg in a 200 mm frame: low. landscape.jpg (6000 px) in 100 mm: good.
    const low = page.getByRole('img', { name: /Résolution faible/ });
    await expect(low).toHaveAttribute('data-level', 'low');
    await expect(low).toHaveText('102 ppp');
    await expect(page.getByRole('img', { name: /Résolution bonne/ })).toHaveAttribute(
      'data-level',
      'good',
    );

    // Double-click the photo: crop mode. The slider zooms; Enter leaves.
    const paper = page.locator('.canvas-paper');
    await paper.dblclick({ position: await pagePx(page, 70, 55) });
    const zoom = page.getByRole('slider', { name: 'Zoom du recadrage' });
    await expect(zoom).toBeVisible();
    // The wheel zooms the photo too (a notch up zooms in).
    const centre = await pagePx(page, 70, 55);
    const paperBox = (await paper.boundingBox())!;
    await page.mouse.move(paperBox.x + centre.x, paperBox.y + centre.y);
    await page.mouse.wheel(0, -300);
    await expect(page.locator('.crop-bar__value')).not.toHaveText('× 1,0');
    await zoom.fill('2');
    await expect(page.locator('.crop-bar__value')).toHaveText('× 2,0');

    // Dragging inside the frame pans the photo: the crop centre moves against the drag.
    const from = await paper.boundingBox();
    const start = await pagePx(page, 70, 55);
    await page.mouse.move(from!.x + start.x, from!.y + start.y);
    await page.mouse.down();
    await page.mouse.move(from!.x + start.x - 80, from!.y + start.y, { steps: 10 });
    await page.mouse.up();

    await page.keyboard.press('Enter');
    await expect(zoom).toHaveCount(0);

    const cropped = frames(await savedBook(page, 'crop'))[0]!;
    expect(cropped.crop.scale).toBe(2);
    expect(cropped.crop.cx).toBeGreaterThan(0.5);
    expect(cropped.crop.cy).toBe(0.5);

    // The crop session is one undo step: undoing it puts the photo back at scale 1.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    expect(frames(await savedBook(page, 'crop'))[0]!.crop).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });

    // A click outside the frame leaves crop mode too.
    await paper.dblclick({ position: await pagePx(page, 70, 55) });
    await expect(zoom).toBeVisible();
    await paper.click({ position: await pagePx(page, 300, 100) });
    await expect(zoom).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});

test('a click on an empty slot opens the picker, a drop replaces, the old photo is unused again', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Picker', [slot('one', 20, 20, 100, 70)]);
    await importPhotos(app, page, ['landscape.jpg', 'day1.jpg', 'day2.jpg']);

    const paper = page.locator('.canvas-paper');
    await paper.click({ position: await pagePx(page, 70, 55) });
    const picker = page.getByRole('region', { name: 'Choisir une photo' });
    await expect(picker).toBeVisible();
    await picker.getByLabel(/^day1\.jpg/).click();
    await expect(picker).toHaveCount(0);

    const first = await savedBook(page, 'picker');
    expect(frames(first)[0]!.assetId).toBe(assetIdOf(first, 'day1.jpg'));

    // Dropping another photo on the filled slot replaces the first one.
    await dropOnPage(page, 'day2.jpg', 70, 55);
    const second = await savedBook(page, 'picker');
    expect(frames(second)[0]!.assetId).toBe(assetIdOf(second, 'day2.jpg'));

    // The first photo is not placed any more: it is in the "unused" filter, the second is not.
    await page.getByRole('button', { name: 'Inutilisées', exact: true }).click();
    const grid = page.locator('.shell-panel .photo-grid');
    await expect(grid.locator('.photo-thumb[title="day1.jpg"]')).toBeVisible();
    await expect(grid.locator('.photo-thumb[title="day2.jpg"]')).toHaveCount(0);
    await expect(grid.locator('.photo-thumb[title="landscape.jpg"]')).toBeVisible();
    await page.getByRole('button', { name: 'Utilisées', exact: true }).click();
    await expect(grid.locator('.photo-thumb')).toHaveCount(1);
    await expect(grid.locator('.photo-thumb[title="day2.jpg"]')).toBeVisible();

    // The picker is also opened from the inspector, and Escape closes it.
    await page.getByRole('button', { name: 'Remplacer…' }).click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});

test('Ctrl-dragging a placed photo onto another frame swaps their photos', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Swap', [slot('a', 20, 20, 80, 60), slot('b', 120, 20, 80, 60)]);
    await importPhotos(app, page, ['day1.jpg', 'day2.jpg']);
    await dropOnPage(page, 'day1.jpg', 60, 50);
    await dropOnPage(page, 'day2.jpg', 160, 50);
    const before = await savedBook(page, 'swap');
    const [one, two] = [assetIdOf(before, 'day1.jpg'), assetIdOf(before, 'day2.jpg')];
    expect(frames(before).map((el) => el.assetId)).toEqual([one, two]);

    const box = (await page.locator('.canvas-paper').boundingBox())!;
    const a = await pagePx(page, 60, 50);
    const b = await pagePx(page, 160, 50);
    await page.keyboard.down('Control');
    await page.mouse.move(box.x + a.x, box.y + a.y);
    await page.mouse.down();
    await page.mouse.move(box.x + b.x, box.y + b.y, { steps: 10 });
    await expect(page.getByTestId('drop-target')).toBeVisible();
    await page.mouse.up();
    await page.keyboard.up('Control');

    const after = await savedBook(page, 'swap');
    expect(frames(after).map((el) => el.assetId)).toEqual([two, one]);
    // The frames stayed where they were.
    expect(frames(after).map((el) => el.x)).toEqual([20, 120]);
  } finally {
    await app.close().catch(() => {});
  }
});

test('drops a photo on the bare page to make a frame at its ratio', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Bare');
    await importPhotos(app, page, ['day2.jpg']); // 2000 x 3000: a portrait
    await dropOnPage(page, 'day2.jpg', 300, 150);
    const book = await savedBook(page, 'bare');
    const [created] = frames(book);
    expect(created!.assetId).toBe(assetIdOf(book, 'day2.jpg'));
    expect(created!.w / created!.h).toBeCloseTo(2000 / 3000, 2);
    expect(created!.x + created!.w / 2).toBeCloseTo(300, 0);
    expect(created!.y + created!.h / 2).toBeCloseTo(150, 0);
    await expect(page.getByTestId('photo-inspector')).toBeVisible();
  } finally {
    await app.close().catch(() => {});
  }
});

test('the photo inspector edits mask, border, shadow, flip and adjustments, one undo step each', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Inspector', [slot('a', 20, 20, 100, 70)]);
    await importPhotos(app, page, ['day1.jpg']);
    await dropOnPage(page, 'day1.jpg', 70, 55);
    const inspector = page.getByTestId('photo-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('day1.jpg, 3000 × 2000');

    await inspector.getByRole('button', { name: 'Arrondi' }).click();
    await inspector.getByLabel('Épaisseur').fill('2,5');
    await inspector.getByLabel('Épaisseur').press('Enter');
    await inspector.getByLabel('Ombre portée').check();
    await inspector.getByRole('button', { name: 'Retourner horizontalement' }).click();
    await inspector.getByLabel('Contraste').fill('1.4');
    await inspector.getByLabel('Noir et blanc').fill('0.5');

    const book = await savedBook(page, 'inspector');
    const el = frames(book)[0]!;
    expect(el.mask).toEqual({ kind: 'rounded', radius: 6 });
    expect(el.border).toEqual({ width: 2.5, color: '#ffffff' });
    expect(el.shadow).toMatchObject({ dx: 1.5, dy: 1.5, blur: 3 });
    expect(el.flipH).toBe(true);
    expect(el.adjust).toMatchObject({ contrast: 1.4, grayscale: 0.5, brightness: 1 });

    // Remove from the frame: the slot is empty again and the photo unused.
    await inspector.getByRole('button', { name: 'Retirer du cadre' }).click();
    const emptied = frames(await savedBook(page, 'inspector'))[0]!;
    expect(emptied.assetId).toBeNull();
    expect(emptied.crop).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    expect(frames(await savedBook(page, 'inspector'))[0]!.assetId).not.toBeNull();
  } finally {
    await app.close().catch(() => {});
  }
});

test('image files dropped from the system are imported and placed on the page', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Files', [slot('a', 20, 20, 100, 70)]);
    const box = (await page.locator('.canvas-paper').boundingBox())!;
    const on = async (mmX: number, mmY: number) => {
      const p = await pagePx(page, mmX, mmY);
      return { x: box.x + p.x, y: box.y + p.y };
    };

    // Two files on the empty slot: the first fills it, the second gets a frame of its own.
    const slotPoint = await on(70, 55);
    await dropFiles(page, ['day1.jpg', 'day2.jpg'], slotPoint.x, slotPoint.y);
    await expect(page.locator('.photo-thumb')).toHaveCount(2);
    await expect.poll(async () => frames(await savedBook(page, 'files')).length).toBe(2);
    const first = await savedBook(page, 'files');
    expect(frames(first)[0]!.id).toBe('a');
    expect(frames(first)[0]!.assetId).toBe(assetIdOf(first, 'day1.jpg'));
    expect(frames(first)[1]!.assetId).toBe(assetIdOf(first, 'day2.jpg'));

    // The same file again is not imported twice, but it is placed.
    const bare = await on(140, 100);
    await dropFiles(page, ['day1.jpg'], bare.x, bare.y);
    await expect.poll(async () => frames(await savedBook(page, 'files')).length).toBe(3);
    const second = await savedBook(page, 'files');
    expect(Object.keys(second.assets)).toHaveLength(2);
    expect(frames(second)[2]!.assetId).toBe(assetIdOf(second, 'day1.jpg'));

    // Dropped on the panel, files are imported and not placed.
    const panel = (await page.locator('.shell-panel').boundingBox())!;
    await dropFiles(page, ['small.jpg'], panel.x + panel.width / 2, panel.y + 300);
    await expect(page.locator('.photo-thumb')).toHaveCount(3);
    const third = await savedBook(page, 'files');
    expect(Object.keys(third.assets)).toHaveLength(3);
    expect(frames(third)).toHaveLength(3);
  } finally {
    await app.close().catch(() => {});
  }
});

test('the tray mounts only the thumbnails in view', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Many');
    // 600 photos known to the album (no files: only the grid is under test).
    await evalEditor(
      page,
      (e) => {
        const assets = Object.fromEntries(
          Array.from({ length: 600 }, (_, i) => {
            const id = `fake-${String(i).padStart(3, '0')}`;
            return [
              id,
              {
                id,
                kind: 'photo',
                file: `originals/${id}.jpg`,
                originalName: `IMG_${String(i).padStart(4, '0')}.jpg`,
                sha256: id,
                pixel: { w: 4000, h: 3000 },
              },
            ];
          }),
        );
        e.getState().apply(
          (b) => ({ ...b, assets: { ...b.assets, ...(assets as unknown as Book['assets']) } }),
          'Ajouter',
        );
      },
      null,
    );
    const grid = page.locator('.shell-panel .photo-grid');
    await expect(page.getByText('600 photos')).toBeVisible();
    const mounted = await grid.locator('.photo-thumb').count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(60);

    // Scrolling to the end brings the last photo in and takes the first out.
    await grid.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(grid.locator('.photo-thumb[title="IMG_0599.jpg"]')).toBeVisible();
    await expect(grid.locator('.photo-thumb[title="IMG_0000.jpg"]')).toHaveCount(0);
    expect(await grid.locator('.photo-thumb').count()).toBeLessThan(60);
  } finally {
    await app.close().catch(() => {});
  }
});

test('a drop on the page shows its progress and its failed files whichever panel is open', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Elsewhere');
    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Panneau Texte' })).toBeVisible();

    // Remember whether the progress bar was ever on screen: an import is too quick to catch it.
    await page.evaluate(() => {
      const seen = window as unknown as { sawProgress: boolean };
      seen.sawProgress = false;
      new MutationObserver(() => {
        if (document.querySelector('[role="progressbar"]')) seen.sawProgress = true;
      }).observe(document.body, { subtree: true, childList: true });
    });

    const box = (await page.locator('.canvas-paper').boundingBox())!;
    const at = await pagePx(page, 60, 60);
    await dropFiles(page, ['pano.jpg', 'script.svg', 'truncated.jpg'], box.x + at.x, box.y + at.y);

    const alert = page.getByRole('alert').filter({ hasText: "n'ont pas pu être importés" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('script.svg : format non pris en charge');
    await expect(alert).toContainText('truncated.jpg : fichier illisible ou abîmé');
    expect(
      await page.evaluate(() => (window as unknown as { sawProgress: boolean }).sawProgress),
    ).toBe(true);
    // The user stayed where they were, and the good file was imported and placed.
    await expect(page.getByRole('region', { name: 'Panneau Texte' })).toBeVisible();
    await expect.poll(async () => frames(await savedBook(page, 'elsewhere')).length).toBe(1);
    await expect(page.getByRole('progressbar')).toHaveCount(0);

    await alert.getByRole('button', { name: 'Fermer ce message' }).click();
    await expect(alert).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});

test('text typed in a photo field is not committed to the next photo selected', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Draft', [slot('a', 20, 20, 80, 60), slot('b', 120, 20, 80, 60)]);
    await importPhotos(app, page, ['day1.jpg', 'day2.jpg']);
    await dropOnPage(page, 'day1.jpg', 60, 50);
    await dropOnPage(page, 'day2.jpg', 160, 50);

    // Select the first photo, type a border width and leave the field by pressing the second photo.
    const paper = page.locator('.canvas-paper');
    await paper.click({ position: await pagePx(page, 60, 50) });
    const width = page.getByTestId('photo-inspector').getByLabel('Épaisseur');
    await width.fill('6');
    await paper.click({ position: await pagePx(page, 160, 50) });
    await expect(page.getByTestId('photo-inspector')).toContainText('day2.jpg');
    await expect(page.getByTestId('photo-inspector').getByLabel('Épaisseur')).toHaveValue('0');

    const book = await savedBook(page, 'draft');
    const [first, second] = frames(book);
    expect(second!.border).toBeNull();
    // The text belonged to the first photo: it is either applied there or dropped, never moved.
    expect([null, 6]).toContain(first!.border?.width ?? null);
  } finally {
    await app.close().catch(() => {});
  }
});

test('importing the same photo again puts a missing original back', async () => {
  const userData = join(work, 'user data');
  let app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Perdu');
    await importPhotos(app, page, ['small.jpg']);
    const book = await savedBook(page, 'perdu');
    const asset = Object.values(book.assets)[0]!;
    const original = join(albums, 'perdu.travelbook', asset.file);
    const bytes = await readFile(original);

    // The original is lost; the album is closed and opened again.
    await rm(original);
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    app = await launchApp(userData);
    const again = await app.firstWindow();
    await again.getByRole('button', { name: /Perdu/ }).click();
    const missing = again.getByRole('status', { name: 'Un fichier original est introuvable' });
    await expect(missing).toContainText('small.jpg');

    // The same file again: the original is copied back, and the warning goes away.
    await pickFiles(app, ['small.jpg']);
    await again.getByRole('button', { name: 'Importer des photos' }).click();
    const restored = again.getByRole('status').filter({ hasText: 'de nouveau dans l' });
    await expect(restored).toContainText("1 original est de nouveau dans l'album");
    await expect(restored).toContainText('small.jpg');
    await expect(missing).toBeHidden();
    expect((await readFile(original)).equals(bytes)).toBe(true);
    await expect(again.locator('.photo-thumb')).toHaveCount(1);
  } finally {
    await app.close().catch(() => {});
  }
});

test('photos imported by mistake are removed from the album, frames emptied, and can come back', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Oups', [slot('f', 20, 20, 100, 70)]);
    await importPhotos(app, page, ['landscape.jpg', 'small.jpg', 'day1.jpg']);
    await dropOnPage(page, 'small.jpg', 70, 55);
    const placed = await savedBook(page, 'oups');
    expect(frames(placed)[0]!.assetId).toBe(assetIdOf(placed, 'small.jpg'));

    // Tick two photos: the bar counts them and asks before removing.
    await page.locator('.photo-thumb[title="small.jpg"]').click({ modifiers: ['Control'] });
    await page.locator('.photo-thumb[title="day1.jpg"]').click({ modifiers: ['Control'] });
    const bar = page.getByRole('region', { name: 'Photos sélectionnées' });
    await expect(bar).toContainText('2 photos sélectionnées');
    await bar.getByRole('button', { name: 'Supprimer…', exact: true }).click();
    const ask = page.getByRole('alertdialog', { name: "Supprimer 2 photos de l'album ?" });
    await expect(ask).toContainText('1 est placée dans le livre : son cadre sera vidé.');
    // Escape answers no.
    await page.keyboard.press('Escape');
    await expect(ask).toBeHidden();
    await expect(page.locator('.photo-thumb')).toHaveCount(3);

    await bar.getByRole('button', { name: 'Supprimer…', exact: true }).click();
    await ask.getByRole('button', { name: "Supprimer de l'album", exact: true }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'supprimées' })).toContainText(
      "2 photos supprimées de l'album.",
    );
    await expect
      .poll(async () => {
        const book = await savedBook(page, 'oups');
        return [Object.keys(book.assets).length, frames(book)[0]!.assetId];
      })
      .toEqual([1, null]);

    // One undo step puts both back, and the photo back in its frame.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(3);
    await expect
      .poll(async () => frames(await savedBook(page, 'oups'))[0]!.assetId)
      .toBe(assetIdOf(placed, 'small.jpg'));

    // The shortcut on a thumbnail asks for that photo alone; once removed, it can be imported again.
    await page
      .locator('.photo-cell')
      .filter({ has: page.locator('[title="day1.jpg"]') })
      .hover();
    await page.getByRole('button', { name: "Supprimer day1.jpg de l'album…" }).click();
    const one = page.getByRole('alertdialog', { name: "Supprimer 1 photo de l'album ?" });
    await one.getByRole('button', { name: "Supprimer de l'album", exact: true }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(2);
    await pickFiles(app, ['day1.jpg']);
    await page.getByRole('button', { name: 'Importer des photos' }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(3);
  } finally {
    await app.close();
  }
});

test('a click puts a photo on the page or takes it off; a double-click shows it large', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    // One layout frame on the right page of the spread.
    await openAlbum(page, 'Clic', [slot('frame', 250, 30, 120, 90)]);
    await importPhotos(app, page, ['landscape.jpg', 'small.jpg']);
    await evalEditor(page, (e) => e.getState().setActivePage('right'), null);
    const thumb = (name: string) => page.locator(`.photo-thumb[title="${name}"]`);

    // First click: the photo fills the empty frame of the page, and the tray marks it.
    await thumb('small.jpg').click();
    await expect(thumb('small.jpg')).toHaveAttribute('data-on-page', 'true');
    await expect
      .poll(async () => frames(await savedBook(page, 'clic'))[0]!.assetId)
      .toBe(assetIdOf(await savedBook(page, 'clic'), 'small.jpg'));

    // Another photo, with no empty frame left, gets a frame of its own.
    await thumb('landscape.jpg').click();
    await expect.poll(async () => frames(await savedBook(page, 'clic')).length).toBe(2);

    // A second click takes it off: its own frame goes, the layout frame is only emptied.
    await thumb('landscape.jpg').click();
    await expect.poll(async () => frames(await savedBook(page, 'clic')).length).toBe(1);
    await thumb('small.jpg').click();
    await expect.poll(async () => frames(await savedBook(page, 'clic'))[0]!.assetId).toBeNull();
    await expect(thumb('small.jpg')).not.toHaveAttribute('data-on-page', 'true');
    // Ctrl + click ticks instead; nothing goes on the page.
    await thumb('small.jpg').click({ modifiers: ['Control'] });
    await expect(thumb('small.jpg')).toHaveAttribute('aria-pressed', 'true');
    expect(frames(await savedBook(page, 'clic'))[0]!.assetId).toBeNull();

    // A double-click opens the photo large and changes nothing on the page.
    await thumb('landscape.jpg').dblclick();
    const viewer = page.getByRole('dialog', { name: 'Photo landscape.jpg' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('img', { name: 'landscape.jpg' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(frames(await savedBook(page, 'clic'))).toHaveLength(1);
    // The arrows go through the tray; the button puts the photo in view on the page.
    await page.keyboard.press('ArrowRight');
    const next = page.getByRole('dialog', { name: 'Photo small.jpg' });
    await expect(next).toBeVisible();
    await next.getByRole('button', { name: 'Mettre sur la page' }).click();
    await expect(next.getByRole('button', { name: 'Retirer de la page' })).toBeVisible();
    await expect.poll(async () => frames(await savedBook(page, 'clic'))[0]!.assetId).not.toBeNull();
    await page.keyboard.press('Escape');
    await expect(next).toBeHidden();
  } finally {
    await app.close();
  }
});
