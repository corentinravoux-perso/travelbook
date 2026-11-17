import { pageBox, spineBox, spreadSize, type Book, type Rect, type Spread } from '@travelbook/core';
import { pageNumbers } from '../editor/pages';
import { fr } from '../strings/fr';

/** The cover, then the spreads of the book: the pages of the preview, in turning order. */
export const previewPages = (book: Book): Spread[] => [book.cover, ...book.spreads];

/** `index` moved by `delta` pages, held between the first page and the last. */
export function turn(index: number, delta: number, count: number): number {
  return Math.min(Math.max(index + delta, 0), Math.max(count - 1, 0));
}

/** What the page indicator names: the cover, or the numbers of the pages the spread carries. */
export function pagesLabel(book: Book, spread: Spread): string {
  if (spread.kind === 'cover') return fr.shell.coverName;
  const { left, right } = pageNumbers(book, spread);
  if (left !== null && right !== null) return fr.preview.pages(left, right);
  const only = left ?? right;
  return only === null ? '' : fr.preview.page(only);
}

/** Which way a click at `x` turns the page, given the middle of the stage: left goes back. */
export const clickDirection = (x: number, middle: number): -1 | 1 => (x < middle ? -1 : 1);

/**
 * What the print trims off a spread, in spread mm, for the preview's "Zones rognées" view:
 * `box` is the whole printed sheet (trim plus bleed), `veils` the parts of it the cut removes
 * (each an outer box minus its trim box), `folds` the x of the fold lines (the spine edges of a
 * cover, the single fold of a cover without spine, the gutter of a two-page spread), `spine` the
 * spine band of a cover that has one.
 */
export interface CutZones {
  box: Rect;
  veils: { outer: Rect; inner: Rect }[];
  folds: number[];
  spine: Rect | null;
  bleed: number;
}

export function cutZones(book: Book, spread: Spread): CutZones {
  const size = spreadSize(book, spread);
  if (spread.kind === 'cover') {
    const b = book.coverBleed;
    const box = { x: -b, y: -b, w: size.w + 2 * b, h: size.h + 2 * b };
    const W = book.format.width;
    const spine = book.spineWidth > 0 ? spineBox(book) : null;
    return {
      box,
      veils: [{ outer: box, inner: { x: 0, y: 0, w: size.w, h: size.h } }],
      folds: spine ? [spine.x, spine.x + spine.w] : [W],
      spine,
      bleed: b,
    };
  }
  const b = book.bleed;
  const veils: CutZones['veils'] = [];
  for (const side of ['left', 'right'] as const) {
    const page = pageBox(book, spread, side);
    if (page === null) continue;
    // The bleed grows the three outer edges of a page; the gutter edge is bound, not cut.
    const outer = {
      x: side === 'left' ? page.x - b : page.x,
      y: page.y - b,
      w: page.w + b,
      h: page.h + 2 * b,
    };
    veils.push({ outer, inner: page });
  }
  const x0 = Math.min(...veils.map((v) => v.outer.x));
  const x1 = Math.max(...veils.map((v) => v.outer.x + v.outer.w));
  return {
    box: { x: x0, y: -b, w: x1 - x0, h: size.h + 2 * b },
    veils,
    folds: veils.length === 2 ? [book.format.width] : [],
    spine: null,
    bleed: b,
  };
}
