import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MM_TO_PX, evalEditor, openAlbum, savedBook } from './editorHelpers';
import { pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-rulers-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const box = {
  id: 'box',
  type: 'shape',
  shape: 'rect',
  x: 20,
  y: 20,
  w: 40,
  h: 30,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  fill: '#cc3333',
  stroke: null,
  radius: 0,
  points: 5,
};

/** The client point of the page at (`x`, `y`) mm, at zoom 1 (about 160 x 135 mm are in view). */
async function client(page: Page, x: number, y: number) {
  const paper = (await page.locator('.canvas-paper').boundingBox())!;
  return { x: paper.x + x * MM_TO_PX, y: paper.y + y * MM_TO_PX };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

const guidesOf = async (page: Page) =>
  (await savedBook(page, albums, 'regles')).spreads[1]!.guides ?? null;

test('rulers lay guides that elements snap to; a guide dragged back onto its ruler goes', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Regles', [box]);

    const top = page.locator('canvas.ruler--top');
    const left = page.locator('canvas.ruler--left');
    await expect(top).toBeVisible();
    await expect(left).toBeVisible();
    await expect(page.locator('.ruler-corner')).toHaveText('mm');

    // From the top ruler: a horizontal guide at 100 mm. From the left one: a vertical one at 150.
    const topBox = (await top.boundingBox())!;
    const at100 = await client(page, 100, 100);
    await drag(page, { x: at100.x, y: topBox.y + topBox.height / 2 }, at100);
    const leftBox = (await left.boundingBox())!;
    const at150 = await client(page, 150, 120);
    await drag(page, { x: leftBox.x + leftBox.width / 2, y: at150.y }, at150);
    await expect.poll(() => guidesOf(page)).toEqual({ x: [150], y: [100] });
    await expect(page.locator('.ruler-guide')).toHaveCount(2);
    const labels = await evalEditor(page, (e) => e.getState().history.labels.slice(-2), null);
    expect(labels).toEqual(['Poser un repère', 'Poser un repère']);

    // Moved down by 78.6 mm, the box's top edge (98.6 mm) snaps to the guide at 100 mm.
    const centre = await client(page, 40, 35);
    const near = await client(page, 40, 35 + 78.6);
    await drag(page, centre, near);
    await expect
      .poll(async () => (await savedBook(page, albums, 'regles')).spreads[1]!.elements[0]!.y)
      .toBe(100);

    // The horizontal guide, dragged back onto the top ruler, is removed.
    const guide = page.locator('.ruler-guide--y');
    const g = (await guide.boundingBox())!;
    const grab = await client(page, 120, 100);
    await drag(page, { x: grab.x, y: g.y + g.height / 2 }, { x: grab.x, y: topBox.y + 6 });
    await expect.poll(() => guidesOf(page)).toEqual({ x: [150], y: [] });

    // A double-click removes the last one; the field goes with it.
    const v = (await page.locator('.ruler-guide--x').boundingBox())!;
    await page.mouse.dblclick(v.x + v.width / 2, (await client(page, 0, 120)).y);
    await expect.poll(() => guidesOf(page)).toBeNull();

    // The View menu sets their size, kept across sessions.
    await page.getByRole('button', { name: 'Affichage' }).click();
    await page.getByRole('menuitemradio', { name: 'Grande' }).click();
    await expect.poll(async () => (await top.boundingBox())!.height).toBe(32);
    await page.getByRole('menuitemradio', { name: 'Petite' }).click();
    await expect.poll(async () => (await left.boundingBox())!.width).toBe(20);
    expect(await page.evaluate(() => localStorage.getItem('travelbook.rulerSize'))).toBe('small');

    // The View menu hides the rulers.
    await page.getByRole('menuitemcheckbox', { name: 'Règles et repères' }).click();
    await expect(top).toBeHidden();
    await expect(left).toBeHidden();
  } finally {
    await app.close();
  }
});
