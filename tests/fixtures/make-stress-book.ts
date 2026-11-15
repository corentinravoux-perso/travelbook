/**
 * The stress fixture of Task 8.2: a 100-page book of 400 generated 24-megapixel JPEGs (4 per
 * page, a different template on neighbouring pages), a line of text on every page and 200
 * stickers. Nothing here is a real photograph, and nothing is committed: everything lands in
 * `tests/fixtures/out/stress/` (git-ignored).
 *
 *   node tests/fixtures/make-stress-book.ts      generate the 400 JPEGs that are missing
 *   npm run e2e:stress -w @travelbook/desktop    build the project from them, then measure
 *
 * The JPEGs are made here, in plain Node. The project is made by the packaged app itself (the
 * stress spec imports the photos through `window.tb`, which is also what the import timing
 * measures) and then laid out by `buildStressBook` below, with the same `applyTemplate` the
 * editor uses. `@travelbook/core` is therefore loaded only inside `buildStressBook`: Node cannot
 * load its extension-less imports, so the command above must work without it.
 */
import { mkdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { AssetRef, Book, Template } from '@travelbook/core';

export const STRESS_DIR = join(import.meta.dirname, 'out', 'stress');
export const STRESS_PHOTOS_DIR = join(STRESS_DIR, 'photos');
/** The finished project: the book, `originals/` and `cache/`, as the app writes them. */
export const STRESS_PROJECT_DIR = join(STRESS_DIR, 'stress.travelbook');

export const STRESS_PHOTOS = 400;
/** 100 pages: the first page, 49 spreads of two, and the last page. */
export const STRESS_INNER_SPREADS = 49;
export const STRESS_STICKERS = 200;
/** Pixels of a stress photo: 24 megapixels, 3:2. */
export const STRESS_SIZE = { w: 6000, h: 4000 } as const;

/** Free space the fixture needs before it starts: photos, project copy, exports, with room to spare. */
const MIN_FREE_BYTES = 10 * 1024 ** 3;

export const stressPhotoName = (index: number): string =>
  `stress-${String(index + 1).padStart(4, '0')}.jpg`;

/** A small deterministic generator (mulberry32), so a photo is the same on every machine. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A square of Gaussian grey noise (Box-Muller), as raw RGB bytes centred on mid-grey. */
function grainTile(size: number, sigma: number, rand: () => number): Buffer {
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < out.length; i += 3) {
    const g = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const v = Math.min(255, Math.max(0, Math.round(128 + sigma * g)));
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
  }
  return out;
}

/** The capture time of photo `index`: twelve days of a trip, a few minutes apart, in EXIF notation. */
function takenAt(index: number): string {
  const day = 1 + Math.floor(index / 34);
  const minutes = 8 * 60 + (index % 34) * 17;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `2026:08:${p(day)} ${p(Math.floor(minutes / 60))}:${p(minutes % 60)}:00`;
}

/**
 * One photo-like JPEG of `w` x `h` px: a soft sky-to-ground gradient, translucent shapes and film
 * grain, so that it compresses the way a camera file does (about 4 to 7 MB at 24 MP) instead of
 * like a flat colour or like pure noise. Different content for each `index`. The EXIF holds a
 * capture time only.
 */
