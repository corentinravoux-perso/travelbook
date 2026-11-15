import { type Book, type Spread } from '@travelbook/core';
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
