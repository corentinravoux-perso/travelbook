import { expect, test, type Page } from '@playwright/test';
import type { Book, Element } from '@travelbook/core';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

/** The e2e build exposes the editor store (see `App.tsx`). */
interface EditorHandle {
  getState(): {
    book: Book;
    currentSpreadId: string;
    selection: string[];
    zoom: number;
    history: { labels: string[] };
    apply(op: (book: Book) => Book, label: string): void;
    flush(): Promise<void>;
    setZoom(zoom: number): void;
  };
  setState(patch: { currentSpreadId?: string; selection?: string[] }): void;
}
const editor = (page: Page) => ({
  eval: <R, A>(fn: (e: EditorHandle, arg: A) => R, arg: A) =>
    page.evaluate(
      ([source, a]) =>
        new Function('e', 'a', `return (${source})(e, a)`)(
          (window as unknown as { __tbEditor: EditorHandle }).__tbEditor,
          a,
        ) as R,
      [fn.toString(), arg] as const,
    ),
});

const MM_TO_PX = 96 / 25.4;

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-canvas-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const rect = (id: string, x: number, y: number, w: number, h: number) => ({
  id,
  type: 'shape',
  shape: 'rect',
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  fill: '#cc3333',
  stroke: null,
  radius: 0,
  points: 5,
});

/** Open a new A4 album, show its first inner spread (a left page of 105 mm centre) at zoom 1. */
async function openWith(page: Page, elements: ReturnType<typeof rect>[]) {
  await createFromHome(page, 'Canvas');
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
  await editor(page).eval((e, els) => {
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
  }, elements);
  await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
  // Wait for the layout to settle (the zoom change re-centres the page) before aiming at it.
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

/** Screen position of a point of the page, in mm. */
async function screenOf(page: Page, mmX: number, mmY: number) {
  const box = (await page.locator('.canvas-paper').boundingBox())!;
  const zoom = await editor(page).eval((e) => e.getState().zoom, null);
  return { x: box.x + mmX * MM_TO_PX * zoom, y: box.y + mmY * MM_TO_PX * zoom };
}

const elementsOf = (page: Page) =>
  editor(page).eval(
    (e) => e.getState().book.spreads[1]!.elements.map((el) => ({ id: el.id, x: el.x, y: el.y })),
    null,
  );

async function savedElements(page: Page, slug: string) {
  await editor(page).eval((e) => e.getState().flush(), null);
  const book = JSON.parse(
    await readFile(join(albums, `${slug}.travelbook`, 'book.json'), 'utf8'),
  ) as Book;
  return book.spreads[1]!.elements;
}

/** A pointer drag, in several moves like a hand. */
async function drag(page: Page, from: { x: number; y: number }, by: { dx: number; dy: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.dx, from.y + by.dy, { steps: 12 });
}

test('dragging an element by 40 px at zoom 1 moves it by 40 px and saves it', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [rect('a', 20, 40, 30, 20)]);

    await drag(page, await screenOf(page, 35, 50), { dx: 40, dy: 0 });
    await page.mouse.up();

    const moved = (await savedElements(page, 'canvas'))[0]!;
    expect(moved.x).toBeCloseTo(20 + 40 / MM_TO_PX, 2);
    expect(moved.y).toBe(40);
  } finally {
    await app.close().catch(() => {});
  }
});

test('an element dragged near the page centre snaps its centre onto x = 105 mm', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [rect('b', 60, 100, 30, 20)]);

    // 111 px is 29.4 mm: the centre lands 0.6 mm short of 105 mm, inside the 6 px threshold.
    await drag(page, await screenOf(page, 75, 110), { dx: 111, dy: 0 });
    await expect(page.locator('.guide--snap')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('.guide--snap')).toHaveCount(0);

    const snapped = (await savedElements(page, 'canvas'))[0]!;
    expect(snapped.x + snapped.w / 2).toBeCloseTo(105, 3);

    // Alt turns the snapping off: the same drag stops where the pointer is.
    await editor(page).eval(
      (e) =>
        e.getState().apply(
          (b) => ({
            ...b,
            spreads: b.spreads.map((s, i) =>
              i === 1 ? { ...s, elements: s.elements.map((el) => ({ ...el, x: 60 })) } : s,
            ),
          }),
          'Remettre',
        ),
      null,
    );
    await page.keyboard.down('Alt');
    await drag(page, await screenOf(page, 75, 110), { dx: 111, dy: 0 });
    await expect(page.locator('.guide--snap')).toHaveCount(0);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const free = (await elementsOf(page))[0]!;
    expect(free.x).toBeCloseTo(60 + 111 / MM_TO_PX, 2);
  } finally {
    await app.close().catch(() => {});
  }
});

