/**
 * Runs the installed layout, not `out/`: the app that `npm run dist:linux` (or `dist:win`) leaves
 * in `dist/linux-unpacked/` (`dist/win-unpacked/`), the same files the installer ships. It proves
 * what `dev` cannot: that the bundled resources sit where main looks for them, and that sharp's
 * native binaries load from outside the asar.
 *
 *   npm run dist:linux && npm run e2e:packaged        build, then check
 *   TB_PACKAGED_EXECUTABLE=/opt/travelbook/travelbook npm run e2e:packaged
 *                                                     check an installed copy
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { newElement, type Book } from '@travelbook/core';
import { ensureFixtures, fixturePath } from '../../../../tests/fixtures/make-fixtures';
import type { TbApi } from '../../src/shared/api';
import { createFromHome, pickFolders } from '../home';

type Win = { tb: TbApi };

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const EXECUTABLE =
  process.env['TB_PACKAGED_EXECUTABLE'] ??
  join(
    import.meta.dirname,
    '../../dist',
    process.platform === 'win32' ? 'win-unpacked/travelbook.exe' : 'linux-unpacked/travelbook',
  );
const TITLE = 'Livre packagé';

let work: string;
let userData: string;
let albums: string;

test.beforeAll(async () => {
  await access(EXECUTABLE).catch(() => {
    throw new Error(`No packaged app at ${EXECUTABLE}: run "npm run dist:linux" first.`);
  });
  await ensureFixtures();
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-packaged-'));
  userData = join(work, 'user data');
  albums = join(work, 'albums');
  await mkdir(albums);
});
test.afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

/** The packaged app, with its own user data folder and with what it writes to stderr kept. */
async function launchPackaged(): Promise<{ app: ElectronApplication; stderr: () => string }> {
  // Some hosts (e.g. VS Code terminals) export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node.
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: [`--user-data-dir=${userData}`],
    env,
  });
  let text = '';
  app.process().stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()));
  return { app, stderr: () => text };
}

/** Main logs a failed IPC handler on stderr; GLib-GObject lines are what sharp warns about. */
function expectNoMainErrors(stderr: string): void {
  expect(
    stderr.split('\n').filter((l) => /Error occurred in handler|GLib-GObject/.test(l)),
  ).toEqual([]);
}

const projectDir = async (): Promise<string> => {
  const dirs = (await readdir(albums)).filter((n) => n.endsWith('.travelbook'));
  expect(dirs).toHaveLength(1);
  return join(albums, dirs[0]!);
};

test('the packaged app opens, makes a book, imports a photo, and finds its fonts and stickers', async () => {
  const { app, stderr } = await launchPackaged();
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('travelbook');
    await expect(page.locator('h1')).toHaveText('travelbook');

    // This is the packaged layout: app.asar, with the library next to it in resources/.
    const where = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      appPath: electronApp.getAppPath(),
      resourcesPath: process.resourcesPath,
    }));
    expect(where.packaged).toBe(true);
    expect(where.appPath).toMatch(/app\.asar$/);
    await access(join(where.resourcesPath, 'resources', 'fonts.json'));

    await pickFolders(app, albums);
    await createFromHome(page, TITLE);
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();

    // Importing makes the thumbnail and the preview with sharp: a photo only shows if it loaded.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
    }, fixturePath('landscape.jpg'));
    await page.getByRole('button', { name: 'Importer des photos' }).click();
    await expect(page.locator('.photo-thumb')).toHaveCount(1);
    await expect
      .poll(() =>
        page.locator('.photo-thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    // A bundled font, declared the way the editor does, over tb://resource.
    const font = await page.evaluate(async () => {
      const families = await (window as unknown as Win).tb.library.fonts.list();
      const lora = families.find((f) => f.origin === 'bundled' && f.family === 'Lora');
      if (!lora) return { listed: families.length, status: 'no Lora' };
      const face = new FontFace('TbPackagedProbe', `url(${lora.faces[0]!.url})`);
      await face.load();
      return { listed: families.length, status: face.status };
    });
    expect(font.status).toBe('loaded');
    expect(font.listed).toBeGreaterThan(30);

    // A built sticker pack: the sets are listed, a search finds stickers, and one draws.
    const stickers = await page.evaluate(async () => {
      const api = (window as unknown as Win).tb.library.stickers;
      const sets = await api.sets();
      const found = await api.search({ source: 'offline', q: 'avion', page: 1 });
      const hit = found.items[0];
      if (!hit) return { sets: sets.length, found: 0, width: 0 };
      const img = new Image();
      img.src = hit.thumbUrl;
      await img.decode();
      return { sets: sets.length, found: found.items.length, width: img.naturalWidth };
    });
    expect(stickers.sets).toBeGreaterThan(10);
    expect(stickers.found).toBeGreaterThan(0);
    expect(stickers.width).toBeGreaterThan(0);

    // The templates, themes and backgrounds come from the same folder.
    const library = await page.evaluate(async () => {
      const api = (window as unknown as Win).tb.library;
      const { templates, themes } = await api.bundledTemplates();
      return {
        templates: templates.length,
        themes: themes.length,
        backgrounds: (await api.bundledBackgrounds()).length,
      };
    });
    expect(library.templates).toBeGreaterThan(0);
    expect(library.themes).toBeGreaterThan(0);
    expect(library.backgrounds).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
  expectNoMainErrors(stderr());
});

