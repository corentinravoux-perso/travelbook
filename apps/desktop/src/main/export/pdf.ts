import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, cmyk, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import type { Book, Mm, Rect } from '@travelbook/core';
import type { ExportOptions } from '../../shared/api';
import { slugify } from '../project/store';
import {
  renderPageTargets,
  runPages,
  type ImageExportDeps,
  type PageContext,
  type PageTarget,
} from './images';
import { rasterReasons } from './rasterFallback';

const PT_PER_MM = 72 / 25.4;

const MARK_WIDTH_PT = 0.25;
const MARK_LENGTH_MM = 3;
/** White left beyond the end of a mark, on each side. */
const MARK_MARGIN_MM = 1;

/**
 * Slug (mm) added on each side of the bleed box when there are crop marks: the marks start
 * `markOffset` (the book's bleed) from the trim, so outside the bleed, run 3 mm, and leave 1 mm.
 */
export const slugMm = (markOffset: Mm): Mm => markOffset + MARK_LENGTH_MM + MARK_MARGIN_MM;

/** Resolution of the capture of a page that falls back to the raster route. */
export const RASTER_FALLBACK_DPI = 600;

/** The options of the "lecture à l'écran" preset (Task 7.4 lists it among the presets). */
export const SCREEN_READING_OPTIONS = {
  route: 'pdf',
  perSpread: true,
  includeCover: true,
  dpi: 150,
  bleed: false,
  cropMarks: false,
} as const satisfies Partial<ExportOptions>;

/** One page of the print PDF: a page printed by Chromium, or the capture that stands in for it. */
export interface PdfPageInput {
  /** The page printed by Chromium (vector). */
  pdf?: Buffer;
  /** Capture of the whole page (trim and bleed), PNG or JPEG bytes: the raster fallback. */
  png?: Buffer;
  /** The trim box: only `w` and `h` (mm) are used, the page is the trim grown by `bleed`. */
  trim: Rect;
  /** Bleed on the four sides of the page. */
  bleed: Mm;
  /**
   * Where the crop marks start, measured from the trim: the book's bleed (cover: `coverBleed`),
   * even when the export has no bleed. Defaults to `bleed`.
   */
  markOffset?: Mm;
}

const mmToPt = (v: number): number => v * PT_PER_MM;

/** Crop marks at the four corners of the trim box: 3 mm long, `markOffset` mm clear of the trim. */
function drawCropMarks(
  page: PDFPage,
  trim: { x: number; y: number; w: number; h: number },
  markOffset: Mm,
): void {
  const offset = mmToPt(markOffset);
  const length = mmToPt(MARK_LENGTH_MM);
  const black = cmyk(0, 0, 0, 1);
  for (const x of [trim.x, trim.x + trim.w]) {
    for (const y of [trim.y, trim.y + trim.h]) {
      const outX = x === trim.x ? -1 : 1;
      const outY = y === trim.y ? -1 : 1;
      page.drawLine({
        start: { x: x + outX * offset, y },
        end: { x: x + outX * (offset + length), y },
        thickness: MARK_WIDTH_PT,
        color: black,
      });
      page.drawLine({
        start: { x, y: y + outY * offset },
        end: { x, y: y + outY * (offset + length) },
        thickness: MARK_WIDTH_PT,
        color: black,
      });
    }
  }
}

const isJpeg = (bytes: Buffer): boolean => bytes[0] === 0xff && bytes[1] === 0xd8;

/**
 * Merge the pages into one PDF. Every page gets its MediaBox, TrimBox and BleedBox from the
 * millimetres, exactly: Chromium rounds a page to whole points, so a printed page is a little short
 * (up to 0.18 mm, inside the bleed) and is drawn at the top left of a page of the right size.
 * With `cropMarks` the MediaBox grows by a slug on each side (`slugMm`) and the marks are drawn
 * there, outside the bleed so that they never overlay artwork.
 */
