import { produce } from 'immer';
import type { Book, Mm } from '../schema';
import { OpError } from './errors';
import { spreadOf } from './util';

/** `x`: a vertical guide at x = `at`; `y`: a horizontal one at y = `at` (spread coordinates). */
export type GuideAxis = 'x' | 'y';

/** Guides are kept to a hundredth of a millimetre. */
const round = (v: Mm): Mm => Math.round(v * 100) / 100;

function check(at: Mm): void {
  if (!Number.isFinite(at)) throw new OpError('A guide position must be a finite number.');
}

/** Add a ruler guide to a spread. A guide already at that position is not doubled. */
export function addGuide(book: Book, spreadId: string, axis: GuideAxis, at: Mm): Book {
  check(at);
  const pos = round(at);
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const guides = (spread.guides ??= { x: [], y: [] });
    if (!guides[axis].includes(pos)) guides[axis].push(pos);
  });
}

/** Move the guide at index `index` of `axis` to `at`. */
export function moveGuide(
  book: Book,
  spreadId: string,
  axis: GuideAxis,
  index: number,
  at: Mm,
): Book {
  check(at);
  return produce(book, (draft) => {
    const list = spreadOf(draft, spreadId).guides?.[axis];
    if (!list || index < 0 || index >= list.length) throw new OpError(`Unknown guide ${index}.`);
    list[index] = round(at);
  });
}

/** Remove the guide at index `index` of `axis`; the field goes when no guide is left. */
export function removeGuide(book: Book, spreadId: string, axis: GuideAxis, index: number): Book {
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const list = spread.guides?.[axis];
    if (!list || index < 0 || index >= list.length) throw new OpError(`Unknown guide ${index}.`);
    list.splice(index, 1);
    if (spread.guides && spread.guides.x.length === 0 && spread.guides.y.length === 0) {
      delete spread.guides;
    }
  });
}
