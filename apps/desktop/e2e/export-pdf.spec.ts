import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  newElement,
  type AssetRef,
  type Book,
  type Element,
  type PhotoElement,
  type Spread,
  type StickerElement,
  type TextElement,
} from '@travelbook/core';
import type { ExportOptions, ExportReport, TbApi } from '../src/shared/api';
import { launchApp } from './launch';

type Win = { tb: TbApi };

test.describe.configure({ mode: 'serial', timeout: 300_000 });

const run = promisify(execFile);

const OPTIONS: ExportOptions = {
  route: 'pdf',
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

/** Where to keep the PDFs for a look (set by whoever debugs the export). */
const KEEP = process.env['TB_KEEP_PDF'];

let work: string;
let app: ElectronApplication;
let page: Page;
let book: Book;
let photoAsset: AssetRef;
let projectDir: string;

const exportWith = (options: Partial<ExportOptions>): Promise<ExportReport> =>
  page.evaluate((o) => (window as unknown as Win).tb.exporter.run(o), { ...OPTIONS, ...options });

async function poppler(tool: string, ...args: string[]): Promise<string> {
  const { stdout } = await run(tool, args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

interface PdfImage {
  page: number;
  type: string;
  width: number;
  height: number;
  enc: string;
}

/** `pdfimages -list` of the PDF, one row per image object (the soft masks included). */
async function pdfImages(file: string, pageNo?: number): Promise<PdfImage[]> {
  const range = pageNo === undefined ? [] : ['-f', String(pageNo), '-l', String(pageNo)];
  const out = await poppler('pdfimages', '-list', ...range, file);
  return out
    .split('\n')
    .slice(2)
    .filter((l) => l.trim() !== '')
    .map((l) => l.trim().split(/\s+/))
    .map((c) => ({
      page: Number(c[0]),
      type: c[2]!,
      width: Number(c[3]),
      height: Number(c[4]),
      enc: c[8]!,
    }));
}

/** Box `name` of page 1 in mm, from `pdfinfo -box`. */
async function box(file: string, name: string, pageNo = 1): Promise<[number, number]> {
  const out = await poppler('pdfinfo', '-box', '-f', String(pageNo), '-l', String(pageNo), file);
  const m = new RegExp(
    `^Page\\s+${pageNo} ${name}:\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)`,
    'm',
  ).exec(out);
  if (!m) throw new Error(`no ${name} in ${out}`);
  const [x0, y0, x1, y1] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
  return [((x1 - x0) * 25.4) / 72, ((y1 - y0) * 25.4) / 72];
}

/** Mean absolute difference of two images, as a fraction of 255 (the second is resized to the first). */
async function meanAbsDiff(a: string, b: string): Promise<number> {
  const first = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const second = await sharp(b)
    .removeAlpha()
    .resize(first.info.width, first.info.height, { fit: 'fill' })
    .raw()
    .toBuffer();
  let sum = 0;
  for (let i = 0; i < first.data.length; i++) sum += Math.abs(first.data[i]! - second[i]!);
  return sum / first.data.length / 255;
}

async function keep(file: string, name: string): Promise<void> {
  if (!KEEP) return;
  await mkdir(KEEP, { recursive: true });
  await copyFile(file, join(KEEP, name));
}

async function writeAssets(dir: string): Promise<Record<string, AssetRef>> {
  const assets = join(dir, 'assets');
  await mkdir(assets, { recursive: true });
  // A stencil: black discs on a transparent tile.
  const stencil = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="50" cy="50" r="30"/><circle cx="150" cy="150" r="30"/></svg>',
  );
  await writeFile(join(assets, 'stencil.svg'), stencil);
  const sticker = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><path d="M200 20 L380 380 L20 380 Z"/></svg>',
  );
  await sharp(sticker).png().toFile(join(assets, 'sticker.png'));
  const w = 1200;
  const h = 800;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x * 255) / w;
      raw[i + 1] = (y * 255) / h;
      raw[i + 2] = ((x + y) * 255) / (w + h);
    }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(join(assets, 'background.jpg'));
  const ref = (
    id: string,
    kind: AssetRef['kind'],
    file: string,
    w: number,
    h: number,
  ): AssetRef => ({
    id,
    kind,
    file: `assets/${file}`,
    originalName: file,
    sha256: id,
    pixel: { w, h },
  });
  return {
    stencil: ref('stencil', 'pattern', 'stencil.svg', 200, 200),
    sticker: ref('sticker', 'sticker', 'sticker.png', 400, 400),
    background: ref('background', 'background', 'background.jpg', w, h),
  };
}

