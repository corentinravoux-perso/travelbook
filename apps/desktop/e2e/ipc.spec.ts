import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureFixtures, fixturePath } from '../../../tests/fixtures/make-fixtures';
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
    };
  });
  expect(errors.http).toMatch(/app:openExternal.*https/);
  expect(errors.file).toMatch(/app:openExternal.*https/);
  expect(errors.label).toMatch(/project:snapshot/);
  expect(errors.snapshotId).toMatch(/project:readSnapshot/);
  expect(errors.relative).toMatch(/photos:import/);
  expect(errors.photoKind).toMatch(/assets:importFiles/);
  expect(errors.library).toMatch(/not implemented yet/);
});
