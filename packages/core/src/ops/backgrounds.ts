import { produce } from 'immer';
import type { Background, Book, Side } from '../schema';
import { clone, spreadOf, targetBox } from './util';

/**
 * Set or, with `null`, remove the background of a page or of the whole spread. A spread
 * background replaces the page backgrounds; a page background is drawn over a spread one.
 * Throws OpError on a page the spread lacks (the left of the first, the right of the last).
 */
export function setBackground(
  book: Book,
  spreadId: string,
  target: Side | 'spread',
  bg: Background | null,
): Book {
  targetBox(book, spreadOf(book, spreadId), target);
  return produce(book, (draft) => {
    const backgrounds = spreadOf(draft, spreadId).background;
    if (bg === null) {
      delete backgrounds[target];
      return;
    }
    if (target === 'spread') {
      delete backgrounds.left;
      delete backgrounds.right;
    }
    backgrounds[target] = clone(bg);
  });
}
