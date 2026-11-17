import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { newElement, type AssetRef } from '@travelbook/core';
import type { TbApi } from '../src/shared/api';
import { evalEditor } from './editorHelpers';
import { openAlbumCard, pickFolders } from './home';
import { launchApp } from './launch';

type Win = { tb: TbApi };

test.describe.configure({ mode: 'serial', timeout: 180_000 });

let work: string;
let userData: string;
let projectDir: string;
let photo: AssetRef;
let app: ElectronApplication | undefined;

/** The editor with the album open, from the recent list of the home screen. */
async function openEditor(): Promise<Page> {
  app = await launchApp(userData);
  const page = await app.firstWindow();
  await openAlbumCard(page, /Livre export/);
  await expect(page.getByRole('img', { name: 'Double page 1' })).toBeVisible();
  return page;
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Exporter le livre' });

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Vérification en cours…')).toBeHidden();
  return dialog;
}

test.beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-export-dialog-'));
  userData = join(work, 'user data');
  const source = join(work, 'photo.jpg');
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#4080c0' } })
    .jpeg()
    .toFile(source);
  app = await launchApp(userData);
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const created = await page.evaluate(
    (parentDir) =>
      (window as unknown as Win).tb.project.create({ name: 'Livre export', parentDir }),
    work,
  );
  if (!created) throw new Error('The album was not created');
  projectDir = created.dir;
  const report = await page.evaluate(
    (path) => (window as unknown as Win).tb.photos.import([path]),
    source,
  );
  photo = report.added[0] as AssetRef;
  // One inner spread (pages 2 and 3): a placed photo and an empty photo slot.
  const inner = created.book.spreads[1]!;
  const placed = {
    ...newElement('photo', { x: 10, y: 20, w: 150, h: 100 }),
    id: 'placed',
    assetId: photo.id,
  };
  const empty = { ...newElement('photo', { x: 230, y: 20, w: 150, h: 100 }), id: 'empty-slot' };
  const book = {
    ...created.book,
    assets: { [photo.id]: photo },
    spreads: [
      created.book.spreads[0]!,
      { ...inner, id: 'inner', elements: [placed, empty] },
      created.book.spreads.at(-1)!,
    ],
  };
  await page.evaluate((b) => (window as unknown as Win).tb.project.save(b), book);
  await app.close();
  app = undefined;
});

test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
});

test.afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