test('one drag is one undo step', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [rect('a', 20, 40, 30, 20)]);
    const before = await editor(page).eval((e) => e.getState().history.labels.length, null);

    await drag(page, await screenOf(page, 35, 50), { dx: 40, dy: 25 });
    await page.mouse.up();
    expect((await elementsOf(page))[0]!.x).toBeGreaterThan(25);
    expect(await editor(page).eval((e) => e.getState().history.labels.length, null)).toBe(
      before + 1,
    );

    await page.keyboard.press('Control+z');
    expect(await elementsOf(page)).toEqual([{ id: 'a', x: 20, y: 40 }]);
  } finally {
    await app.close().catch(() => {});
  }
});

test('a marquee selects exactly the elements it encloses', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [
      rect('in1', 20, 30, 20, 20),
      rect('in2', 60, 60, 20, 20),
      rect('edge', 80, 100, 60, 20), // crosses the marquee's right edge
      rect('far', 150, 80, 20, 20),
    ]);
    const selection = () => editor(page).eval((e) => [...e.getState().selection].sort(), null);

    // From the grey margin above and left of the page to a corner of the left page.
    const start = await screenOf(page, -6, -6);
    const end = await screenOf(page, 100, 130);
    await drag(page, start, { dx: end.x - start.x, dy: end.y - start.y });
    await expect(page.locator('.canvas-marquee')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.canvas-marquee')).toHaveCount(0);
    expect(await selection()).toEqual(['in1', 'in2']);

    // Shift-click adds one, a click on empty page clears.
    await page.keyboard.down('Shift');
    await page.mouse.click((await screenOf(page, 160, 90)).x, (await screenOf(page, 160, 90)).y);
    await page.keyboard.up('Shift');
    expect(await selection()).toEqual(['far', 'in1', 'in2']);
    await page.mouse.click((await screenOf(page, 120, 20)).x, (await screenOf(page, 120, 20)).y);
    expect(await selection()).toEqual([]);
  } finally {
    await app.close().catch(() => {});
  }
});

test('keys nudge, duplicate, copy and paste, delete, and zoom', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [rect('a', 20, 40, 30, 20)]);
    const select = () => editor(page).eval((e) => e.setState({ selection: ['a'] }), null);
    await select();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await elementsOf(page)).toEqual([{ id: 'a', x: 21, y: 50 }]);
    await page.keyboard.press('Control+z'); // the two nudges are one step
    expect(await elementsOf(page)).toEqual([{ id: 'a', x: 20, y: 40 }]);

    await page.keyboard.press('Control+d');
    expect((await elementsOf(page)).map((el) => [el.x, el.y])).toEqual([
      [20, 40],
      [25, 45],
    ]);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await elementsOf(page)).length).toBe(3);
    // Pasted back onto the spread it came from: shifted so it does not hide the original.
    expect((await elementsOf(page))[2]!.x).toBe(30);

    await page.keyboard.press('Delete');
    await expect.poll(async () => (await elementsOf(page)).length).toBe(2);

    await page.keyboard.press('+');
    await expect(page.getByRole('group', { name: 'Zoom' })).toContainText('125 %');
    await page.keyboard.press('0');
    await expect(page.getByRole('button', { name: /Ajuster/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await app.close().catch(() => {});
  }
});

test('the handles resize, and rotate with Shift snapping the angle', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openWith(page, [rect('a', 20, 40, 30, 20)]);
    await editor(page).eval((e) => e.setState({ selection: ['a'] }), null);
    const centreOf = async (handle: string) => {
      const box = (await page.locator(`[data-handle="${handle}"]`).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const first = () =>
      editor(page).eval(
        (e) => e.getState().book.spreads[1]!.elements[0]!,
        null,
      ) as Promise<Element>;

    await drag(page, await centreOf('e'), { dx: 40, dy: 0 });
    await page.mouse.up();
    const resized = await first();
    expect(resized.w).toBeCloseTo(30 + 40 / MM_TO_PX, 2);
    expect([resized.x, resized.y, resized.h]).toEqual([20, 40, 20]);

    // Rotate: from the handle to a point level with the centre, on its right, is 90 degrees.
    const turn = await centreOf('rotate');
    const centre = await screenOf(page, 20 + resized.w / 2, 50);
    await page.mouse.move(turn.x, turn.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(centre.x + 200, centre.y + 12, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect((await first()).rotation).toBe(90);
  } finally {
    await app.close().catch(() => {});
  }
});
