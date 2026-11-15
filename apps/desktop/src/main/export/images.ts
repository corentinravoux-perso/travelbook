import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  boundingBox,
  exportBox,
  preflight,
  spineBox,
  type Book,
  type Element,
  type PhotoElement,
  type PreflightIssue,
  type Rect,
  type Side,
  type Spread,
} from '@travelbook/core';
import type { ExportOptions, ExportProgress, ExportReport } from '../../shared/api';
import type { ExportPageJob } from '../../shared/exportPage';
import { projectFilePath, type TbExportJob } from '../protocol';
import { makeDerivative } from './derivatives';

/** One file of the images route: `name` has no extension. `clip` is in spread coordinates (mm). */
export interface PageTarget {
  name: string;
  spreadId: string;
  clip: Rect;
}

/** The hidden window, as the export loop sees it. Electron's is in `exportWindow.ts`. */
export interface ExportRenderer {
  /** Draw one page and wait until its fonts and images are decoded. */
  show(job: ExportPageJob): Promise<void>;
  /** PNG bytes of the page being shown, at `dpi`. */
  capture(target: PageTarget, dpi: number): Promise<Buffer>;
  close(): void;
}

export const DEFAULT_JPEG_QUALITY = 98;

const pad = (n: number): string => String(n).padStart(3, '0');

/** Numbers of the pages a spread carries (the first spread's right page is page 1). */
function pageNumbersOf(book: Book, spread: Spread): { left: number | null; right: number | null } {
  if (spread.kind === 'cover') return { left: null, right: null };
  if (spread.kind === 'first') return { left: null, right: 1 };
  const index = book.spreads.indexOf(spread);
  if (spread.kind === 'last') return { left: 2 * index, right: null };
  return { left: 2 * index, right: 2 * index + 1 };
}

function coverTargets(book: Book, o: ExportOptions): PageTarget[] {
  const cover = book.cover;
  const b = o.bleed ? book.coverBleed : 0;
  if (o.coverMode === 'flat') {
    const w = 2 * book.format.width + book.spineWidth;
    return [
      {
        name: 'couverture-a-plat',
        spreadId: cover.id,
        clip: { x: -b, y: -b, w: w + 2 * b, h: book.format.height + 2 * b },
      },
    ];
  }
  const spine = spineBox(book);
  return [
    {
      name: 'couverture-avant',
      spreadId: cover.id,
      clip: exportBox(book, cover, 'right', o.bleed),
    },
    { name: 'couverture-dos', spreadId: cover.id, clip: exportBox(book, cover, 'left', o.bleed) },
    // The bleed of the spine is on its top and bottom edges: its sides join the two covers.
    {
      name: 'couverture-tranche',
      spreadId: cover.id,
      clip: { x: spine.x, y: spine.y - b, w: spine.w, h: spine.h + 2 * b },
    },
  ];
}

/**
 * The files of an export of the images route, in export order: the cover (if asked), then the
 * pages in `o.pages`, one per page or one per double page. A page's clip is its trim box, grown by
 * the bleed on all four sides when `o.bleed`, so every page of a book has the same size.
 */
export function renderPageTargets(book: Book, o: ExportOptions): PageTarget[] {
  const targets: PageTarget[] = o.includeCover ? coverTargets(book, o) : [];
  const wanted = (n: number | null): n is number =>
    n !== null && (o.pages === 'all' || (n >= o.pages.from && n <= o.pages.to));
  for (const spread of book.spreads) {
    const numbers = pageNumbersOf(book, spread);
    const sides = (['left', 'right'] as const).filter((side) => wanted(numbers[side]));
    if (sides.length === 0) continue;
    if (o.perSpread && numbers.left !== null && numbers.right !== null) {
      const b = o.bleed ? book.bleed : 0;
      targets.push({
        name: `double-${pad(numbers.left)}-${pad(numbers.right)}`,
        spreadId: spread.id,
        clip: { x: -b, y: -b, w: 2 * book.format.width + 2 * b, h: book.format.height + 2 * b },
      });
      continue;
    }
    // A spread with one page (the first, the last) is that page, even per double page.
    const pageSides: Side[] = o.perSpread
      ? (['left', 'right'] as const).filter((s) => numbers[s] !== null)
      : sides;
    for (const side of pageSides) {
      targets.push({
        name: `page-${pad(numbers[side] as number)}`,
        spreadId: spread.id,
        clip: exportBox(book, spread, side, o.bleed),
      });
    }
  }
  return targets;
}

