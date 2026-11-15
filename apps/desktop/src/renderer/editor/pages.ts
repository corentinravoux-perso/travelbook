import { pageCount, type Book, type Spread } from '@travelbook/core';
import { fr } from '../strings/fr';

/** The name of a spread: the cover, or "Double page n" counting the first spread as 1. */
export function spreadName(book: Book, spread: Spread): string {
  if (spread.kind === 'cover') return fr.shell.coverName;
  return fr.shell.spreadName(book.spreads.indexOf(spread) + 1);
}

/** The page numbers a spread carries; `null` for a side that is not a page (or the cover). */
export interface PageNumbers {
  left: number | null;
  right: number | null;
}

/**
 * Pages are numbered from the first spread: its right page is page 1, then every inner spread
 * holds the next two (left, right), and the last spread ends on a left page. The cover is not
 * numbered (spec §7.2).
 */
export function pageNumbers(book: Book, spread: Spread): PageNumbers {
  if (spread.kind === 'cover') return { left: null, right: null };
  if (spread.kind === 'first') return { left: null, right: 1 };
  const index = book.spreads.indexOf(spread);
  if (index < 0) return { left: null, right: null };
  if (spread.kind === 'last') return { left: 2 * index, right: null };
  return { left: 2 * index, right: 2 * index + 1 };
}

/** What `pageRule` asks for that the book does not do; `null` when the rule is met. */
export interface PageRuleShortfall {
  pages: number;
  min: number;
  multiple: number;
}

/** The same test as the `pageRule` issue of the preflight, without the rest of the preflight. */
export function pageRuleShortfall(book: Book): PageRuleShortfall | null {
  const pages = pageCount(book);
  const { min, multiple } = book.pageRule;
  return pages < min || pages % multiple !== 0 ? { pages, min, multiple } : null;
}

/**
 * Where an inner spread dropped on `over` ends up in `book.spreads`: before it, or after it when
 * `after`. Always an index `moveSpread` accepts (1 to `count - 2`): dropping on the first or the
 * last spread puts it next to them, inside.
 */
export function dropIndex(from: number, over: number, after: boolean, count: number): number {
  const slot = after ? over + 1 : over;
  const index = slot > from ? slot - 1 : slot;
  return Math.min(Math.max(index, 1), count - 2);
}