test('the dialog states that exports are sRGB, lists the issues, and "voir" selects the element', async () => {
  const page = await openEditor();
  const dialog = await openDialog(page);
  await expect(dialog.getByText(/Les exports sont en sRVB/)).toBeVisible();
  // The three built-in presets are there.
  const presets = dialog.getByLabel('Préréglage', { exact: true });
  for (const name of [
    'Impression sur mesure (PDF)',
    'Imprimeur en ligne (images)',
    "Lecture à l'écran",
  ]) {
    await expect(presets.getByRole('option', { name })).toHaveCount(1);
  }
  // A warning with its "voir" link; only a missing original blocks.
  const issue = dialog.getByRole('listitem').filter({ hasText: 'Emplacement photo vide' });
  await expect(issue).toContainText('pages 2 et 3');
  await expect(issue.getByRole('img', { name: 'Avertissement' })).toBeVisible();
  await issue.getByRole('button', { name: /^Voir : / }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  const state = await evalEditor(
    page,
    (e) => ({ selection: e.getState().selection, spread: e.getState().currentSpreadId }),
    null,
  );
  expect(state).toEqual({ selection: ['empty-slot'], spread: 'inner' });
});

test('a saved preset survives a restart and runs: the files are written', async () => {
  const outDir = join(work, 'files');
  await mkdir(outDir);
  let page = await openEditor();
  await pickFolders(app!, outDir);
  let dialog = await openDialog(page);

  // Start from the online-printer preset, then change what the preset does not say.
  await dialog
    .getByLabel('Préréglage', { exact: true })
    .selectOption({ label: 'Imprimeur en ligne (images)' });
  await expect(dialog.getByRole('button', { name: 'Supprimer ce préréglage' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Choisir…' }).click();
  await expect(dialog.getByLabel('Dossier de destination')).toHaveValue(outDir);
  await dialog.getByLabel('Résolution', { exact: true }).selectOption('150');
  await dialog.getByLabel('Pages', { exact: true }).selectOption('range');
  await dialog.getByLabel('Première page').fill('2');
  await dialog.getByLabel('Dernière page').fill('3');
  await dialog.getByLabel('Inclure la couverture').uncheck();
  // The fields no longer match a preset.
  await expect(dialog.getByLabel('Préréglage', { exact: true })).toHaveValue('');

  await dialog.getByRole('button', { name: 'Enregistrer sous…' }).click();
  const name = dialog.getByLabel('Nom du préréglage');
  await name.fill('Imprimeur en ligne (images)');
  await expect(dialog.getByText('Ce nom est celui d’un préréglage intégré.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await name.fill('Mes pages 2 et 3');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog.getByLabel('Préréglage', { exact: true })).toHaveValue('Mes pages 2 et 3');
  await expect(dialog.getByRole('button', { name: 'Supprimer ce préréglage' })).toBeEnabled();

  // Restart the app: the preset is stored by main, in the user data.
  await app!.close();
  page = await openEditor();
  dialog = await openDialog(page);
  await dialog
    .getByLabel('Préréglage', { exact: true })
    .selectOption({ label: 'Mes pages 2 et 3' });
  await expect(dialog.getByLabel('Dossier de destination')).toHaveValue(outDir);
  await expect(dialog.getByLabel('Première page')).toHaveValue('2');
  await expect(dialog.getByLabel('Inclure la couverture')).not.toBeChecked();

  await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('2 pages exportées');
  expect((await readdir(outDir)).sort()).toEqual(['page-002.jpg', 'page-003.jpg']);
  // 216 x 303 mm at 150 dpi.
  const meta = await sharp(join(outDir, 'page-002.jpg')).metadata();
  expect([meta.width, meta.height, meta.density]).toEqual([1276, 1789, 150]);

  // The preset can be deleted; the built-in ones cannot.
  await dialog.getByRole('button', { name: 'Supprimer ce préréglage' }).click();
  await expect(dialog.getByRole('option', { name: 'Mes pages 2 et 3' })).toHaveCount(0);
});

test('the album is saved before the export: an edit made a moment ago is in the files', async () => {
  const outDir = join(work, 'saved');
  await mkdir(outDir);
  const page = await openEditor();
  await pickFolders(app!, outDir);
  const dialog = await openDialog(page);
  await dialog.getByRole('button', { name: 'Choisir…' }).click();
  await dialog
    .getByLabel('Préréglage', { exact: true })
    .selectOption({ label: 'Imprimeur en ligne (images)' });
  await dialog.getByLabel('Inclure la couverture').uncheck();
  await dialog.getByLabel('Pages', { exact: true }).selectOption('range');
  await dialog.getByLabel('Première page').fill('2');
  await dialog.getByLabel('Dernière page').fill('2');
  await dialog.getByLabel('Résolution', { exact: true }).selectOption('150');
  // The edit is made once the dialog is filled in, inside the 1 s save delay of the click:
  // only `flush` can put it on disk before main reads the book.
  await evalEditor(
    page,
    (e) => {
      e.getState().apply(
        (b) => ({
          ...b,
          spreads: b.spreads.map((s) =>
            s.id === 'inner'
              ? {
                  ...s,
                  elements: [
                    ...s.elements,
                    {
                      ...(JSON.parse(JSON.stringify(s.elements[0])) as object),
                      id: 'extra',
                    } as never,
                  ],
                }
              : s,
          ),
        }),
        'Dupliquer',
      );
    },
    null,
  );
  await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible();
  const saved = JSON.parse(await readFile(join(projectDir, 'book.json'), 'utf8')) as {
    spreads: { id: string; elements: { id: string }[] }[];
  };
  expect(saved.spreads.find((s) => s.id === 'inner')?.elements.map((e) => e.id)).toContain('extra');
  expect(await readdir(outDir)).toEqual(['page-002.jpg']);
});

test('cancelling stops the export and leaves no file', async () => {
  const outDir = join(work, 'cancelled');
  await mkdir(outDir);
  const page = await openEditor();
  await pickFolders(app!, outDir);
  const dialog = await openDialog(page);
  await dialog
    .getByLabel('Préréglage', { exact: true })
    .selectOption({ label: 'Imprimeur en ligne (images)' });
  await dialog.getByRole('button', { name: 'Choisir…' }).click();
  await dialog.getByLabel('Résolution', { exact: true }).selectOption('600');
  await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
  const bar = dialog.getByRole('progressbar', { name: 'Avancement de l’export' });
  await expect(bar).toBeVisible();
  await expect(dialog.getByText(/Page \d sur \d/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(dialog.getByText('Export annulé. Aucun fichier n’a été conservé.')).toBeVisible();
  expect(await readdir(outDir)).toEqual([]);
  await expect(dialog.getByRole('button', { name: 'Exporter', exact: true })).toBeEnabled();
});

test('a missing original blocks the export and "voir" goes to its photo', async () => {
  const page = await openEditor();
  await rm(join(projectDir, photo.file));
  const dialog = await openDialog(page);
  const issue = dialog.getByRole('listitem').filter({ hasText: 'introuvable' });
  await expect(issue).toContainText('photo.jpg');
  await expect(issue.getByRole('img', { name: 'Bloque l’export' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Exporter', exact: true })).toBeDisabled();
  await issue.getByRole('button', { name: /^Voir : / }).click();
  expect(await evalEditor(page, (e) => e.getState().selection, null)).toEqual(['placed']);
  await access(projectDir);
});