export async function assemblePdf(pages: PdfPageInput[], cropMarks: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const input of pages) {
    const markOffset = input.markOffset ?? input.bleed;
    const slug = cropMarks ? mmToPt(slugMm(markOffset)) : 0;
    const bleed = mmToPt(input.bleed);
    const trimW = mmToPt(input.trim.w);
    const trimH = mmToPt(input.trim.h);
    const bleedW = trimW + 2 * bleed;
    const bleedH = trimH + 2 * bleed;
    const page = doc.addPage([bleedW + 2 * slug, bleedH + 2 * slug]);
    page.setMediaBox(0, 0, bleedW + 2 * slug, bleedH + 2 * slug);
    page.setBleedBox(slug, slug, bleedW, bleedH);
    page.setTrimBox(slug + bleed, slug + bleed, trimW, trimH);
    if (input.pdf) {
      const [printed] = await doc.embedPdf(input.pdf, [0]);
      if (!printed) throw new Error('Le PDF de la page est vide.');
      // PDF y goes up: the top of the printed page is flush with the top of the bleed box.
      page.drawPage(printed, { x: slug, y: slug + bleedH - printed.height });
    } else if (input.png) {
      const image = isJpeg(input.png)
        ? await doc.embedJpg(input.png)
        : await doc.embedPng(input.png);
      page.drawImage(image, { x: slug, y: slug, width: bleedW, height: bleedH });
    } else {
      throw new Error('Une page du PDF n’a ni PDF ni image.');
    }
    if (cropMarks) {
      drawCropMarks(page, { x: slug + bleed, y: slug + bleed, w: trimW, h: trimH }, markOffset);
    }
  }
  return doc.save();
}

/** The trim box a target stands for, and the bleed around it. */
function pageBoxes(
  book: Book,
  o: ExportOptions,
  target: PageTarget,
): { trim: Rect; bleed: Mm; markOffset: Mm } {
  const bookBleed = target.name.startsWith('couverture') ? book.coverBleed : book.bleed;
  const bleed = o.bleed ? bookBleed : 0;
  return {
    bleed,
    markOffset: bookBleed,
    trim: { x: bleed, y: bleed, w: target.clip.w - 2 * bleed, h: target.clip.h - 2 * bleed },
  };
}

export interface PdfExportDeps extends ImageExportDeps {
  /** Pages to send to the raster fallback whatever they hold (tests). */
  forceRaster?: (target: PageTarget) => boolean;
}

/**
 * Export `book` as print PDFs in `o.outDir`: `<slug>-interieur.pdf` and, with `includeCover`,
 * `<slug>-couverture.pdf` (the flat sheet). With `perSpread` (screen reading) the cover is page 1
 * of the single file. Each page is printed by Chromium one at a time, photos as the baked JPEG
 * derivatives; a page that holds an effect known to rasterise at low resolution is captured at
 * 600 dpi instead and embedded as an image.
 */
export function runPdfExport(
  book: Book,
  projectDir: string,
  o: ExportOptions,
  deps: PdfExportDeps,
): ReturnType<typeof runPages> {
  const targets = renderPageTargets(book, { ...o, coverMode: 'flat' });
  const isCover = (t: PageTarget): boolean => t.name.startsWith('couverture');
  const printed = new Map<PageTarget, PdfPageInput>();
  const slug = slugify(book.title);
  return runPages(book, projectDir, o, deps, {
    targets,
    bakePatterns: true,
    page: async (ctx: PageContext) => {
      const { target, job, renderer, progress } = ctx;
      const boxes = pageBoxes(book, o, target);
      const reasons = rasterReasons(job.spread, ctx.photos);
      if (reasons.length > 0 || deps.forceRaster?.(target)) {
        progress('render');
        await renderer.show(job);
        progress('capture');
        const png = await renderer.capture(target, RASTER_FALLBACK_DPI);
        // A lossless 600 dpi A4 page is tens of megabytes: embed it as a JPEG.
        const jpeg = await sharp(png)
          .removeAlpha()
          .toColourspace('srgb')
          .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
          .toBuffer();
        printed.set(target, { png: jpeg, ...boxes });
      } else {
        progress('print');
        printed.set(target, { pdf: await renderer.print(job), ...boxes });
      }
    },
    finish: async (outputs, staging) => {
      const inOrder = targets.filter((t) => printed.has(t));
      const groups: [string, PageTarget[]][] = o.perSpread
        ? [[`${slug}-interieur.pdf`, inOrder]]
        : [
            [`${slug}-couverture.pdf`, inOrder.filter(isCover)],
            [`${slug}-interieur.pdf`, inOrder.filter((t) => !isCover(t))],
          ];
      for (const [name, group] of groups) {
        if (group.length === 0) continue;
        const bytes = await assemblePdf(
          group.map((t) => printed.get(t) as PdfPageInput),
          o.cropMarks,
        );
        await writeFile(join(staging, name), bytes);
        outputs.push(name);
      }
    },
  });
}
