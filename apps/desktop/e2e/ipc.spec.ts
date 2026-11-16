import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureFixtures, fixturePath } from '../../../tests/fixtures/make-fixtures';
import type { Template } from '@travelbook/core';
import type { TbApi } from '../src/shared/api';
import { launchApp } from './launch';

/** `window.tb`, as the renderer sees it. */
type Win = { tb: TbApi };

test.describe.configure({ mode: 'serial' });

let work: string;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  await ensureFixtures();
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-'));
  app = await launchApp(join(work, 'user data'));
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await rm(work, { recursive: true, force: true });
});

/** Load `url` in an <img> in the page: its natural width, or -1 when it fails to load. */
const imageWidth = (url: string): Promise<number> =>
  page.evaluate(
    (src) =>
      new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth);
        img.onerror = () => resolve(-1);
        img.src = src;
        document.body.append(img);
      }),
    url,
  );

test('the renderer is isolated and gets only the typed API', async () => {
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe(
    'undefined',
  );
  expect(await page.evaluate(() => typeof (window as { process?: unknown }).process)).toBe(
    'undefined',
  );
  expect(await page.evaluate(() => Object.keys((window as unknown as Win).tb).sort())).toEqual([
    'app',
    'assets',
    'clipboard',
    'exporter',
    'library',
    'photos',
    'project',
  ]);
  expect(await page.evaluate(() => (window as unknown as Win).tb.app.version())).toMatch(
    /^\d+\.\d+\.\d+/,
  );
});

test('the renderer creates a project, imports two photos and shows them through tb://', async () => {
  // A parent folder with spaces and accents, as many users have.
  const parentDir = join(work, 'Été 2026');
  const files = [fixturePath('landscape.jpg'), fixturePath('pano.jpg')];

  const done = await page.evaluate(
    async ({ parentDir, files }) => {
      const tb = (window as unknown as Win).tb;
      const created = await tb.project.create({ name: 'Mon livre', parentDir });
      const progress: [number, number][] = [];
      const off = tb.photos.onProgress((d, t) => progress.push([d, t]));
      const report = await tb.photos.import(files);
      off();
      await tb.photos.import(files); // after unsubscribing: no more events
      return { dir: created?.dir, report, progress };
    },
    { parentDir, files },
  );
  expect(done.dir).toBe(join(parentDir, 'mon-livre.travelbook'));
  expect(done.report.failed).toEqual([]);
  expect(done.report.added).toHaveLength(2);
  expect(done.progress.at(-1)).toEqual([2, 2]);
  expect(done.progress).toHaveLength(2);

  const [landscape, pano] = done.report.added;
  for (const asset of [landscape, pano]) {
    expect(await imageWidth(`tb://asset/${asset?.id}?v=thumb`)).toBe(320);
  }
  expect(await imageWidth(`tb://asset/${landscape?.id}?v=preview`)).toBe(2560);
  expect(await imageWidth(`tb://asset/${landscape?.id}?v=original`)).toBe(6000);

  // The same URL through fetch: the CSP allows connect-src tb:, and the response is inert.
  const fetched = await page.evaluate(async (id) => {
    const res = await fetch(`tb://asset/${id}?v=thumb`);
    return {
      status: res.status,
      type: res.headers.get('content-type'),
      bytes: (await res.arrayBuffer()).byteLength,
    };
  }, landscape?.id);
  expect(fetched.status).toBe(200);
  expect(fetched.type).toBe('image/jpeg');
  expect(fetched.bytes).toBeGreaterThan(1000);

  // The renderer adds the import to its book and saves; the project then reopens whole.
  const reopened = await page.evaluate(
    async ({ dir, added }) => {
      const tb = (window as unknown as Win).tb;
      const opened = await tb.project.open(dir);
      if (!opened) throw new Error('open returned null');
      await tb.project.save({
        ...opened.book,
        assets: Object.fromEntries(added.map((a) => [a.id, a])),
      });
      const again = await tb.project.open(dir);
      const snapshot = await tb.project.snapshot('manual');
      const palette = await tb.assets.palette(added.map((a) => a.id));
      const recent = await tb.project.recent();
      return {
        assets: Object.keys(again?.book.assets ?? {}),
        missing: again?.missing,
        snapshots: (await tb.project.listSnapshots()).map((s) => s.id),
        snapshot: snapshot.id,
        palette,
        recent: recent.map((r) => r.dir),
      };
    },
    { dir: done.dir as string, added: done.report.added },
  );
  expect(reopened.assets.sort()).toEqual(done.report.added.map((a) => a.id).sort());
  expect(reopened.missing).toEqual([]);
  expect(reopened.snapshots).toEqual([reopened.snapshot]);
  expect(reopened.palette.length).toBeGreaterThan(0);
  expect(reopened.palette.length).toBeLessThanOrEqual(6);
  for (const colour of reopened.palette) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  expect(reopened.recent).toEqual([done.dir]);
});