export async function stressPhoto(index: number, w: number, h: number): Promise<Buffer> {
  const rand = random(index * 7919 + 13);
  const hue = rand() * 360;

  // A 16 x 10 grid of colours, from a sky palette at the top to a ground palette at the bottom,
  // spread over the whole picture with a cubic kernel.
  const gw = 16;
  const gh = 10;
  const grid = Buffer.alloc(gw * gh * 3);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = y / gh;
      const sky = [120 + 60 * rand(), 160 + 50 * rand(), 200 + 40 * rand()];
      const ground = [60 + 80 * rand(), 70 + 90 * rand(), 40 + 60 * rand()];
      for (let c = 0; c < 3; c++) {
        grid[(y * gw + x) * 3 + c] = Math.round(
          (sky[c] as number) * (1 - t) + (ground[c] as number) * t,
        );
      }
    }
  }

  let shapes = '';
  for (let k = 0; k < 14; k++) {
    const x = rand() * w;
    const y = rand() * h;
    const s = (0.03 + 0.2 * rand()) * Math.min(w, h);
    const fill = `hsl(${Math.round((hue + 360 * rand()) % 360)} ${Math.round(30 + 50 * rand())}% ${Math.round(25 + 50 * rand())}%)`;
    const opacity = (0.4 + 0.5 * rand()).toFixed(2);
    shapes +=
      k % 2 === 0
        ? `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(s * 1.6).toFixed(0)}" height="${s.toFixed(0)}" fill="${fill}" fill-opacity="${opacity}" transform="rotate(${(rand() * 40 - 20).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`
        : `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(0)}" fill="${fill}" fill-opacity="${opacity}"/>`;
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes}</svg>`,
  );

  // The grain is a 1024 px tile of Gaussian noise repeated over the picture (a full-size noise
  // layer takes three times as long to make). Its strength sets the file size: 9 to 17.
  const grain = sharp(grainTile(1024, 9 + 8 * rand(), rand), {
    raw: { width: 1024, height: 1024, channels: 3 },
  })
    .png()
    .toBuffer();

  return sharp(grid, { raw: { width: gw, height: gh, channels: 3 } })
    .resize(w, h, { kernel: 'cubic' })
    .composite([{ input: svg }, { input: await grain, blend: 'soft-light', tile: true }])
    .jpeg({ quality: 92 })
    .withExifMerge({ IFD2: { DateTimeOriginal: takenAt(index) } })
    .toBuffer();
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Run `task` over `items`, at most `workers` at a time. */
async function inPool<T>(
  items: readonly T[],
  workers: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) await task(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker));
}

export interface EnsureStressPhotosOptions {
  /** Photos made at the same time. Default 6: each holds a few hundred megabytes while it works. */
  workers?: number;
  onProgress?(done: number, total: number): void;
}

/**
 * Make the stress photos that are not on disk yet, in `STRESS_PHOTOS_DIR`: `STRESS_PHOTOS` files,
 * a quarter of them portrait. Idempotent, and an interrupted run leaves no half-written file.
 * Refuses to run, naming the numbers, when the disk has less than 10 GB free (the photos, the
 * project and the exports of a run need that much). Returns the paths of every photo, in name
 * order.
 */
export async function ensureStressPhotos(
  options: EnsureStressPhotosOptions = {},
): Promise<string[]> {
  await mkdir(STRESS_PHOTOS_DIR, { recursive: true });
  const all = Array.from({ length: STRESS_PHOTOS }, (_, i) => ({
    index: i,
    path: join(STRESS_PHOTOS_DIR, stressPhotoName(i)),
  }));
  // The fixture is more than its photos: the project copies and the exports of a run need room too.
  const disk = await statfs(STRESS_PHOTOS_DIR);
  const free = disk.bavail * disk.bsize;
  if (free < MIN_FREE_BYTES) {
    throw new Error(
      `Only ${(free / 1024 ** 3).toFixed(1)} GB free under ${STRESS_PHOTOS_DIR}: the stress fixture needs 10 GB.`,
    );
  }
  const missing: typeof all = [];
  for (const photo of all) if (!(await exists(photo.path))) missing.push(photo);
  if (missing.length === 0) return all.map((p) => p.path);

  let done = all.length - missing.length;
  await inPool(missing, options.workers ?? 6, async ({ index, path }) => {
    // Every fourth photo is an upright one, so that the templates meet both orientations.
    const portrait = index % 4 === 3;
    const bytes = await stressPhoto(
      index,
      portrait ? STRESS_SIZE.h : STRESS_SIZE.w,
      portrait ? STRESS_SIZE.w : STRESS_SIZE.h,
    );
    const tmp = `${path}.tmp`;
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    options.onProgress?.(++done, all.length);
  });
  return all.map((p) => p.path);
}

/** Captions of the pages: any short sentence will do, French as the app is. */
const CAPTIONS = [
  'Le port au lever du jour',
  'Une pause sur la route de la côte',
  'Le marché du samedi matin',
  'Là-haut, le vent ne s’arrête jamais',
  'Déjeuner au bord de l’eau',
  'Les ruelles de la vieille ville',
  'Dernier soir avant le départ',
  'Un détour qui valait la peine',
];

export interface StressBookInput {
  title: string;
  /** The 400 photos as the import reported them, in name order. */
  photos: readonly AssetRef[];
  /** The sticker assets already copied into the project; the 200 stickers cycle through them. */
  stickers: readonly AssetRef[];
  /** The bundled templates; the ones with four photo slots for one page are used. */
  templates: readonly Template[];
}

/**
 * The book of the stress fixture. Page `n` takes photos `4n` to `4n + 3` and the template
 * `n mod (number of 4-photo templates)`, laid out with `applyTemplate`, the editor's own
 * operation. Every page then has a caption (an empty text frame of the template is filled,
 * otherwise a caption is added under the photos), every page has two stickers, and the cover has
 * a title.
 */
export async function buildStressBook(input: StressBookInput): Promise<Book> {
  const core = await import('@travelbook/core');
  const { photos, stickers } = input;
  const templates = input.templates.filter(
    (t) => t.category === 'photos' && t.scope === 'page' && t.photoCount === 4,
  );
  if (templates.length === 0) throw new Error('No template with four photo slots.');
  if (photos.length < 4 * 100) throw new Error(`Need 400 photos, got ${photos.length}.`);
  if (stickers.length === 0) throw new Error('Need at least one sticker asset.');

  let book = core.newBook({ title: input.title, innerSpreads: STRESS_INNER_SPREADS });
  const rand = random(2026);
  let page = 0;
  let sticker = 0;

  const textDoc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

  for (const spread of book.spreads) {
    for (const side of ['left', 'right'] as const) {
      const box = core.pageBox(book, spread, side);
      if (box === null) continue;
      const spreadId = spread.id;

      // Four frames holding this page's photos, then the template lays them out.
      for (let k = 0; k < 4; k++) {
        const frame = core.newElement('photo', {
          x: box.x + 10 + 20 * k,
          y: box.y + 10,
          w: 40,
          h: 30,
        });
        frame.assetId = (photos[page * 4 + k] as AssetRef).id;
        book = core.addElement(book, spreadId, frame);
      }
      const template = templates[page % templates.length] as Template;
      book = core.applyTemplate(book, spreadId, side, template, {
        margin: book.safeMargin,
        gap: 4,
      });

      const caption = `${page + 1}. ${CAPTIONS[page % CAPTIONS.length]}`;
      const current = book.spreads.find((s) => s.id === spreadId)!;
      const slot = current.elements.find(
        (el) =>
          el.type === 'text' &&
          el.x >= box.x &&
          el.x < box.x + box.w &&
          JSON.stringify(el.doc).indexOf('"text"') === -1,
      );
      if (slot) {
        book = core.updateElements(book, spreadId, [slot.id], { doc: textDoc(caption) });
      } else {
        const el = core.newElement('text', {
          x: box.x + book.safeMargin,
          y: box.y + box.h - book.safeMargin - 7,
          w: box.w - 2 * book.safeMargin,
          h: 7,
        });
        el.doc = textDoc(caption);
        el.style.fontSizePt = 9;
        el.align = 'center';
        book = core.addElement(book, spreadId, el);
      }

      // Two stickers a page, 200 in all, at seeded places of the page.
      for (let k = 0; k < 2; k++) {
        const asset = stickers[sticker++ % stickers.length] as AssetRef;
        const size = 14 + 10 * rand();
        const el = core.newElement('sticker', {
          x: box.x + box.w * (0.1 + 0.6 * rand()),
          y: box.y + box.h * (0.1 + 0.7 * rand()),
          w: size,
          h: size,
        });
        el.assetId = asset.id;
        book = core.addElement(book, spreadId, el);
      }
      page++;
    }
  }

  const front = core.pageBox(book, book.cover, 'right');
  if (front === null) throw new Error('The cover has no front page.');
  const title = core.newElement('text', {
    x: front.x + book.safeMargin,
    y: front.y + 40,
    w: front.w - 2 * book.safeMargin,
    h: 30,
  });
  title.doc = textDoc(input.title);
  title.style.fontSizePt = 32;
  title.align = 'center';
  book = core.addElement(book, book.cover.id, title);

  const used = [...photos, ...stickers];
  return { ...book, assets: Object.fromEntries(used.map((a) => [a.id, a])) };
}

if (import.meta.main) {
  const started = Date.now();
  const paths = await ensureStressPhotos({
    onProgress: (done, total) => {
      if (done % 20 === 0 || done === total) console.log(`  ${done}/${total} photos`);
    },
  });
  console.log(
    `${paths.length} stress photos in ${STRESS_PHOTOS_DIR} (${Math.round((Date.now() - started) / 1000)} s)`,
  );
}