test('the saved book exports a page as a JPEG with its photo and fonts', async () => {
  // Place the imported photo on the first inner spread (pages 2 and 3), as a template would.
  const dir = await projectDir();
  const bookFile = join(dir, 'book.json');
  const book = JSON.parse(await readFile(bookFile, 'utf8')) as Book;
  const photo = Object.values(book.assets).find((a) => a.kind === 'photo');
  if (!photo) throw new Error('The imported photo is not in book.json');
  const inner = book.spreads[1]!;
  const placed = { ...newElement('photo', { x: 10, y: 20, w: 150, h: 100 }), assetId: photo.id };
  const withPhoto: Book = {
    ...book,
    spreads: book.spreads.map((s) => (s === inner ? { ...s, elements: [placed] } : s)),
  };
  await writeFile(bookFile, JSON.stringify(withPhoto, null, 2));

  const { app, stderr } = await launchPackaged();
  try {
    const page: Page = await app.firstWindow();
    await page.getByRole('button', { name: new RegExp(TITLE) }).click();
    await expect(page.getByRole('img', { name: 'Double page 1' })).toBeVisible();

    const outDir = join(work, 'files');
    await mkdir(outDir);
    await pickFolders(app, outDir);
    await page.getByRole('button', { name: 'Exporter', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Exporter le livre' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Vérification en cours…')).toBeHidden();
    await dialog
      .getByLabel('Préréglage', { exact: true })
      .selectOption({ label: 'Imprimeur en ligne (images)' });
    await dialog.getByRole('button', { name: 'Choisir…' }).click();
    await expect(dialog.getByLabel('Dossier de destination')).toHaveValue(outDir);
    await dialog.getByLabel('Résolution', { exact: true }).selectOption('150');
    await dialog.getByLabel('Pages', { exact: true }).selectOption('range');
    await dialog.getByLabel('Première page').fill('2');
    await dialog.getByLabel('Dernière page').fill('2');
    await dialog.getByLabel('Inclure la couverture').uncheck();
    await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible();

    expect(await readdir(outDir)).toEqual(['page-002.jpg']);
    const file = join(outDir, 'page-002.jpg');
    // 216 x 303 mm (210 x 297 with the 3 mm bleed) at 150 dpi.
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height, meta.density]).toEqual(['jpeg', 1276, 1789, 150]);
    // The photo is drawn: its yellow-to-blue gradient is not the white of the paper.
    const inPhoto = await sharp(file)
      .extract({ left: 100, top: 200, width: 400, height: 300 })
      .toBuffer();
    const { channels } = await sharp(inPhoto).stats();
    expect(Math.min(...channels.map((c) => c.mean))).toBeLessThan(200);
  } finally {
    await app.close();
  }
  expectNoMainErrors(stderr());
});