/** Size in px of a region of `clip` mm at `dpi`. */
export function pixelSize(clip: Rect, dpi: number): { w: number; h: number } {
  return {
    w: Math.max(1, Math.round((clip.w * dpi) / 25.4)),
    h: Math.max(1, Math.round((clip.h * dpi) / 25.4)),
  };
}

/** How a person reads a target's name in an error: "page 3", "double page 2-3", "couverture (dos)". */
export function pageLabel(name: string): string {
  const page = /^page-(\d+)$/.exec(name);
  if (page) return `page ${Number(page[1])}`;
  const double = /^double-(\d+)-(\d+)$/.exec(name);
  if (double) return `double page ${Number(double[1])}-${Number(double[2])}`;
  if (name === 'couverture-a-plat') return 'couverture (à plat)';
  const cover = /^couverture-(.+)$/.exec(name);
  return cover ? `couverture (${cover[1]})` : name;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export annulé.');
    this.name = 'ExportCancelledError';
  }
}

// --- the running export, as the `tb://export` route sees it -------------------------------------

const jobs = new Map<string, TbExportJob>();

/** The export running under `token`, for the `tb:` roots. */
export function exportJobLookup(token: string): TbExportJob | undefined {
  return jobs.get(token);
}

let running: AbortController | null = null;

/** Ask the running export to stop after the page it is on. */
export function cancelExport(): void {
  running?.abort();
}

// --- helpers ------------------------------------------------------------------------------------

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/** Files of the album that exist, as `preflight` takes them. */
export async function existingAssetFiles(projectDir: string, book: Book): Promise<Set<string>> {
  const found = new Set<string>();
  for (const asset of Object.values(book.assets)) {
    const path = projectFilePath(projectDir, asset.file);
    if (path !== null && (await isFile(path))) found.add(asset.file);
  }
  return found;
}

export async function exportPreflight(projectDir: string, book: Book): Promise<PreflightIssue[]> {
  return preflight(book, await existingAssetFiles(projectDir, book));
}

/** How far a photo's shadow, border and feather can reach beyond its box, in mm. */
function reach(el: PhotoElement): number {
  const s = el.shadow;
  return (
    (s ? Math.max(Math.abs(s.dx), Math.abs(s.dy)) + 2 * s.blur : 0) +
    (el.border?.width ?? 0) +
    (el.edge?.feather ?? 0)
  );
}

function touches(el: Element, clip: Rect): boolean {
  const m = el.type === 'photo' ? reach(el) : 0;
  const box = boundingBox(el);
  return (
    box.x - m < clip.x + clip.w &&
    box.x + box.w + m > clip.x &&
    box.y - m < clip.y + clip.h &&
    box.y + box.h + m > clip.y
  );
}

/** Pixel size of an original after its EXIF orientation. */
async function orientedSize(file: string): Promise<{ w: number; h: number }> {
  const { width = 0, height = 0, orientation = 1 } = await sharp(file).metadata();
  return orientation >= 5 ? { w: height, h: width } : { w: width, h: height };
}

/** The spread with only the photos that reach `clip`: the others would be fetched for nothing. */
function spreadFor(spread: Spread, clip: Rect): { spread: Spread; photos: PhotoElement[] } {
  const elements = spread.elements.filter((el) => el.type !== 'photo' || touches(el, clip));
  const photos = elements.filter(
    (el): el is PhotoElement => el.type === 'photo' && !el.hidden && el.assetId !== null,
  );
  return { spread: { ...spread, elements }, photos };
}

async function encode(
  png: Buffer,
  size: { w: number; h: number },
  o: Pick<ExportOptions, 'imageFormat' | 'jpegQuality' | 'dpi'>,
): Promise<Buffer> {
  let image = sharp(png).removeAlpha();
  const meta = await image.metadata();
  // Chromium rounds the capture to whole device pixels; the file has the size the page calls for.
  if (meta.width !== size.w || meta.height !== size.h) {
    image = image.resize(size.w, size.h, { fit: 'fill', kernel: 'lanczos3' });
  }
  image = image.toColourspace('srgb').withIccProfile('srgb').withMetadata({ density: o.dpi });
  return o.imageFormat === 'png'
    ? image.png({ compressionLevel: 6 }).toBuffer()
    : image.jpeg({ quality: o.jpegQuality, chromaSubsampling: '4:4:4' }).toBuffer();
}