/** A smooth, detailed photo: 2400 x 1600 so that a derivative at 300 dpi is smaller than it. */
async function photoJpeg(file: string): Promise<void> {
  const w = 2400;
  const h = 1600;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const stripe = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0 ? 30 : 0;
      raw[i] = Math.min(255, (x * 200) / w + stripe);
      raw[i + 1] = Math.min(255, 60 + (y * 150) / h + stripe);
      raw[i + 2] = Math.min(255, 255 - (x * 180) / w + stripe);
    }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 92 })
    .toFile(file);
}

const text = (
  rect: { x: number; y: number; w: number; h: number },
  content: string,
): TextElement => ({
  ...newElement('text', rect),
  doc: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
  },
  style: {
    fontFamily: 'Playfair Display',
    fontSizePt: 28,
    color: '#222222',
    lineHeight: 1.3,
    letterSpacing: 0,
  },
});

const ZERO = { x: 0, y: 0, w: 1, h: 1 };

/** Page `n` of the fixture (10 pages); each effect to prove has a page of its own. */
const PAGE = {
  look: 1,
  photoShadow: 2,
  textShadow: 3,
  pattern: 4,
  stickerTint: 5,
  backgroundBlur: 6,
  backgroundTint: 7,
  featheredShadow: 8,
  plain: 10,
} as const;
const PAGES = 10;

/** Pixels of `mm` at 300 dpi, as the derivative rounds them. */
const px = (mm: number): number => Math.round((mm * 300) / 25.4);

function fixtureBook(base: Book, photo: AssetRef, assets: Record<string, AssetRef>): Book {
  const photoEl = (rect: { x: number; y: number; w: number; h: number }): PhotoElement => ({
    ...newElement('photo', rect),
    assetId: photo.id,
  });
  const [first, a, b, c, d, last] = [
    base.spreads[0]!,
    base.spreads[1]!,
    base.spreads[2]!,
    base.spreads[3]!,
    base.spreads[4]!,
    base.spreads.at(-1)!,
  ];
  const withElements = (
    s: Spread,
    elements: Element[],
    background: Spread['background'] = {},
  ): Spread => ({
    ...s,
    background,
    elements,
  });
  const look: PhotoElement = {
    ...photoEl({ x: 225, y: 40, w: 160, h: 110 }),
    id: 'look',
    adjust: { brightness: 1, contrast: 1, saturation: 1.3, grayscale: 0, sepia: 0, vignette: 0.5 },
    edge: { feather: 4 },
  };
  const shadowed: PhotoElement = {
    ...photoEl({ x: 30, y: 60, w: 150, h: 100 }),
    id: 'shadowed',
    shadow: { dx: 3, dy: 3, blur: 6, color: '#000000aa' },
  };
  const caption: TextElement = {
    ...text({ x: 230, y: 60, w: 150, h: 40 }, 'Ombre du texte'),
    id: 'caption',
    shadow: { dx: 1, dy: 1, blur: 1.5, color: '#444444' },
  };
  const sticker: StickerElement = {
    ...newElement('sticker', { x: 250, y: 60, w: 80, h: 80 }),
    id: 'sticker',
    assetId: 'sticker',
    tint: '#cc2244',
  };
  return {
    ...base,
    assets: { [photo.id]: photo, ...assets },
    spreads: [
      withElements(first, [look]),
      withElements(a, [shadowed, caption]),
      withElements(b, [sticker], {
        left: { kind: 'pattern', assetId: 'stencil', fg: '#3366aa', bg: '#f4ecd8', scale: 1 },
      }),
      // A photo of page 7 flush with the spine: page 6's bleed reaches past the spine.
      withElements(c, [{ ...photoEl({ x: 210, y: 100, w: 80, h: 60 }), id: 'facing' }], {
        left: {
          kind: 'image',
          assetId: 'background',
          fit: 'cover',
          opacity: 1,
          blur: 3,
          tint: null,
        },
        right: {
          kind: 'image',
          assetId: 'background',
          fit: 'cover',
          opacity: 0.8,
          blur: 0,
          tint: '#88aa44',
        },
      }),
      withElements(d, [
        {
          ...photoEl({ x: 30, y: 60, w: 150, h: 100 }),
          id: 'feathered-shadow',
          shadow: { dx: 2, dy: 2, blur: 5, color: '#000000aa' },
          edge: { feather: 5 },
        },
        text({ x: 230, y: 60, w: 150, h: 40 }, 'Neuf'),
      ]),
      withElements(last, [
        // A bundled font that is not one of the six of `bookFonts`.
        {
          ...text({ x: 30, y: 60, w: 150, h: 40 }, 'Fin de l’album'),
          style: { ...text(ZERO, '').style, fontFamily: "'Pacifico', cursive" },
        },
        { ...photoEl({ x: 30, y: 120, w: 150, h: 100 }), id: 'plain' },
      ]),
    ],
  };
}

