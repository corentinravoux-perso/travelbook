import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { newElement, type AssetRef, type Book, type ElementBase } from '@travelbook/core';
import type { ExportOptions, ExportReport, TbApi } from '../src/shared/api';
import { launchApp } from './launch';

type Win = { tb: TbApi };

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const OPTIONS: ExportOptions = {
  route: 'images',
  pages: 'all',
  includeCover: false,
  dpi: 300,
  nativeResolution: false,
  bleed: true,
  cropMarks: false,
  imageFormat: 'jpeg',
  jpegQuality: 98,
  perSpread: false,
  coverMode: 'flat',
  outDir: '',
};

/** Pixels per mm at 300 dpi. */
const PX_PER_MM = 300 / 25.4;
/** The red line: one pixel wide at 300 dpi, starting on pixel 1216 of page 2 (with bleed). */
const LINE_PX = 1216;
const LINE_X = (LINE_PX * 25.4) / 300 - 3;

let work: string;
let app: ElectronApplication;
let page: Page;
let projectDir: string;
let photo: AssetRef;
let book: Book;

const run = (options: Partial<ExportOptions>): Promise<ExportReport> =>
  page.evaluate((o) => (window as unknown as Win).tb.exporter.run(o), {
    ...OPTIONS,
    ...options,
  });

/** A smooth horizontal gradient: continuous across the gutter, tolerant of resampling. */
async function gradientJpeg(file: string): Promise<void> {
  const w = 1600;
  const h = 1000;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = Math.round((x / (w - 1)) * 255);
      raw[i + 1] = 90 + Math.round((y / (h - 1)) * 80);
      raw[i + 2] = 255 - Math.round((x / (w - 1)) * 200);
    }
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(file);
}

test.beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-export-'));
  const source = join(work, 'gradient.jpg');
  await gradientJpeg(source);
  app = await launchApp(join(work, 'user data'));
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  const created = await page.evaluate(
    (parentDir) => (window as unknown as Win).tb.project.create({ name: 'Export', parentDir }),
    work,
  );
  if (!created) throw new Error('The album was not created');
  projectDir = created.dir;
  const report = await page.evaluate(
    (path) => (window as unknown as Win).tb.photos.import([path]),
    source,
  );
  photo = report.added[0] as AssetRef;

  // First spread, one inner spread (pages 2 and 3) and the last spread: four pages.
  const inner = created.book.spreads[1]!;
  const crossing = {
    ...newElement('photo', { x: 150, y: 40, w: 120, h: 80 }),
    id: 'crossing',
    assetId: photo.id,
  };
  const line = {
    ...newElement('shape', { x: LINE_X, y: 150, w: 25.4 / 300, h: 100 }),
    id: 'line',
    shape: 'rect' as const,
    fill: '#ff0000',
  } satisfies ElementBase & Record<string, unknown>;
  book = {
    ...created.book,
    assets: { [photo.id]: photo },
    spreads: [
      created.book.spreads[0]!,
      {
        ...inner,
        background: { spread: { kind: 'color', color: '#ffffff' } },
        elements: [crossing, line],
      },
      created.book.spreads.at(-1)!,
    ],
  };
  await page.evaluate((b) => (window as unknown as Win).tb.project.save(b), book);
});

test.afterAll(async () => {
  await app?.close();
  await rm(work, { recursive: true, force: true });
});

/** Column `x` of the page, as RGB triplets down the rows from `top` to `bottom`. */
async function column(file: string, x: number, top: number, bottom: number): Promise<number[][]> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const rows: number[][] = [];
  for (let y = top; y < bottom; y++) {
    const i = (y * info.width + x) * info.channels;
    rows.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  }
  return rows;
}