test('the user library keeps files, serves them through tb://library and copies them into the album', async () => {
  const done = await page.evaluate(
    async ({ file }) => {
      const tb = (window as unknown as Win).tb;
      const [item] = await tb.library.add('sticker', [file]);
      if (!item) throw new Error('add returned nothing');
      await tb.library.setFavourite(item.id, true);
      const favourites = await tb.library.list('sticker', { favourite: true });
      const unused = await tb.library.list('sticker', { recent: 3 });
      const asset = await tb.assets.fromLibrary(item.id);
      const again = await tb.assets.fromLibrary(item.id);
      const recent = await tb.library.list('sticker', { recent: 3 });
      const found = await tb.library.list('sticker', { text: 'ALPHA' });
      return { item, favourites, unused, asset, again, recent, found };
    },
    { file: fixturePath('alpha.png') },
  );
  expect(done.item.id).toMatch(/^sticker-[0-9a-f]{16}$/);
  expect(done.favourites.map((i) => i.id)).toEqual([done.item.id]);
  expect(done.found.map((i) => i.id)).toEqual([done.item.id]);
  // Imported but never placed: already in the recents, without a use date.
  expect(done.unused.map((i) => [i.id, i.lastUsedAt])).toEqual([[done.item.id, undefined]]);
  expect(done.recent.map((i) => i.id)).toEqual([done.item.id]);
  expect(done.asset).toMatchObject({
    id: done.item.id,
    kind: 'sticker',
    pixel: { w: 400, h: 300 },
  });
  expect(done.again).toEqual(done.asset);
  expect(await imageWidth(`tb://library/${done.item.id}`)).toBe(400);
  expect(await imageWidth(`tb://asset/${done.asset.id}?v=original`)).toBe(400);

  const removed = await page.evaluate(async (id) => {
    const tb = (window as unknown as Win).tb;
    await tb.library.remove(id);
    return tb.library.list('sticker');
  }, done.item.id);
  expect(removed).toEqual([]);
  // `fetch` with no-store: the <img> above may be served from the page's memory cache.
  const gone = await page.evaluate(
    async (id) => (await fetch(`tb://library/${id}`, { cache: 'no-store' })).status,
    done.item.id,
  );
  expect(gone).toBe(404);
  // The album keeps its copy.
  expect(await imageWidth(`tb://asset/${done.asset.id}?v=original`)).toBe(400);
});

test('user templates are saved, listed and deleted through the typed API', async () => {
  const result = await page.evaluate(async () => {
    const tb = (window as unknown as Win).tb;
    const template: Template = {
      id: 'user-deux-photos',
      name: 'Deux photos',
      category: 'photos',
      scope: 'page',
      photoCount: 2,
      origin: 'user',
      grid: {
        root: { split: 'row', weights: [1, 1], children: [{ slot: 'photo' }, { slot: 'photo' }] },
        fullBleed: false,
      },
    };
    await tb.library.userTemplates.save(template);
    const saved = await tb.library.userTemplates.list();
    await tb.library.userTemplates.delete(template.id);
    return { template, saved, left: await tb.library.userTemplates.list() };
  });
  expect(result.saved).toEqual([result.template]);
  expect(result.left).toEqual([]);
});