test.beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-pdf-'));
  const source = join(work, 'photo.jpg');
  await photoJpeg(source);
  app = await launchApp(join(work, 'user data'));
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const created = await page.evaluate(
    (parentDir) => (window as unknown as Win).tb.project.create({ name: 'Export PDF', parentDir }),
    work,
  );
  if (!created) throw new Error('The album was not created');
  const imported = await page.evaluate(
    (path) => (window as unknown as Win).tb.photos.import([path]),
    source,
  );
  photoAsset = imported.added[0] as AssetRef;
  projectDir = created.dir;
  const assets = await writeAssets(created.dir);
  book = fixtureBook(created.book, photoAsset, assets);
  await page.evaluate((b) => (window as unknown as Win).tb.project.save(b), book);
});

test.afterAll(async () => {
  await app?.close();
  await rm(work, { recursive: true, force: true });
});

let interior: string;
let exportSeconds: number;

test('exports the pages as one PDF of 216 x 303 mm pages with a 210 x 297 mm TrimBox', async () => {
  const outDir = join(work, 'bleed');
  const report = await exportWith({ outDir, pages: 'all' });
  expect(report.files).toEqual([join(outDir, 'export-pdf-interieur.pdf')]);
  expect(report.pages).toBe(PAGES);
  interior = report.files[0]!;
  exportSeconds = report.seconds;
  await keep(interior, 'interieur.pdf');
  const info = await poppler('pdfinfo', '-box', interior);
  expect(info).toMatch(new RegExp(`Pages:\\s+${PAGES}\\b`));
  // 216 x 303 mm = 612.283 x 858.898 pt.
  expect(info).toContain('Page size:       612.283 x 858.898 pts');
  for (const n of [1, 5, PAGES]) {
    const [w, h] = await box(interior, 'MediaBox', n);
    expect([w, h]).toEqual([expect.closeTo(216, 2), expect.closeTo(303, 2)]);
    const [tw, th] = await box(interior, 'TrimBox', n);
    expect([tw, th]).toEqual([expect.closeTo(210, 2), expect.closeTo(297, 2)]);
    const [bw, bh] = await box(interior, 'BleedBox', n);
    expect([bw, bh]).toEqual([expect.closeTo(216, 2), expect.closeTo(303, 2)]);
  }
  const perPage = exportSeconds / report.pages;
  console.log(
    `PDF at 300 dpi: ${exportSeconds.toFixed(1)} s for ${PAGES} pages (one at 600 dpi), ${perPage.toFixed(2)} s per page`,
  );
  test
    .info()
    .annotations.push({ type: 'seconds per page, pdf, 300 dpi', description: perPage.toFixed(2) });
});

