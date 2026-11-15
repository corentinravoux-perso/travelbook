/**
 * Measurements on a 100-page book of 400 photos of 24 megapixels (see `make-stress-book.ts`), on
 * the packaged app: what `docs/acceptance.md` quotes. Slow (about an hour, most of it exporting)
 * and heavy (a few GB of disk and several GB of memory): never part of `npm run e2e`.
 *
 *   npm run dist:linux && npm run e2e:stress
 *   TB_STRESS_REBUILD=1 npm run e2e:stress        build the project again from the photos
 *
 * Linux only: the memory figures come from `/proc`. Everything is written to
 * `tests/fixtures/out/stress/results.json` as it is measured. Close other heavy programs first:
 * the figures are those of a machine that has nothing else to do.
 */
import {
  expect,
  test,
  type CDPSession,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
  copyFile,
} from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import type { AssetRef, Book } from '@travelbook/core';
import {
  STRESS_DIR,
  STRESS_PHOTOS,
  STRESS_PROJECT_DIR,
  buildStressBook,
  ensureStressPhotos,
} from '../../../../tests/fixtures/make-stress-book';
import type { TbApi } from '../../src/shared/api';
import { createFromHome, pickFolders } from '../home';
import {
  PACKAGED_EXECUTABLE,
  expectNoMainErrors,
  launchPackaged,
  quitPackaged,
  requirePackagedApp,
} from '../packagedApp';
import { PeakSampler, cpuBetween, sampleTree, summarise, type MemoryRow } from './processes';

test.describe.configure({ mode: 'serial', timeout: 3 * 60 * 60 * 1000 });

const RUN_DIR = join(STRESS_DIR, 'run');
const TITLE = 'stress';
const SPREADS = 52; // the cover, the first page, 49 inner spreads and the last page

type Win = { tb: TbApi };

// --- results --------------------------------------------------------------

const results: Record<string, unknown> = {};

/** Keep a measurement: in `results.json` at once, so that a run that dies later loses nothing. */
async function record(key: string, value: unknown): Promise<void> {
  results[key] = value;
  console.log(`[stress] ${key}: ${JSON.stringify(value)}`);
  await mkdir(STRESS_DIR, { recursive: true });
  await writeFile(
    join(STRESS_DIR, 'results.json'),
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        machine: { threads: cpus().length, memoryGb: Math.round(totalmem() / 1024 ** 3) },
        executable: PACKAGED_EXECUTABLE,
        results,
      },
      null,
      2,
    ),
  );
}

const seconds = (since: number): number => Math.round((performance.now() - since) / 100) / 10;

// --- project files ----------------------------------------------------------

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * A copy of a project that costs no disk: the folders are made again and the files hard-linked.
 * The app never writes inside a file (it writes a new one and renames it over), so what the
 * measurement does to its copy cannot reach the fixture; `book.json` is copied anyway.
 */
async function linkTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) await linkTree(source, target);
    else if (entry.name === 'book.json') await copyFile(source, target);
    else await link(source, target);
  }
}

/** A fresh copy of the fixture project in `RUN_DIR/<name>/albums`, and a user data folder beside it. */
async function copyFixture(
  name: string,
): Promise<{ albums: string; project: string; userData: string }> {
  const base = join(RUN_DIR, name);
  await rm(base, { recursive: true, force: true });
  const albums = join(base, 'albums');
  const project = join(albums, 'stress.travelbook');
  await linkTree(STRESS_PROJECT_DIR, project);
  return { albums, project, userData: join(base, 'user data') };
}

const folderSize = async (dir: string): Promise<number> => {
  let total = 0;
  for (const name of await readdir(dir)) total += (await stat(join(dir, name))).size;
  return total;
};

// --- driving the app --------------------------------------------------------

const topBar = (page: Page) => page.getByRole('banner', { name: 'Barre du haut' });
const openPanel = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click();

/** Open `project` from the home screen, as the user does with "Ouvrir". Resolves to the time it took. */
async function openFromHome(app: ElectronApplication, page: Page, project: string) {
  await pickFolders(app, project);
  const button = page.getByRole('button', { name: 'Ouvrir', exact: true });
  await expect(button).toBeEnabled();
  const started = performance.now();
  await button.click();
  await expect(page.getByRole('img', { name: 'Double page 1' })).toBeVisible({ timeout: 120_000 });
  const shell = seconds(started);
  await imagesDrawn(page);
  return { shell, drawn: seconds(started) };
}

