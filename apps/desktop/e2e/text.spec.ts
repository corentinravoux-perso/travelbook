import { expect, test, type Page } from '@playwright/test';
import type { TextElement } from '@travelbook/core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MM_TO_PX, evalEditor, openAlbum, pagePx, savedBook } from './editorHelpers';
import { pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-text-'));
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const texts = (book: Awaited<ReturnType<typeof savedBook>>) =>
  book.spreads[1]!.elements.filter((e): e is TextElement => e.type === 'text');

/** Every text of a Tiptap document, with the marks of each run. */
function runs(
  doc: unknown,
): { text: string; marks: { type: string; attrs?: Record<string, string> }[] }[] {
  const out: ReturnType<typeof runs> = [];
  const walk = (n: { text?: string; marks?: never[]; content?: unknown[] }) => {
    if (typeof n.text === 'string') out.push({ text: n.text, marks: n.marks ?? [] });
    for (const c of n.content ?? []) walk(c as Parameters<typeof walk>[0]);
  };
  walk(doc as Parameters<typeof walk>[0]);
  return out;
}

/** The text selected in the editor, as its state has it. */
const selectedText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    type Pm = {
      state: {
        selection: { from: number; to: number };
        doc: { textBetween(a: number, b: number): string };
      };
    };
    const host = document.querySelector('.ProseMirror') as unknown as { editor?: Pm } | null;
    const state = host?.editor?.state;
    return state ? state.doc.textBetween(state.selection.from, state.selection.to) : '';
  });

test('creates a title, types with French spacing, and the static text has the editing box', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'texte');

    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    await page.locator('[data-preset="title"]').click();
    const editor = page.getByTestId('text-editor');
    await expect(editor.locator('.ProseMirror')).toBeFocused();

    // The sample is selected: typing replaces it. Letter keys are the text's, not shortcuts.
    await page.keyboard.type('Reykjavik : jour 1 !');
    expect(await evalEditor(page, (e) => e.getState().tool, null)).toBe('select');

    // Font and size for the whole text, through the floating toolbar.
    await page.keyboard.press('Control+a');
    const toolbar = page.getByTestId('text-toolbar');
    await toolbar.getByLabel('Police').selectOption({ label: 'Oswald' });
    const size = toolbar.getByLabel('Taille');
    await size.fill('36');
    await size.press('Enter');
    await expect(size).toHaveValue('36');
    await expect(editor.locator('.ProseMirror')).toBeFocused();
    await page.keyboard.press('End');

    const editing = await editor.boundingBox();
    expect(editing).not.toBeNull();

    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    const id = (await evalEditor(page, (e) => e.getState().selection, null))[0]!;
    const view = page.locator(`.canvas-paper .tb-text[data-element-id="${id}"]`);
    await expect(view).toBeVisible();
    const still = (await view.boundingBox())!;
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(still[key] - editing![key])).toBeLessThanOrEqual(1);
    }

    // Everything the user did to create it is one undo step per kind of action, and typing is one.
    const labels = await evalEditor(page, (e) => e.getState().history.labels, null);
    expect(labels.filter((l) => l === 'Modifier le texte').length).toBeGreaterThan(0);

    const book = await savedBook(page, albums, 'texte');
    const [title] = texts(book);
    expect(title).toBeDefined();
    const all = runs(title!.doc);
    expect(all.map((r) => r.text).join('')).toBe('Reykjavik : jour 1 !');
    const marks = all[0]!.marks;
    expect(marks.find((m) => m.type === 'textStyle')?.attrs).toMatchObject({
      fontFamily: "'Oswald', sans-serif",
      fontSize: '36pt',
    });
  } finally {
    await app.close();
  }
});