test('time of a vector page and of a page captured at 600 dpi', async () => {
  const vector = await exportWith({
    outDir: join(work, 'time-vector'),
    pages: { from: 9, to: 10 },
  });
  const raster = await exportWith({ outDir: join(work, 'time-raster'), pages: { from: 8, to: 8 } });
  const perVector = vector.seconds / vector.pages;
  console.log(
    `PDF page at 300 dpi: ${perVector.toFixed(2)} s (a text page and a photo page); page captured at 600 dpi: ${raster.seconds.toFixed(1)} s`,
  );
  test
    .info()
    .annotations.push(
      { type: 'seconds per vector page', description: perVector.toFixed(2) },
      { type: 'seconds per raster fallback page', description: raster.seconds.toFixed(1) },
    );
});

test('embeds every font', async () => {
  const out = await poppler('pdffonts', interior);
  const rows = out
    .split('\n')
    .slice(2)
    .filter((l) => l.trim() !== '');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row, row).toMatch(/\syes\s+yes\s+yes\s+\d+\s+\d+$/);
  expect(out).toContain('PlayfairDisplay');
  // A bundled font beyond the six the export page always declares.
  expect(out).toContain('Pacifico');
});

test("a page alone does not show the facing page's photo in its bleed past the spine", async () => {
  // The photo of page 7 is in page 7, and not in page 6.
  const facing = (i: PdfImage): boolean => i.width === px(80) && i.height === px(60);
  expect((await pdfImages(interior, PAGE.backgroundTint)).filter(facing)).toHaveLength(1);
  expect((await pdfImages(interior, PAGE.backgroundBlur)).filter(facing)).toEqual([]);
  // Page 6's bleed past the spine (213 to 216 mm across) is paper: neither that photo nor page
  // 7's tinted background.
  const png = join(work, 'spine-bleed');
  await poppler(
    'pdftoppm',
    '-r',
    '100',
    '-f',
    String(PAGE.backgroundBlur),
    '-l',
    String(PAGE.backgroundBlur),
    '-png',
    '-singlefile',
    interior,
    png,
  );
  const { data, info } = await sharp(`${png}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = (xMm: number, yMm: number): number[] => {
    const i = (Math.round((yMm * 100) / 25.4) * info.width + Math.round((xMm * 100) / 25.4)) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  for (const y of [50, 133, 250]) {
    for (const c of rgb(214.5, y)) expect(c, `spine bleed at ${y} mm`).toBeGreaterThan(245);
  }
  // Inside the trim, by the spine, the page's own background is drawn.
  expect(Math.min(...rgb(211, 133))).toBeLessThan(245);
});

test('keeps text as text', async () => {
  const text = await poppler(
    'pdftotext',
    '-f',
    String(PAGE.textShadow),
    '-l',
    String(PAGE.textShadow),
    interior,
    '-',
  );
  expect(text).toContain('Ombre');
  expect(text).toContain('texte');
});

test('a photo with saturation, a vignette and a feather is its derivative, and nothing else', async () => {
  // 160 x 110 mm at 300 dpi; the feather makes it a PNG with alpha (an image and its soft mask).
  const images = await pdfImages(interior, PAGE.look);
  expect(images.map((i) => i.type)).toEqual(['image', 'smask']);
  for (const i of images) expect([i.width, i.height]).toEqual([px(160), px(110)]);
});

test('a plain photo is the JPEG of its derivative, at its pixel size', async () => {
  const images = await pdfImages(interior, PAGE.plain);
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ width: px(150), height: px(100), enc: 'jpeg' });
});

test('a photo with a shadow stays a JPEG of its derivative; the shadow is a separate image', async () => {
  const images = await pdfImages(interior, PAGE.photoShadow);
  const photos = images.filter((i) => i.enc === 'jpeg' && i.type === 'image');
  expect(photos).toHaveLength(1);
  expect([photos[0]!.width, photos[0]!.height]).toEqual([px(150), px(100)]);
  // The rest is the shadow: a flat colour with a soft mask, no photo content, and no Flate copy of
  // the photo at 300 dpi (which is what a filter on the photo made of it).
  for (const i of images.filter((x) => x !== photos[0]))
    expect(i.type === 'smask' || i.enc === 'image').toBe(true);
  const flatCopies = images.filter((i) => i.type === 'image' && i.enc === 'image');
  for (const copy of flatCopies) {
    const [row] = (
      await poppler(
        'pdfimages',
        '-list',
        '-f',
        String(PAGE.photoShadow),
        '-l',
        String(PAGE.photoShadow),
        interior,
      )
    )
      .split('\n')
      .filter(
        (l) =>
          l.includes(`${copy.width} ${copy.height}`) || l.includes(`${copy.width}  ${copy.height}`),
      );
    expect(row).toMatch(/\b\d{1,4}B\b/); // a few bytes: one colour
  }
});

test('a text shadow leaves the glyphs vector: only a small mask is an image', async () => {
  const images = await pdfImages(interior, PAGE.textShadow);
  for (const i of images) expect(i.width * i.height).toBeLessThan(px(150) * px(40));
});

test('a pattern background is a tile image at 600 dpi, not a 300 dpi mask', async () => {
  // 20 mm tile at 600 dpi. `pdfimages` does not list images inside a tiling pattern: read the file.
  const raw = (await readFile(interior)).toString('latin1');
  expect(raw).toContain('/Width 472');
  expect(await pdfImages(interior, PAGE.pattern)).toEqual([]);
});

test('a tinted sticker is drawn from its own pixels, not from a larger raster', async () => {
  const images = await pdfImages(interior, PAGE.stickerTint);
  for (const i of images) expect([i.width, i.height]).toEqual([400, 400]);
});

test('a feathered photo with a shadow sends its page to the 600 dpi capture', async () => {
  const images = await pdfImages(interior, PAGE.featheredShadow);
  expect(images).toHaveLength(1);
  // 216 x 303 mm at 600 dpi, as a JPEG.
  expect(images[0]).toMatchObject({ width: 5102, height: 7157, enc: 'jpeg' });
  // The text of the page is part of the capture.
  const text = await poppler('pdftotext', '-f', '8', '-l', '8', interior, '-');
  expect(text.trim()).toBe('');
});

test('every page matches the image route, within 2 % mean absolute difference', async () => {
  const images = await exportWith({
    route: 'images',
    outDir: join(work, 'reference'),
    pages: 'all',
  });
  expect(images.files).toHaveLength(PAGES);
  const worst: string[] = [];
  for (let n = 1; n <= PAGES; n++) {
    const png = join(work, `page-${n}`);
    await poppler(
      'pdftoppm',
      '-r',
      '300',
      '-f',
      String(n),
      '-l',
      String(n),
      '-png',
      '-singlefile',
      interior,
      png,
    );
    const mad = await meanAbsDiff(`${png}.png`, images.files[n - 1]!);
    worst.push(`page ${n}: ${(mad * 100).toFixed(2)} %`);
    expect(mad, `page ${n}`).toBeLessThan(0.02);
  }
  console.log(worst.join(', '));
});

test('with crop marks the MediaBox is 230 x 317 mm and the TrimBox is unchanged', async () => {
  const outDir = join(work, 'marks');
  const report = await exportWith({ outDir, cropMarks: true, pages: { from: 4, to: 5 } });
  const file = report.files[0]!;
  const [w, h] = await box(file, 'MediaBox', 1);
  expect([w, h]).toEqual([expect.closeTo(230, 2), expect.closeTo(317, 2)]);
  const [tw, th] = await box(file, 'TrimBox', 1);
  expect([tw, th]).toEqual([expect.closeTo(210, 2), expect.closeTo(297, 2)]);
  // The horizontal mark of the top-left corner runs along the trim edge (10 mm down), from 4 to
  // 7 mm across, outside the 3 mm bleed (which starts at 7 mm): its pixels are dark, and the page
  // beside it, in the slug, is white.
  const png = join(work, 'marks-page');
  await poppler('pdftoppm', '-r', '600', '-f', '1', '-l', '1', '-png', '-singlefile', file, png);
  const { data, info } = await sharp(`${png}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (xMm: number, yMm: number): number =>
    data[(Math.round((yMm * 600) / 25.4) * info.width + Math.round((xMm * 600) / 25.4)) * 3]!;
  const darkestOnLine = Math.min(
    ...[9.97, 10, 10.03].map((y) => at(5.5, y)),
    ...[9.95, 10, 10.05].map((y) => at(5.5, y)),
  );
  expect(darkestOnLine).toBeLessThan(120);
  expect(at(5.5, 8)).toBeGreaterThan(240);
  expect(at(2, 10)).toBeGreaterThan(240);
});

test('the cover is a flat sheet of its own: both covers, the spine and the cover bleed', async () => {
  const outDir = join(work, 'cover');
  const report = await exportWith({ outDir, includeCover: true, pages: { from: 1, to: 1 } });
  expect(report.files.map((f) => f.slice(outDir.length + 1))).toEqual([
    'export-pdf-couverture.pdf',
    'export-pdf-interieur.pdf',
  ]);
  const spine = book.spineWidth;
  const bleed = book.coverBleed;
  const [w, h] = await box(report.files[0]!, 'MediaBox');
  expect([w, h]).toEqual([
    expect.closeTo(2 * 210 + spine + 2 * bleed, 2),
    expect.closeTo(297 + 2 * bleed, 2),
  ]);
  const [tw, th] = await box(report.files[0]!, 'TrimBox');
  expect([tw, th]).toEqual([expect.closeTo(2 * 210 + spine, 2), expect.closeTo(297, 2)]);
});

test('the screen reading preset is one file, cover first, 150 dpi, no bleed and no marks', async () => {
  const outDir = join(work, 'screen');
  const report = await exportWith({
    outDir,
    perSpread: true,
    includeCover: true,
    dpi: 150,
    bleed: false,
    cropMarks: false,
    pages: { from: 1, to: 3 },
  });
  expect(report.files).toEqual([join(outDir, 'export-pdf-interieur.pdf')]);
  const file = report.files[0]!;
  // Cover, page 1 alone, double page 2-3.
  expect(await poppler('pdfinfo', file)).toMatch(/Pages:\s+3\b/);
  const [cw] = await box(file, 'MediaBox', 1);
  expect(cw).toBeCloseTo(2 * 210 + book.spineWidth, 1);
  const [pw, ph] = await box(file, 'MediaBox', 2);
  expect([pw, ph]).toEqual([expect.closeTo(210, 1), expect.closeTo(297, 1)]);
  const [dw] = await box(file, 'MediaBox', 3);
  expect(dw).toBeCloseTo(420, 1);
  // The photo of page 1 is the 150 dpi derivative of its 160 x 110 mm frame.
  const images = await pdfImages(file, 2);
  expect(images[0]).toMatchObject({ width: Math.round((160 * 150) / 25.4) });
});

test('with the cover as pages: one PDF, the front cover first and the back cover last', async () => {
  const outDir = join(work, 'cover-pages');
  const report = await exportWith({
    outDir,
    includeCover: true,
    coverAsPages: true,
    pages: { from: 1, to: 2 },
  });
  expect(report.files).toEqual([join(outDir, 'export-pdf.pdf')]);
  const file = report.files[0]!;
  expect(await poppler('pdfinfo', file)).toMatch(/Pages:\s+4\b/);
  for (const n of [1, 4]) {
    const [w, h] = await box(file, 'MediaBox', n);
    expect([w, h]).toEqual([expect.closeTo(216, 2), expect.closeTo(303, 2)]);
    const [tw, th] = await box(file, 'TrimBox', n);
    expect([tw, th]).toEqual([expect.closeTo(210, 2), expect.closeTo(297, 2)]);
  }
  // Page 2 is page 1 of the album: its photo.
  expect(await pdfImages(file, 2)).not.toEqual([]);
});

test('a missing original rejects with its name and the page, and leaves no file', async () => {
  const outDir = join(work, 'missing');
  await rm(join(projectDir, photoAsset.file));
  const failure = await page.evaluate(
    (o) =>
      (window as unknown as Win).tb.exporter.run(o).then(
        () => null,
        (e: Error) => e.message,
      ),
    { ...OPTIONS, outDir, pages: { from: 1, to: 2 } },
  );
  expect(failure).toContain(photoAsset.originalName);
  expect(failure).toContain('page 1');
  expect(await readdir(outDir)).toEqual([]);
});
