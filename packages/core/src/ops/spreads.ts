import { produce } from 'immer';
import { newId, newSpread } from '../factory';
import { spreadSize } from '../geometry';
import type { Book, Element, Spread } from '../schema';
import { OpError } from './errors';
import { clone, copyElements, spreadOf } from './util';

/** Index in `book.spreads` of an inner spread; throws for the cover, first, last or unknown. */
function innerIndex(book: Book, spreadId: string, verb: string): number {
  const spread = spreadOf(book, spreadId);
  const i = book.spreads.indexOf(spread);
  if (spread.kind !== 'inner') {
    throw new OpError(`The ${spread.kind} spread cannot be ${verb}; only inner spreads can.`);
  }
  return i;
}

/** Add an empty inner spread after `afterSpreadId` (the first or an inner spread). */
export function addSpread(book: Book, afterSpreadId: string): Book {
  const after = spreadOf(book, afterSpreadId);
  if (after.kind === 'cover') throw new OpError('A spread cannot be added after the cover.');
  if (after.kind === 'last') throw new OpError('A spread cannot be added after the last spread.');
  const i = book.spreads.indexOf(after);
  return produce(book, (draft) => {
    draft.spreads.splice(i + 1, 0, newSpread('inner'));
  });
}

/** Copy an inner spread, with new ids, right after the original. */
export function duplicateSpread(book: Book, spreadId: string): Book {
  const i = innerIndex(book, spreadId, 'duplicated');
  const src = book.spreads[i]!;
  const copy: Spread = {
    id: newId(),
    kind: 'inner',
    background: clone(src.background),
    elements: copyElements(src.elements, 0, 0),
  };
  return produce(book, (draft) => {
    draft.spreads.splice(i + 1, 0, copy);
  });
}

/** Move an inner spread so it ends up at `toIndex` in `book.spreads` (never first or last). */
export function moveSpread(book: Book, spreadId: string, toIndex: number): Book {
  const i = innerIndex(book, spreadId, 'moved');
  if (!Number.isInteger(toIndex) || toIndex < 1 || toIndex > book.spreads.length - 2) {
    throw new OpError(
      `Index ${toIndex} is outside the inner spreads (1 to ${book.spreads.length - 2}).`,
    );
  }
  if (toIndex === i) return book;
  return produce(book, (draft) => {
    const [moved] = draft.spreads.splice(i, 1);
    draft.spreads.splice(toIndex, 0, moved!);
  });
}

export function deleteSpread(book: Book, spreadId: string): Book {
  const i = innerIndex(book, spreadId, 'deleted');
  return produce(book, (draft) => {
    draft.spreads.splice(i, 1);
  });
}

/**
 * Exchange the two pages of a spread: every element's x is mirrored about the middle of the
 * spread (rotation and size are kept) and the left and right backgrounds trade places.
 * The first and last spreads have one page and cannot be swapped.
 */
export function swapPages(book: Book, spreadId: string): Book {
  const spread = spreadOf(book, spreadId);
  if (spread.kind === 'first' || spread.kind === 'last') {
    throw new OpError(`The ${spread.kind} spread has one page and cannot be swapped.`);
  }
  const { w } = spreadSize(book, spread);
  const { left, right } = spread.background;
  return produce(book, (draft) => {
    const target = spreadOf(draft, spreadId);
    for (const el of target.elements) el.x = w - el.x - el.w;
    delete target.background.left;
    delete target.background.right;
    if (right) target.background.left = right;
    if (left) target.background.right = left;
  });
}

/**
 * Change the page format. With `scaleContent`, every element is scaled with its page: x and w
 * by the width ratio, y and h by the height ratio, text sizes by the smaller ratio. On the
 * cover the back and front pages scale in place, the front moves with its page, and the spine
 * zone follows the front keeping its size, its centre scaled vertically (spine text).
 * Without it, only the format changes and elements keep their coordinates.
 */
export function setFormat(
  book: Book,
  format: { width: number; height: number },
  scaleContent: boolean,
): Book {
  const { width, height } = format;
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
    throw new OpError('The format must have a positive, finite width and height.');
  }
  const old = book.format;
  return produce(book, (draft) => {
    draft.format = { width, height };
    if (!scaleContent) return;
    const sx = width / old.width;
    const sy = height / old.height;
    const scale = { sx, sy, text: Math.min(sx, sy) };
    for (const el of draft.cover.elements)
      scaleOnCover(el, old.width, book.spineWidth, width, scale);
    for (const spread of draft.spreads) for (const el of spread.elements) scaleElement(el, scale);
  });
}

interface Scale {
  sx: number;
  sy: number;
  text: number;
}

function scaleElement(el: Element, { sx, sy, text }: Scale): void {
  el.x *= sx;
  el.y *= sy;
  el.w *= sx;
  el.h *= sy;
  if (el.type === 'text') el.style.fontSizePt *= text;
}

function scaleOnCover(el: Element, oldW: number, spine: number, newW: number, s: Scale): void {
  const cx = el.x + el.w / 2;
  if (cx < oldW) {
    scaleElement(el, s);
  } else if (cx >= oldW + spine) {
    const offset = el.x - (oldW + spine);
    scaleElement(el, s);
    el.x = newW + spine + offset * s.sx;
  } else {
    const centreX = cx - oldW + newW;
    const centreY = (el.y + el.h / 2) * s.sy;
    el.x = centreX - el.w / 2;
    el.y = centreY - el.h / 2;
  }
}