/** Wait until every picture of the spread in view is decoded. */
async function imagesDrawn(page: Page, spreadId?: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const paper = document.querySelector('.canvas-paper');
      if (!paper || (id && paper.getAttribute('data-spread-id') !== id)) return false;
      return [...paper.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0);
    },
    spreadId,
    { polling: 'raf', timeout: 120_000 },
  );
}

const sessions = new WeakMap<Page, CDPSession>();
/** The DevTools session of the editor's page, opened once. */
async function devtools(page: Page): Promise<CDPSession> {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  return session;
}

/** Memory of the whole app, and what the editor's JavaScript heap holds, right now. */
async function memoryNow(app: ElectronApplication, page: Page) {
  const heap = (await (await devtools(page)).send('Runtime.getHeapUsage')) as { usedSize: number };
  return {
    ...summarise(await sampleTree(app.process().pid as number)),
    jsHeapMb: Math.round(heap.usedSize / 1024 ** 2),
  };
}

// --- 1. the fixture ---------------------------------------------------------

test.beforeAll(async () => {
  await requirePackagedApp();
  await mkdir(RUN_DIR, { recursive: true });
});

test('import 400 photos of 24 MP, and make the 100-page book', async () => {
  test.setTimeout(60 * 60 * 1000);
  const generated = performance.now();
  const photos = await ensureStressPhotos({
    onProgress: (done, total) => {
      if (done % 50 === 0) console.log(`[stress] photo ${done}/${total}`);
    },
  });
  expect(photos).toHaveLength(STRESS_PHOTOS);
  await record('photosGeneratedInS', seconds(generated));
  const sizes = await Promise.all(photos.map(async (p) => (await stat(p)).size));
  await record('photoFiles', {
    count: photos.length,
    totalGb: Math.round(sizes.reduce((a, b) => a + b, 0) / 1e8) / 10,
    minMb: Math.round(Math.min(...sizes) / 1e5) / 10,
    maxMb: Math.round(Math.max(...sizes) / 1e5) / 10,
  });

  const keep =
    !process.env['TB_STRESS_REBUILD'] && (await exists(join(STRESS_PROJECT_DIR, 'book.json')));
  const base = join(RUN_DIR, 'import');
  await rm(base, { recursive: true, force: true });
  const albums = join(base, 'albums');
  await mkdir(albums, { recursive: true });
  const { app, stderr } = await launchPackaged(join(base, 'user data'));
  try {
    const page = await app.firstWindow();
    await pickFolders(app, albums);
    await createFromHome(page, TITLE);
    await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();

    // The import as the user does it: the picker answers with the 400 files.
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    }, photos);
    await openPanel(page, 'Photos');
    const sampler = new PeakSampler(app.process().pid as number);
    sampler.start();
    const started = performance.now();
    await page.getByRole('button', { name: 'Importer des photos' }).click();
    await expect(page.locator('.photos__count')).toHaveText(`${STRESS_PHOTOS} photos`, {
      timeout: 45 * 60 * 1000,
    });
    const imported = seconds(started);
    await expect(topBar(page)).toContainText('Enregistré');
    const peaks = await sampler.stop();
    await record('import', {
      photos: STRESS_PHOTOS,
      seconds: imported,
      secondsPerPhoto: Math.round((imported / STRESS_PHOTOS) * 100) / 100,
      peaks,
    });

    if (!keep) {
      // The sticker assets: 40 offline stickers copied into the project, as placing them does.
      const stickers = await page.evaluate(async (n) => {
        const { tb } = window as unknown as Win;
        const found = await tb.library.stickers.search({ source: 'offline', q: '', page: 1 });
        const assets: AssetRef[] = [];
        for (const hit of found.items.slice(0, n)) {
          const item = await tb.library.stickers.add({ source: hit.source, id: hit.id });
          assets.push(await tb.assets.fromLibrary(item.id));
        }
        return assets;
      }, 40);
      const { templates } = await page.evaluate(() =>
        (window as unknown as Win).tb.library.bundledTemplates(),
      );
      await quitPackaged(app);

      const project = join(albums, 'stress.travelbook');
      const saved = JSON.parse(await readFile(join(project, 'book.json'), 'utf8')) as Book;
      const photoAssets = Object.values(saved.assets)
        .filter((a) => a.kind === 'photo')
        .sort((a, b) => a.originalName.localeCompare(b.originalName));
      expect(photoAssets).toHaveLength(STRESS_PHOTOS);
      const book = await buildStressBook({
        title: TITLE,
        photos: photoAssets,
        stickers,
        templates,
      });
      await writeFile(join(project, 'book.json'), JSON.stringify(book, null, 2) + '\n');
      await rm(join(project, 'cache', 'cover-thumb.jpg'), { force: true });
      await rm(STRESS_PROJECT_DIR, { recursive: true, force: true });
      await rename(project, STRESS_PROJECT_DIR);
    }
  } finally {
    await app.close().catch(() => {});
  }
  expectNoMainErrors(stderr());

  if (keep) {
    await record('fixture', 'kept');
  } else {
    // Open the finished project once, so that it has the cover thumbnail a project in use has.
    const warm = await launchPackaged(join(base, 'user data warm'));
    try {
      const page = await warm.app.firstWindow();
      await openFromHome(warm.app, page, STRESS_PROJECT_DIR);
      await expect
        .poll(() => exists(join(STRESS_PROJECT_DIR, 'cache', 'cover-thumb.jpg')), {
          timeout: 120_000,
        })
        .toBe(true);
      await quitPackaged(warm.app);
    } finally {
      await warm.app.close().catch(() => {});
    }
    await record('fixture', 'built');
  }
  await rm(base, { recursive: true, force: true });

  const book = JSON.parse(await readFile(join(STRESS_PROJECT_DIR, 'book.json'), 'utf8')) as Book;
  const count = (type: string) =>
    [book.cover, ...book.spreads].reduce(
      (n, s) => n + s.elements.filter((e) => e.type === type).length,
      0,
    );
  await record('book', {
    pages: 2 * (book.spreads.length - 2) + 2,
    spreads: book.spreads.length,
    photosPlaced: count('photo'),
    texts: count('text'),
    stickers: count('sticker'),
    bookJsonKb: Math.round((await stat(join(STRESS_PROJECT_DIR, 'book.json'))).size / 1024),
  });
  expect(count('photo')).toBe(STRESS_PHOTOS);
  expect(count('sticker')).toBe(200);
});

