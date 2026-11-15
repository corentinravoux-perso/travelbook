import { expect, test } from '@playwright/test';
import type { ShapeElement } from '@travelbook/core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MM_TO_PX, evalEditor, openAlbum, pagePx, savedBook } from './editorHelpers';
import { pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-inspector-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** A rectangle as the shapes panel would make one. */
const rect = (id: string, x: number, y: number, w = 40, h = 30) => ({
  id,
  type: 'shape',
  shape: 'rect',
  fill: '#8fa3b5',
  stroke: null,
  radius: 0,
  points: 5,
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

const ids = (page: Parameters<typeof evalEditor>[0]) =>
  evalEditor(page, (e) => e.getState().book.spreads[1]!.elements.map((el) => el.id), null);

test('typing X in the inspector moves the element, and the page shows the page when nothing is selected', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Position', [rect('r1', 20, 20)]);
    const inspector = page.getByRole('complementary', { name: 'Inspecteur' });
    await expect(inspector.getByTestId('page-inspector')).toBeVisible();
    await expect(inspector.getByText('Aucun fond : papier blanc')).toBeVisible();

    const box = (await page.locator('.canvas-paper').boundingBox())!;
    const at = await pagePx(page, 30, 30);
    await page.mouse.click(box.x + at.x, box.y + at.y);
    const x = inspector.getByLabel('X', { exact: true });
    await expect(x).toHaveValue('20');
    await x.fill('30');
    await x.press('Enter');

    const moved = page.locator('.canvas-paper [data-element-id="r1"]');
    await expect
      .poll(async () => ((await moved.boundingBox())!.x - box.x) / MM_TO_PX)
      .toBeCloseTo(30, 1);
    const book = await savedBook(page, albums, 'position');
    expect((book.spreads[1]!.elements[0] as ShapeElement).x).toBe(30);
    expect(await evalEditor(page, (e) => e.getState().history.labels.at(-1), null)).toBe(
      'Déplacer',
    );

    // Align to the page is a command of its own.
    await inspector.getByRole('button', { name: 'Aligner à gauche' }).click();
    const aligned = (await savedBook(page, albums, 'position')).spreads[1]!
      .elements[0] as ShapeElement;
    expect(aligned.x).toBeLessThan(30);
  } finally {
    await app.close();
  }
});

test('the shape tool draws a box by two corners and an arrow by two points', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Formes');
    const box = (await page.locator('.canvas-paper').boundingBox())!;
    const drag = async (from: [number, number], to: [number, number]) => {
      const a = await pagePx(page, ...from);
      const b = await pagePx(page, ...to);
      await page.mouse.move(box.x + a.x, box.y + a.y);
      await page.mouse.down();
      await page.mouse.move(box.x + b.x, box.y + b.y, { steps: 5 });
      await page.mouse.up();
    };

    await page.getByRole('button', { name: 'Formes', exact: true }).click();
    await page.locator('[data-shape="ellipse"]').click();
    await drag([20, 20], [80, 60]);
    await page.locator('[data-shape="arrow"]').click();
    await drag([20, 100], [20, 160]);

    const book = await savedBook(page, albums, 'formes');
    const [ellipse, arrow] = book.spreads[1]!.elements as ShapeElement[];
    expect(ellipse).toMatchObject({ shape: 'ellipse', x: 20, y: 20, w: 60, h: 40 });
    expect(arrow!.shape).toBe('arrow');
    expect(arrow!.w).toBeCloseTo(60, 0);
    expect(arrow!.rotation).toBeCloseTo(90, 0);
    expect(arrow!.stroke).not.toBeNull();
    // The tool is put away after one shape.
    expect(await evalEditor(page, (e) => e.getState().tool, null)).toBe('select');
  } finally {
    await app.close();
  }
});