test('exports every page at 300 dpi with the bleed, as sRGB JPEG with its dpi', async () => {
  const outDir = join(work, 'bleed');
  const progress = await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    (window as unknown as Win).tb.exporter.onProgress((p) =>
      seen.push(`${p.page}/${p.total} ${p.step}`),
    );
    return seen;
  });
  expect(progress).toEqual([]);
  const report = await run({ outDir });
  expect(report.pages).toBe(4);
  expect(report.files.map((f) => f.slice(outDir.length + 1))).toEqual([
    'page-001.jpg',
    'page-002.jpg',
    'page-003.jpg',
    'page-004.jpg',
  ]);
  for (const file of report.files) {
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height], file).toEqual([2551, 3579]);
    expect(meta.format).toBe('jpeg');
    expect(meta.space).toBe('srgb');
    expect(meta.density).toBe(300);
    expect(meta.icc, 'an embedded profile').toBeDefined();
    expect(meta.chromaSubsampling).toBe('4:4:4');
  }
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).toContain('1/4 derivatives');
  expect(seen).toContain('4/4 capture');
  const perPage = report.seconds / report.pages;
  console.log(
    `export at 300 dpi: ${report.seconds.toFixed(1)} s for 4 pages, ${perPage.toFixed(2)} s per page`,
  );
  test
    .info()
    .annotations.push({ type: 'seconds per page at 300 dpi', description: perPage.toFixed(2) });
});

test('cuts the pages at the trim box without the bleed, and writes PNG', async () => {
  const outDir = join(work, 'trim');
  const report = await run({ outDir, bleed: false, imageFormat: 'png', pages: { from: 2, to: 3 } });
  expect(report.files.map((f) => f.slice(outDir.length + 1))).toEqual([
    'page-002.png',
    'page-003.png',
  ]);
  for (const file of report.files) {
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height], file).toEqual([2480, 3508]);
    expect(meta.format).toBe('png');
    expect(meta.space).toBe('srgb');
    expect(meta.density).toBe(300);
    expect(meta.icc).toBeDefined();
  }
});

test('a photo across the gutter continues from page 2 to page 3', async () => {
  const outDir = join(work, 'bleed');
  // The spine is at x = 210 mm. Page 2 starts 3 mm before 0 (its bleed), page 3 3 mm before 210.
  const left = Math.floor((210 + 3) * PX_PER_MM);
  const right = Math.floor(3 * PX_PER_MM);
  // Rows of the photo: 40 to 120 mm of the spread, plus the bleed.
  const top = Math.round((60 + 3) * PX_PER_MM);
  const bottom = Math.round((100 + 3) * PX_PER_MM);
  const a = await column(join(outDir, 'page-002.jpg'), left, top, bottom);
  const b = await column(join(outDir, 'page-003.jpg'), right, top, bottom);
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a[i]![c]! - b[i]![c]!));
  }
  // A pixel is 0.085 mm: the gradient moves by about 1 level between neighbours.
  expect(worst).toBeLessThanOrEqual(6);
  // And the photo is there: the column is not the white of the background.
  expect(a[0]![2]).toBeLessThan(250);
});

test('a one-pixel red line lands on its pixel, within one pixel', async () => {
  const file = join(work, 'bleed', 'page-002.jpg');
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  // The line is 150 to 250 mm down the spread, plus the bleed.
  const rows = [
    Math.round(160 * PX_PER_MM),
    Math.round(200 * PX_PER_MM),
    Math.round(240 * PX_PER_MM),
  ];
  for (const y of rows) {
    let best = -1;
    let bestRed = 0;
    for (let x = LINE_PX - 20; x < LINE_PX + 20; x++) {
      const i = (y * info.width + x) * info.channels;
      const red = data[i]! - (data[i + 1]! + data[i + 2]!) / 2;
      if (red > bestRed) {
        bestRed = red;
        best = x;
      }
    }
    expect(bestRed, `row ${y} has a red pixel`).toBeGreaterThan(60);
    expect(Math.abs(best - LINE_PX), `row ${y}`).toBeLessThanOrEqual(1);
  }
});

test('a missing original rejects with its name and the page, and leaves no file', async () => {
  const outDir = join(work, 'missing');
  await mkdir(outDir, { recursive: true });
  await rm(join(projectDir, photo.file));
  const failure = await page.evaluate(
    (o) =>
      (window as unknown as Win).tb.exporter.run(o).then(
        () => null,
        (e: Error) => e.message,
      ),
    {
      ...OPTIONS,
      outDir,
    },
  );
  expect(failure).toContain(photo.originalName);
  expect(failure).toContain('page 2');
  // Page 1 was written before page 2 was found wanting: it is removed with the rest.
  expect(await readdir(outDir)).toEqual([]);
  // The export can run again once nothing is wrong.
  await writeFile(join(work, 'unused.txt'), 'ok');
  const again = await run({ outDir, pages: { from: 1, to: 1 } });
  expect(again.files).toHaveLength(1);
});