// --- 2. opening, interacting, browsing -----------------------------------------

/** What the frames of a drag looked like: `times` are the `requestAnimationFrame` timestamps. */
function frameStats(times: number[]) {
  const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
  const sorted = [...gaps].sort((a, b) => a - b);
  const span = (times.at(-1) as number) - (times[0] as number);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  return {
    frames: gaps.length,
    seconds: Math.round(span / 100) / 10,
    fps: Math.round((gaps.length / (span / 1000)) * 10) / 10,
    medianFrameMs: Math.round(at(0.5) * 10) / 10,
    p95FrameMs: Math.round(at(0.95) * 10) / 10,
    worstFrameMs: Math.round((sorted.at(-1) as number) * 10) / 10,
    framesOver33ms: gaps.filter((g) => g > 33.4).length,
  };
}

/**
 * Frame times of the editor over `ms`, from `requestAnimationFrame`, while `act` runs. Only the
 * frames between the press and the release of the pointer count when `drag` is set.
 */
async function frameTimes(page: Page, act: () => Promise<void>, drag: boolean): Promise<number[]> {
  await page.evaluate((dragOnly) => {
    const rec = { times: [] as number[], from: dragOnly ? Infinity : 0, to: Infinity, run: true };
    (window as unknown as { __fps: typeof rec }).__fps = rec;
    window.addEventListener('pointerdown', (e) => (rec.from = e.timeStamp), { capture: true });
    window.addEventListener('pointerup', (e) => (rec.to = e.timeStamp), { capture: true });
    const tick = (now: number) => {
      if (!rec.run) return;
      rec.times.push(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, drag);
  await act();
  return page.evaluate(() => {
    const rec = (
      window as unknown as { __fps: { times: number[]; from: number; to: number; run: boolean } }
    ).__fps;
    rec.run = false;
    return rec.times.filter((t) => t >= rec.from && t <= rec.to);
  });
}

/** What the editor's main thread spent, from DevTools: seconds of tasks and of scripts so far. */
async function busySeconds(page: Page): Promise<{ task: number; script: number }> {
  const { metrics } = (await (await devtools(page)).send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  const value = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
  return { task: value('TaskDuration'), script: value('ScriptDuration') };
}

/**
 * The frames of the editor while `act` runs (see `frameTimes`), with what they cost: the share of
 * the editor's main thread that was busy, and the processor time of each kind of process as a
 * share of one core. The frame rate alone stops at the screen's 60; these say how much room is
 * left under it.
 */
async function measureFrames(page: Page, pid: number, act: () => Promise<void>, drag: boolean) {
  await (await devtools(page)).send('Performance.enable');
  const cpuBefore = await sampleTree(pid);
  const busyBefore = await busySeconds(page);
  const times = await frameTimes(page, act, drag);
  const busyAfter = await busySeconds(page);
  const cpuAfter = await sampleTree(pid);
  const stats = frameStats(times);
  // The counters cover the whole run of `act`, a little longer than the frames counted.
  const wall = (times.at(-1) as number) - (times[0] as number);
  const percent = (seconds: number) => Math.round((100 * seconds * 1000) / wall);
  const cpu = (kind: 'renderer' | 'gpu' | 'browser') =>
    percent(cpuBetween(cpuBefore, cpuAfter, kind));
  return {
    ...stats,
    mainThreadBusyPercent: percent(busyAfter.task - busyBefore.task),
    scriptPercent: percent(busyAfter.script - busyBefore.script),
    cpuPercentOfACore: { renderer: cpu('renderer'), gpu: cpu('gpu'), main: cpu('browser') },
  };
}

/**
 * A point of the first of `frames` where the frame itself is what the pointer meets (not a sticker,
 * a text or another photo laid over it), in the window's coordinates.
 */
async function solidPoint(frames: Locator): Promise<{ x: number; y: number }> {
  const found = await frames.evaluateAll((elements) => {
    const covers: string[] = [];
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit?.closest('[data-element-type]') === el) return { x, y };
          covers.push(`${hit?.tagName}.${hit?.className}`);
        }
      }
    }
    return { covers: [...new Set(covers)].join(' | ') };
  });
  if ('covers' in found) throw new Error(`Every photo frame is covered by: ${found.covers}`);
  return found;
}