test('Layers: drag reorders the stack, the eye and padlock toggle, a name can be changed', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Calques', [rect('a', 10, 10), rect('b', 60, 10), rect('c', 110, 10)]);
    const inspector = page.getByRole('complementary', { name: 'Inspecteur' });
    await inspector.getByRole('tab', { name: 'Calques' }).click();
    const layers = inspector.getByTestId('layers');
    const rows = layers.locator('[data-layer]');
    // The top of the stack comes first.
    await expect(rows).toHaveCount(3);
    expect(
      await rows.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['layer'])),
    ).toEqual(['c', 'b', 'a']);

    // Drop the top layer on the lower half of the bottom one: it goes to the bottom.
    await layers.locator('[data-layer="c"]').dragTo(layers.locator('[data-layer="a"]'), {
      sourcePosition: { x: 80, y: 16 },
      targetPosition: { x: 40, y: 28 },
    });
    expect(await ids(page)).toEqual(['c', 'a', 'b']);
    const saved = await savedBook(page, albums, 'calques');
    expect(saved.spreads[1]!.elements.map((el) => el.id)).toEqual(['c', 'a', 'b']);
    expect(await evalEditor(page, (e) => e.getState().history.labels.at(-1), null)).toBe(
      'Changer l’ordre des calques',
    );

    // Eye and padlock.
    const row = layers.locator('[data-layer="a"]');
    await row.getByRole('button', { name: 'Masquer' }).click();
    await row.getByRole('button', { name: 'Verrouiller' }).click();
    const flags = await evalEditor(
      page,
      (e) => e.getState().book.spreads[1]!.elements.find((el) => el.id === 'a'),
      null,
    );
    expect(flags).toMatchObject({ hidden: true, locked: true });

    // Rename with a double-click.
    await row.locator('.layer__name').dblclick();
    const field = row.getByLabel('Nom du calque');
    await field.fill('Fond bleu');
    await field.press('Enter');
    await expect(row.locator('.layer__name')).toHaveText('Fond bleu');
    expect(
      (
        await evalEditor(
          page,
          (e) => e.getState().book.spreads[1]!.elements.find((el) => el.id === 'a'),
          null,
        )
      )?.name,
    ).toBe('Fond bleu');
  } finally {
    await app.close();
  }
});

test('History: a snapshot can be viewed, then restored after a confirmation, and undone', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Versions', [rect('a', 10, 10), rect('b', 60, 10)]);
    // Ctrl+S: save, then write a manual snapshot of this state.
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Version enregistrée')).toBeVisible();

    // Change the book: one element goes away.
    await evalEditor(
      page,
      (e) =>
        e.getState().apply(
          (b) => ({
            ...b,
            spreads: b.spreads.map((s, i) =>
              i === 1 ? { ...s, elements: s.elements.filter((el) => el.id !== 'b') } : s,
            ),
          }),
          'Retirer',
        ),
      null,
    );
    expect(await ids(page)).toEqual(['a']);

    const inspector = page.getByRole('complementary', { name: 'Inspecteur' });
    await inspector.getByRole('tab', { name: 'Historique' }).click();
    const snapshots = inspector.locator('[data-snapshot]');
    await expect(snapshots).toHaveCount(1);
    await expect(snapshots.first()).toContainText('Manuelle');

    // View: a read-only look, the book is untouched.
    await snapshots.first().getByRole('button', { name: 'Voir' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('history-preview')).toBeVisible();
    await expect(dialog.locator('[data-element-id="b"]')).toHaveCount(0); // another spread shown first
    await dialog.getByRole('button', { name: 'Double page suivante' }).click();
    await expect(dialog.locator('[data-element-id="b"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await ids(page)).toEqual(['a']);

    // Restore: asks first, then the earlier content is back; Annuler brings the change back.
    await snapshots.first().getByRole('button', { name: 'Restaurer' }).click();
    await expect(page.getByText('Remplacer le livre actuel par cette version ?')).toBeVisible();
    await page.getByRole('button', { name: 'Garder le livre actuel' }).click();
    expect(await ids(page)).toEqual(['a']);

    await snapshots.first().getByRole('button', { name: 'Restaurer' }).click();
    await page.getByRole('button', { name: 'Restaurer cette version' }).click();
    await expect.poll(() => ids(page)).toEqual(['a', 'b']);
    const labels = await evalEditor(page, (e) => e.getState().history.labels, null);
    expect(labels.at(-1)).toMatch(/^Restaurer la version du /);
    const restored = await savedBook(page, albums, 'versions');
    expect(restored.spreads[1]!.elements.map((el) => el.id)).toEqual(['a', 'b']);

    await page.getByRole('button', { name: 'Annuler' }).click();
    expect(await ids(page)).toEqual(['a']);
  } finally {
    await app.close();
  }
});