test('the bundled templates and themes come through the typed API', async () => {
  const bundled = await page.evaluate(() =>
    (window as unknown as Win).tb.library.bundledTemplates(),
  );
  expect(bundled.templates.length).toBeGreaterThanOrEqual(129);
  expect(bundled.templates.every((t) => t.origin === 'bundled' && t.id.startsWith('b-'))).toBe(
    true,
  );
  expect(bundled.themes.length).toBeGreaterThanOrEqual(3);
});

test('the library is read again after a restart, before anything lists it', async () => {
  const userData = join(work, 'library restart');
  const first = await launchApp(userData);
  const firstPage = await first.firstWindow();
  await firstPage.waitForLoadState('domcontentloaded');
  const id = await firstPage.evaluate(async (file) => {
    const [item] = await (window as unknown as Win).tb.library.add('sticker', [file]);
    return item?.id ?? '';
  }, fixturePath('plain.svg'));
  expect(id).toMatch(/^sticker-[0-9a-f]{16}$/);
  await first.close();

  const second = await launchApp(userData);
  try {
    const secondPage = await second.firstWindow();
    await secondPage.waitForLoadState('domcontentloaded');
    // The first thing the page does is ask for the file: nothing has listed the library yet.
    const status = await secondPage.evaluate(
      async (itemId) => (await fetch(`tb://library/${itemId}`)).status,
      id,
    );
    expect(status).toBe(200);
    const items = await secondPage.evaluate(() =>
      (window as unknown as Win).tb.library.list('sticker'),
    );
    expect(items.map((i) => i.id)).toEqual([id]);
  } finally {
    await second.close();
  }
});

test('tb:// refuses ids and paths that escape, and unknown assets', async () => {
  const urls = [
    'tb://asset/nope?v=thumb',
    'tb://asset/..%2f..%2fetc%2fpasswd?v=original',
    'tb://asset/%2e%2e?v=original',
    'tb://asset/a%5cb?v=original',
    'tb://asset//etc/passwd?v=original',
    'tb://asset/abc?v=huge',
    'tb://resource/%2e%2e%2f%2e%2e%2fpackage.json',
    'tb://resource/../package.json',
    'tb://resource/missing.png',
    'tb://library/nope',
    'tb://evil/x',
  ];
  for (const url of urls) {
    const status = await page.evaluate(async (u) => (await fetch(u)).status, url);
    expect([400, 404], url).toContain(status);
    expect(await imageWidth(url), url).toBe(-1);
  }
  const post = await page.evaluate(
    async () => (await fetch('tb://asset/nope?v=thumb', { method: 'POST', body: 'x' })).status,
  );
  expect(post).toBe(405);
});

test('main refuses what the renderer should never ask for', async () => {
  const errors = await page.evaluate(async () => {
    const tb = (window as unknown as Win).tb;
    const message = async (call: () => Promise<unknown>): Promise<string> => {
      try {
        await call();
        return 'resolved';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    return {
      http: await message(() => tb.app.openExternal('http://example.com')),
      file: await message(() => tb.app.openExternal('file:///etc/passwd')),
      label: await message(() => tb.project.snapshot('../../x' as 'auto')),
      snapshotId: await message(() => tb.project.readSnapshot('../../book')),
      relative: await message(() => tb.photos.import(['relative/path.jpg'])),
      photoKind: await message(() => tb.assets.importFiles('photo' as 'font', ['/tmp/a.png'])),
      library: await message(() => tb.assets.fromLibrary('item1')),
      template: await message(() => tb.library.add('template' as 'sticker', ['/tmp/a.png'])),
      badTemplate: await message(() => tb.library.userTemplates.save({} as never)),
      badFavourite: await message(() => tb.library.setFavourite('../x', true)),
    };
  });
  expect(errors.http).toMatch(/app:openExternal.*https/);
  expect(errors.file).toMatch(/app:openExternal.*https/);
  expect(errors.label).toMatch(/project:snapshot/);
  expect(errors.snapshotId).toMatch(/project:readSnapshot/);
  expect(errors.relative).toMatch(/photos:import/);
  expect(errors.photoKind).toMatch(/assets:importFiles/);
  expect(errors.library).toMatch(/Unknown library item/);
  expect(errors.template).toMatch(/library:add/);
  expect(errors.badTemplate).toMatch(/library:saveTemplate/);
  expect(errors.badFavourite).toMatch(/library:setFavourite/);
});
