import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { AssetRef, Book } from '@travelbook/core';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, pickFolders } from './home';
import { launchApp } from './launch';

/** The e2e build exposes the editor store (see `App.tsx`). */
interface EditorHandle {
  getState(): { apply(op: (book: Book) => Book, label: string): void; flush(): Promise<void> };
}

let work: string;
let userData: string;
let albums: string;

test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-project-'));
  userData = join(work, 'user data');
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const bookFile = (slug: string) => join(albums, `${slug}.travelbook`, 'book.json');
const readBook = async (slug: string): Promise<Book> =>
  JSON.parse(await readFile(bookFile(slug), 'utf8')) as Book;

const topBar = (page: Page) => page.getByRole('banner', { name: 'Barre du haut' });

/** Wait for the app to exit after its window was asked to close. */
async function closeWindowAndWait(app: ElectronApplication): Promise<void> {
  const exited = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await exited;
}

test('a 240 × 320 book opens on an empty first spread and comes back from the recent list', async () => {
  let app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await expect(page.getByText('Aucun album récent')).toBeVisible();

    // The dialog refuses a book without a title, then takes a free size.
    await page.getByRole('button', { name: 'Nouveau livre' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau livre' });
    await dialog.getByRole('button', { name: 'Choisir…' }).click();
    await expect(dialog.getByRole('button', { name: 'Créer le livre' })).toBeDisabled();
    await dialog.getByLabel('Titre').fill('Islande 2026');
    await expect(dialog.getByRole('button', { name: 'Créer le livre' })).toBeEnabled();
    await dialog.getByLabel('Largeur').fill('30');
    await expect(dialog.getByLabel('Largeur')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('button', { name: 'Créer le livre' })).toBeDisabled();
    await dialog.getByRole('radio', { name: /24 × 32 cm/ }).check({ force: true });
    await expect(dialog.getByLabel('Largeur')).toHaveValue('240');
    await expect(dialog.getByLabel('Hauteur')).toHaveValue('320');
    await dialog.getByRole('button', { name: 'Créer le livre' }).click();

    await expect(topBar(page)).toContainText('Islande 2026');
    await expect(topBar(page)).toContainText('240 × 320 mm');
    await expect(topBar(page)).toContainText('Enregistré');
    const spread = page.getByRole('img', { name: 'Double page 1' });
    await expect(spread).toBeVisible();
    expect(await spread.locator('[data-role="spread-layer"] > *').count()).toBe(0);

    const book = await readBook('islande-2026');
    expect(book.format).toEqual({ width: 240, height: 320 });
    expect(book.spreads[0]?.elements).toEqual([]);

    await closeWindowAndWait(app);
    app = await launchApp(userData);
    const again = await app.firstWindow();
    const card = again.getByRole('button', { name: /Islande 2026/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(topBar(again)).toContainText('240 × 320 mm');
    await expect(again.getByRole('img', { name: 'Double page 1' })).toBeVisible();
  } finally {
    await app.close().catch(() => {});
  }
});

test('closing the window right after an edit saves it', async () => {
  let app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await createFromHome(page, 'Brouillon');
    await expect(topBar(page)).toContainText('Brouillon');

    // The edit is still inside the 1 s debounce when the window closes.
    await page.evaluate(() => {
      const editor = (window as unknown as { __tbEditor: EditorHandle }).__tbEditor;
      editor.getState().apply((book) => ({ ...book, title: 'Modifié à la fermeture' }), 'Renommer');
    });
    await closeWindowAndWait(app);
    expect((await readBook('brouillon')).title).toBe('Modifié à la fermeture');

    app = await launchApp(userData);
    const again = await app.firstWindow();
    // The recent list keeps the title the album had when it was opened.
    await again.getByRole('button', { name: /Brouillon/ }).click();
    await expect(topBar(again)).toContainText('Modifié à la fermeture');
  } finally {
    await app.close().catch(() => {});
  }
});

test('Ctrl+S writes a manual snapshot', async () => {
  const app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await createFromHome(page, 'Versions', 'A5');
    await expect(topBar(page)).toContainText('Versions');
    await page.keyboard.press('Control+s');
    await expect(topBar(page)).toContainText('Version enregistrée');
    const history = await readdir(join(albums, 'versions.travelbook', 'history'));
    expect(history.filter((name) => name.endsWith('-manual.json'))).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('missing originals are listed in a notice that can be dismissed', async () => {
  let app = await launchApp(userData);
  try {
    await pickFolders(app, albums);
    const page = await app.firstWindow();
    await createFromHome(page, 'Orphelin');
    await expect(topBar(page)).toContainText('Orphelin');
    const asset: AssetRef = {
      id: 'photo-gone',
      kind: 'photo',
      file: 'originals/gone.jpg',
      originalName: 'IMG_0042.jpg',
      sha256: 'gone',
      pixel: { w: 1600, h: 1000 },
    };
    await page.evaluate(async (ref) => {
      const editor = (window as unknown as { __tbEditor: EditorHandle }).__tbEditor;
      editor.getState().apply((book) => ({ ...book, assets: { [ref.id]: ref } }), 'Importer');
      await editor.getState().flush();
    }, asset);
    await closeWindowAndWait(app);

    app = await launchApp(userData);
    const again = await app.firstWindow();
    await again.getByRole('button', { name: /Orphelin/ }).click();
    const notice = again.getByRole('status', { name: 'Un fichier original est introuvable' });
    await expect(notice).toContainText('IMG_0042.jpg');
    await notice.getByRole('button', { name: 'Fermer cet avertissement' }).click();
    await expect(notice).toBeHidden();
    // Not modal: the editor stays usable.
    await expect(topBar(again)).toContainText('Orphelin');
  } finally {
    await app.close().catch(() => {});
  }
});
