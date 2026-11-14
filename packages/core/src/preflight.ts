import { pageCount } from './factory';
import { boundingBox, effectiveDpi, pageBox } from './geometry';
import type { Background, Book, Rect, Side, Spread } from './schema';

export type PreflightIssue =
  | { kind: 'lowResolution'; spreadId: string; elementId: string; dpi: number }
  | { kind: 'emptySlot'; spreadId: string; elementId: string }
  | { kind: 'textOutsideSafe'; spreadId: string; elementId: string }
  | { kind: 'missingAsset'; assetId: string }
  | { kind: 'pageRule'; pages: number; rule: Book['pageRule'] };

/** Tolerance (1 nm) for a box that sits exactly on the edge of the safe area. */
const EPS = 1e-6;

const SIDES: Side[] = ['left', 'right'];

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}

/**
 * Where text may go: each page of the spread inside its safe margin and, on a cover, the spine
 * (full width, safe margin top and bottom), which carries its own text.
 */
function safeAreas(book: Book, spread: Spread): Rect[] {
  const m = book.safeMargin;
  const areas: Rect[] = [];
  for (const side of SIDES) {
    const page = pageBox(book, spread, side);
    if (page) areas.push({ x: page.x + m, y: page.y + m, w: page.w - 2 * m, h: page.h - 2 * m });
  }
  if (spread.kind === 'cover') {
    const { width: W, height: H } = book.format;
    areas.push({ x: W, y: m, w: book.spineWidth, h: H - 2 * m });
  }
  return areas;
}

function backgroundAsset(bg: Background | undefined): string | null {
  return bg && (bg.kind === 'image' || bg.kind === 'pattern') ? bg.assetId : null;
}

/**
 * What would go wrong, or look bad, in print. Issues come in document order (cover, then each
 * spread: elements as stacked), then one `missingAsset` per absent file in the order it is first
 * met, then `pageRule`. Hidden elements are not drawn, so they raise nothing.
 *
 * - `lowResolution`: the photo shows fewer than `settings.dpiLow` pixels per inch.
 * - `emptySlot`: a photo frame with no photo.
 * - `textOutsideSafe`: a text box (its rotated box if rotated) is not entirely inside the safe
 *   area of a page.
 * - `missingAsset`: an asset an element or a background uses has no entry in `book.assets`, or
 *   its `file` is not in `existingFiles`.
 * - `pageRule`: the page count is under `pageRule.min` or not a multiple of `pageRule.multiple`.
 */
export function preflight(book: Book, existingFiles: Set<string>): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const used = new Set<string>();

  for (const spread of [book.cover, ...book.spreads]) {
    const { left, right, spread: across } = spread.background;
    for (const bg of [left, right, across]) {
      const id = backgroundAsset(bg);
      if (id) used.add(id);
    }

    const safe = safeAreas(book, spread);
    for (const el of spread.elements) {
      if (el.hidden) continue;
      if (el.type === 'photo') {
        if (!el.assetId) {
          issues.push({ kind: 'emptySlot', spreadId: spread.id, elementId: el.id });
          continue;
        }
        used.add(el.assetId);
        const pixel = book.assets[el.assetId]?.pixel;
        if (pixel && el.w > 0 && el.h > 0) {
          const dpi = effectiveDpi(pixel, el, el.crop);
          if (dpi < book.settings.dpiLow) {
            issues.push({ kind: 'lowResolution', spreadId: spread.id, elementId: el.id, dpi });
          }
        }
      } else if (el.type === 'sticker') {
        if (el.assetId) used.add(el.assetId);
      } else if (el.type === 'text') {
        const box = el.rotation % 180 === 0 ? el : boundingBox(el);
        if (!safe.some((area) => isInside(box, area))) {
          issues.push({ kind: 'textOutsideSafe', spreadId: spread.id, elementId: el.id });
        }
      }
    }
  }

  for (const assetId of used) {
    const asset = book.assets[assetId];
    if (!asset || !existingFiles.has(asset.file)) issues.push({ kind: 'missingAsset', assetId });
  }

  const pages = pageCount(book);
  const { min, multiple } = book.pageRule;
  if (pages < min || pages % multiple !== 0) {
    issues.push({ kind: 'pageRule', pages, rule: book.pageRule });
  }
  return issues;
}