/**
 * Press on `from`, wave the pointer around it for `ms` at 120 moves a second while it drifts 120 px
 * to the right, release: whatever was grabbed ends up that far from where it was.
 */
async function wave(page: Page, from: { x: number; y: number }, ms: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const started = performance.now();
  for (let moves = 0; ; moves++) {
    const elapsed = performance.now() - started;
    if (elapsed >= ms) break;
    const t = (elapsed / ms) * 2 * Math.PI * 2;
    await page.mouse.move(
      from.x + 160 * Math.sin(t) + 120 * (elapsed / ms),
      from.y + 90 * Math.sin(2 * t),
    );
    // One event every 8.3 ms: twice the frame rate of the screen, as a mouse polled at 120 Hz.
    const next = started + (moves + 1) * (1000 / 120);
    await page.waitForTimeout(Math.max(0, next - performance.now()));
  }
  await page.mouse.up();
}

test('open the project, drag on a 6-photo spread, browse every spread', async () => {
  const copy = await copyFixture('open');
  const { app, stderr } = await launchPackaged(copy.userData);
  try {
    const page = await app.firstWindow();
    const pid = app.process().pid as number;
    const versions = await app.evaluate(() => ({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    }));
    const screen = await page.evaluate(() => ({
      window: `${window.innerWidth} x ${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
    }));
    await record('environment', { ...versions, ...screen });
    await record('memoryAtHome', await memoryNow(app, page));

    const sampler = new PeakSampler(pid);
    sampler.start();

    // Time to open: from the click to the editor on screen, and to its pictures drawn.
    const opening = await openFromHome(app, page, copy.project);
    await expect(page.locator('.strip__list .tile')).toHaveCount(SPREADS - 1);
    await record('open', { ...opening, spreadsInStrip: SPREADS });
    await record('memoryAfterOpen', await memoryNow(app, page));

    // Going to a spread with eight photos (pages 2 and 3): the time until its pictures are drawn.
    const second = page.locator('.strip__list .tile').nth(1);
    const spreadId = (await second.getAttribute('data-spread-id')) as string;
    const switched = performance.now();
    await second.click();
    await imagesDrawn(page, spreadId);
    await record('spreadSwitchS', seconds(switched));

    await test.step('frames per second while dragging on a spread with six photos', async () => {
      const frames = page.locator('.canvas-paper [data-element-type="photo"]');
      await expect(frames).toHaveCount(8);
      // Two photos go, six stay. Delete acts on the selection: a click on a frame selects it.
      for (let i = 0; i < 2; i++) {
        const { x, y } = await solidPoint(frames.nth(i));
        await page.mouse.click(x, y);
        await page.keyboard.press('Delete');
      }
      await expect(frames).toHaveCount(6);
      await imagesDrawn(page, spreadId);
      await page.waitForTimeout(1000);

      const idle = await measureFrames(page, pid, () => page.waitForTimeout(2000), false);

      // One photo dragged about, then the whole spread (every element selected) dragged about.
      // Each drag must move what it grabbed: frames per second mean nothing for a drag that is ignored.
      const drag = async (grab: 'photo' | 'all') => {
        const left = async () => ((await frames.nth(2).boundingBox()) as { x: number }).x;
        // Aimed before the selection is made: a selection of several puts its own box over them.
        const at = await solidPoint(grab === 'photo' ? frames.nth(2) : frames);
        if (grab === 'photo') await page.mouse.click(at.x, at.y);
        else await page.keyboard.press('Control+a');
        const before = await left();
        const stats = await measureFrames(page, pid, () => wave(page, at, 4000), true);
        const moved = (await left()) - before;
        expect(moved).toBeGreaterThan(50);
        return { ...stats, movedPx: Math.round(moved) };
      };
      const one = await drag('photo');
      const all = await drag('all');
      await record('dragFps', { photos: 6, idle, onePhoto: one, wholeSpread: all });
    });

    await test.step('every spread is visited, and the memory after it', async () => {
      const tiles = page.locator('.shell-strip .tile');
      await expect(tiles).toHaveCount(SPREADS);
      const times: number[] = [];
      const marks: Record<string, MemoryRow & { jsHeapMb: number }> = {};
      for (let i = 0; i < SPREADS; i++) {
        const tile = tiles.nth(i);
        const id = (await tile.getAttribute('data-spread-id')) as string;
        const started = performance.now();
        await tile.click();
        await imagesDrawn(page, id);
        times.push(performance.now() - started);
        if (i === 12 || i === 25) marks[`after${i + 1}Spreads`] = await memoryNow(app, page);
      }
      await page.waitForTimeout(3000);
      marks['afterAllSpreads'] = await memoryNow(app, page);
      // What the editor holds once the JavaScript heap has been collected.
      await (await devtools(page)).send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(1000);
      marks['afterAllSpreadsCollected'] = await memoryNow(app, page);
      await tiles.nth(1).click();
      await page.waitForTimeout(3000);
      marks['backOnSpread2'] = await memoryNow(app, page);
      times.sort((a, b) => a - b);
      await record('browse', {
        spreads: SPREADS,
        meanSpreadMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        medianSpreadMs: Math.round(times[Math.floor(times.length / 2)] as number),
        worstSpreadMs: Math.round(times.at(-1) as number),
      });
      await record('memoryWhileBrowsing', marks);
    });

    await test.step('the overview draws every spread at once', async () => {
      // Whatever its tiles have loaded, once they have been scrolled through.
      const overview = page.getByRole('dialog', { name: 'Vue d’ensemble' });
      const picturesLoaded = () =>
        page.waitForFunction(
          () => {
            const images = [...document.querySelectorAll('.overview img')];
            return images.every((i) => (i as HTMLImageElement).complete);
          },
          undefined,
          { polling: 'raf', timeout: 120_000 },
        );
      const started = performance.now();
      await page.getByRole('button', { name: 'Vue d’ensemble des doubles pages' }).click();
      await expect(overview).toBeVisible();
      await picturesLoaded();
      const openedS = seconds(started);
      const tiles = overview.locator('.tile');
      for (let i = 0; i < SPREADS; i += 6) {
        await tiles.nth(i).scrollIntoViewIfNeeded();
        await picturesLoaded();
      }
      await tiles.last().scrollIntoViewIfNeeded();
      await picturesLoaded();
      await page.waitForTimeout(2000);
      await record('overview', {
        tiles: await tiles.count(),
        openedS,
        scrolledThroughS: seconds(started),
        memory: await memoryNow(app, page),
      });
      await page.keyboard.press('Escape');
      await expect(overview).toHaveCount(0);
    });

    await record('peaksOpenToBrowse', await sampler.stop());
    await quitPackaged(app);
  } finally {
    await app.close().catch(() => {});
  }
  expectNoMainErrors(stderr());
  await rm(join(RUN_DIR, 'open'), { recursive: true, force: true });
});

// --- 3. exports ---------------------------------------------------------------

/** Run the export dialog with `preset`, from the click to the end, with the memory peaks. */
async function measureExport(
  name: string,
  preset: string,
  setup?: (dialog: Locator) => Promise<void>,
) {
  test.setTimeout(2 * 60 * 60 * 1000);
  const copy = await copyFixture(name);
  const out = join(RUN_DIR, name, 'files');
  await mkdir(out, { recursive: true });
  const { app, stderr } = await launchPackaged(copy.userData);
  try {
    const page = await app.firstWindow();
    await openFromHome(app, page, copy.project);
    await pickFolders(app, out);
    await page.getByRole('button', { name: 'Exporter', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Exporter le livre' });
    await expect(dialog).toBeVisible();
    const checking = performance.now();
    await expect(dialog.getByText('Vérification en cours…')).toBeHidden({
      timeout: 10 * 60 * 1000,
    });
    const preflightS = seconds(checking);
    await dialog.getByLabel('Préréglage', { exact: true }).selectOption({ label: preset });
    await dialog.getByRole('button', { name: 'Choisir…' }).click();
    await expect(dialog.getByLabel('Dossier de destination')).toHaveValue(out);
    await setup?.(dialog);

    const sampler = new PeakSampler(app.process().pid as number, 500);
    sampler.start();
    const started = performance.now();
    await dialog.getByRole('button', { name: 'Exporter', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible({
      timeout: 2 * 60 * 60 * 1000,
    });
    const exportS = seconds(started);
    const peaks = await sampler.stop();
    const status = (await dialog.getByRole('status').textContent()) ?? '';
    const files = await readdir(out);
    await record(name, {
      preset,
      seconds: exportS,
      preflightS,
      status: status.replace(/Ouvrir le dossier$/, ''),
      files: files.length,
      totalMb: Math.round((await folderSize(out)) / 1024 ** 2),
      peaks,
    });
    await quitPackaged(app);
    return { files, out, peaks, seconds: exportS };
  } finally {
    await app.close().catch(() => {});
    expectNoMainErrors(stderr());
  }
}

test('export every page as an image at 300 dpi', async () => {
  const done = await measureExport('exportImages', 'Imprimeur en ligne (images)');
  expect(done.files.filter((f) => f.startsWith('page-'))).toHaveLength(100);
  await rm(join(RUN_DIR, 'exportImages'), { recursive: true, force: true });
});

test('export the print PDF of the 25 pages from 2 to 26', async () => {
  const done = await measureExport('exportPdf25', 'Impression sur mesure (PDF)', async (dialog) => {
    await dialog.getByLabel('Pages', { exact: true }).selectOption('range');
    await dialog.getByLabel('Première page').fill('2');
    await dialog.getByLabel('Dernière page').fill('26');
    await dialog.getByLabel('Inclure la couverture').uncheck();
  });
  expect(done.files.some((f) => f.endsWith('-interieur.pdf'))).toBe(true);
  await recordPdfSize('exportPdf25', done.out);
  await rm(join(RUN_DIR, 'exportPdf25'), { recursive: true, force: true });
});

test('export the print PDF of the whole book at 300 dpi', async () => {
  const done = await measureExport('exportPdf100', 'Impression sur mesure (PDF)');
  expect(done.files.some((f) => f.endsWith('-interieur.pdf'))).toBe(true);
  await recordPdfSize('exportPdf100', done.out);
  await rm(join(RUN_DIR, 'exportPdf100'), { recursive: true, force: true });
});

/** The size of the interior PDF, and what the main process held at its peak compared with it. */
async function recordPdfSize(name: string, out: string): Promise<void> {
  const interior = (await readdir(out)).find((f) => f.endsWith('-interieur.pdf')) as string;
  const mb = Math.round((await stat(join(out, interior))).size / 1024 ** 2);
  const peaks = (results[name] as { peaks: { mainMb: number } }).peaks;
  await record(`${name}Interior`, {
    pdfMb: mb,
    mainPeakMb: peaks.mainMb,
    mainPeakOverPdf: Math.round((peaks.mainMb / mb) * 10) / 10,
  });
}