test('the floating toolbar and the inspector show and set the same font, size and colour', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'texte');
    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    await page.locator('[data-preset="title"]').click();
    const editor = page.getByTestId('text-editor');
    await expect(editor.locator('.ProseMirror')).toBeFocused();
    await page.keyboard.type('Lima Cusco');
    await page.keyboard.press('End'); // nothing selected

    const toolbar = page.getByTestId('text-toolbar');
    const inspector = page.locator('#shell-inspector');
    const barSize = toolbar.getByLabel('Taille');
    const sideSize = inspector.getByLabel('Taille', { exact: true });

    // Nothing selected: the toolbar sets the whole text, and the inspector shows it.
    await barSize.fill('30');
    await barSize.press('Enter');
    await expect(sideSize).toHaveValue('30');
    await toolbar.getByLabel('Police').selectOption({ label: 'Oswald' });
    await expect(inspector.getByLabel('Police')).toHaveValue("'Oswald', sans-serif");

    // Part of it at another size: the inspector says the sizes differ.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    // ProseMirror reads the new selection a moment after the keys
    await expect.poll(() => selectedText(page)).toBe('Li');
    await barSize.fill('40');
    await barSize.press('Enter');
    await expect(sideSize).toHaveValue('');
    await expect(sideSize).toHaveAttribute('placeholder', 'mixte');

    // The inspector sets the whole text: every run takes it, and the toolbar shows it.
    await sideSize.fill('18');
    await sideSize.press('Enter');
    await expect(sideSize).toHaveValue('18');
    await expect(barSize).toHaveValue('18');
    await page.getByTestId('text-editor').locator('.ProseMirror').click();
    await expect(barSize).toHaveValue('18');

    const [text] = texts(await savedBook(page, albums, 'texte'));
    expect(text!.style.fontSizePt).toBe(18);
    const sizes = runs(text!.doc).map(
      (r) => r.marks.find((m) => m.type === 'textStyle')?.attrs?.['fontSize'] ?? null,
    );
    expect(sizes.every((v) => v === null)).toBe(true);
    // the font the toolbar gave all of it is still there
    expect(
      runs(text!.doc).every(
        (r) =>
          r.marks.find((m) => m.type === 'textStyle')?.attrs?.['fontFamily'] ===
          "'Oswald', sans-serif",
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

test('the text tool draws an empty box, typing is one undo step, an abandoned box is dropped', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'boite');
    const paper = page.locator('.canvas-paper');
    const box = (await paper.boundingBox())!;
    const from = await pagePx(page, 30, 40);
    const to = await pagePx(page, 90, 70);

    await page.keyboard.press('t');
    expect(await evalEditor(page, (e) => e.getState().tool, null)).toBe('text');
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('text-editor')).toBeVisible();

    const before = await evalEditor(page, (e) => e.getState().history.labels.length, null);
    await page.keyboard.type('Soleil toute la journée');
    await page.keyboard.press('Escape');
    const after = await evalEditor(page, (e) => e.getState().history.labels.length, null);
    expect(after - before).toBe(1);

    const book = await savedBook(page, albums, 'boite');
    const [text] = texts(book);
    expect(
      runs(text!.doc)
        .map((r) => r.text)
        .join(''),
    ).toBe('Soleil toute la journée');
    expect(text!.w).toBeCloseTo(60, 0);

    // One undo takes the whole typing away and leaves the empty box.
    await page.getByRole('button', { name: 'Annuler' }).click();
    const doc = await evalEditor(page, (e) => e.getState().book.spreads[1]!.elements[0], null);
    expect(
      runs((doc as TextElement).doc)
        .map((r) => r.text)
        .join(''),
    ).toBe('');

    // A second box, left empty: it is removed when edit mode ends.
    await page.keyboard.press('t');
    await page.mouse.move(box.x + from.x, box.y + from.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y + 200, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    expect(
      await evalEditor(
        page,
        (e) => e.getState().book.spreads[1]!.elements.filter((el) => el.type === 'text').length,
        null,
      ),
    ).toBe(1);
  } finally {
    await app.close();
  }
});

test('a box grows with its text and keeps a manual height as a minimum', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await openAlbum(page, 'Hauteur');
    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    await page.locator('[data-preset="body"]').click();
    const editor = page.getByTestId('text-editor');
    await expect(editor.locator('.ProseMirror')).toBeFocused();
    const minimum = 30;
    for (let i = 0; i < 12; i++) await page.keyboard.type(`Ligne ${i}\n`);
    await page.keyboard.press('Escape');

    const book = await savedBook(page, albums, 'hauteur');
    const [text] = texts(book);
    expect(text!.h).toBeGreaterThan(minimum + 10);
    const id = text!.id;
    const view = page.locator(`.canvas-paper .tb-text[data-element-id="${id}"]`);
    const shown = (await view.boundingBox())!;
    expect(Math.abs(shown.height - text!.h * MM_TO_PX)).toBeLessThanOrEqual(1);

    // Less text does not shrink it: the height is a minimum.
    await view.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Court');
    await page.keyboard.press('Escape');
    const after = texts(await savedBook(page, albums, 'hauteur'))[0]!;
    expect(after.h).toBe(text!.h);
  } finally {
    await app.close();
  }
});