export interface ImageExportDeps {
  openRenderer(): Promise<ExportRenderer>;
  onProgress(progress: ExportProgress): void;
}

/**
 * Export `book` (the project in `projectDir`) as image files in `o.outDir`, one page at a time:
 * build the derivatives of the page, draw it in the hidden window, capture it, encode and write
 * it, delete the derivatives. Sequential on purpose (a 600 dpi capture takes about 2 GB).
 *
 * Originals are found from `book.assets[...].file` inside `projectDir`. A missing original, a
 * failed capture or a cancel removes every file this run wrote and rejects.
 */
export async function runImageExport(
  book: Book,
  projectDir: string,
  o: ExportOptions,
  deps: ImageExportDeps,
): Promise<Omit<ExportReport, 'warnings'>> {
  if (running !== null) throw new Error('Un export est déjà en cours.');
  const started = Date.now();
  const abort = new AbortController();
  running = abort;
  const targets = renderPageTargets(book, o).filter((t) => t.clip.w > 0 && t.clip.h > 0);
  const token = randomUUID();
  const written: string[] = [];
  let work: string | null = null;
  let renderer: ExportRenderer | null = null;
  try {
    if (targets.length === 0) throw new Error('Aucune page à exporter.');
    await mkdir(o.outDir, { recursive: true });
    work = await mkdtemp(join(tmpdir(), 'travelbook-export-'));
    const dir = join(work, 'derivatives');
    jobs.set(token, {
      dir,
      projectDir,
      assetFile: (id) => book.assets[id]?.file,
    });
    renderer = await deps.openRenderer();
    const extension = o.imageFormat === 'png' ? 'png' : 'jpg';
    const spreads = new Map([book.cover, ...book.spreads].map((s) => [s.id, s]));
    let page = 0;
    for (const target of targets) {
      page += 1;
      if (abort.signal.aborted) throw new ExportCancelledError();
      const progress = (step: string): void =>
        deps.onProgress({ page, total: targets.length, step });
      const label = pageLabel(target.name);
      const { spread, photos } = spreadFor(spreads.get(target.spreadId) as Spread, target.clip);

      progress('derivatives');
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      const derivatives: Record<string, string> = {};
      for (const el of photos) {
        const asset = book.assets[el.assetId as string];
        const original = asset ? projectFilePath(projectDir, asset.file) : null;
        const name = asset?.originalName ?? (el.assetId as string);
        if (!asset || original === null || !(await isFile(original))) {
          throw new Error(`Photo introuvable : ${name} (${label}).`);
        }
        try {
          const made = await makeDerivative(
            original,
            asset.pixel ?? (await orientedSize(original)),
            { w: el.w, h: el.h },
            el.crop,
            { h: el.flipH, v: el.flipV },
            { adjust: el.adjust, edge: el.edge, mask: el.mask },
            { dpi: o.dpi, nativeResolution: o.nativeResolution, quality: o.jpegQuality },
            dir,
          );
          derivatives[el.id] = made.file.slice(dir.length + 1);
        } catch (error) {
          throw new Error(`Photo illisible : ${name} (${label}) : ${messageOf(error)}`, {
            cause: error,
          });
        }
      }

      progress('render');
      await renderer.show({
        token,
        book: { ...book, spreads: [] },
        spread,
        clip: target.clip,
        derivatives,
      });
      progress('capture');
      const png = await renderer.capture(target, o.dpi);
      progress('write');
      const file = join(o.outDir, `${target.name}.${extension}`);
      const partial = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(partial, await encode(png, pixelSize(target.clip, o.dpi), o));
        await rename(partial, file);
      } catch (error) {
        await rm(partial, { force: true }).catch(() => undefined);
        throw error;
      }
      written.push(file);
      await rm(dir, { recursive: true, force: true });
    }
    // A cancel that came in during the last page changes nothing: the export is complete.
    return { files: written, pages: written.length, seconds: (Date.now() - started) / 1000 };
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true }).catch(() => undefined)));
    throw error;
  } finally {
    jobs.delete(token);
    renderer?.close();
    if (work !== null) await rm(work, { recursive: true, force: true }).catch(() => undefined);
    running = null;
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
