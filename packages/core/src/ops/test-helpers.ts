import { afterEach, beforeEach } from 'vitest';
import { newBook, newElement, setIdSource } from '../factory';
import type { Book, PhotoElement, ShapeElement, Spread } from '../schema';

/** Deterministic generated ids ('id1', 'id2', ...), restarted for every test of the calling file. */
export function useCounterIds(): void {
  beforeEach(() => {
    let n = 0;
    setIdSource(() => `id${++n}`);
  });
  afterEach(() => setIdSource(null));
}

export function shape(id: string, x: number, y: number, w: number, h: number): ShapeElement {
  return { ...newElement('shape', { x, y, w, h }), id };
}

export function photo(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  assetId: string | null = null,
): PhotoElement {
  return { ...newElement('photo', { x, y, w, h }), id, assetId };
}

/**
 * A fresh A4 book with `innerSpreads` inner spreads (ids from the counter source).
 * Never share one between tests: Immer freezes what an operation returns.
 */
export function freshBook(innerSpreads = 2): Book {
  return newBook({ title: 'Test', innerSpreads });
}

export function inner(book: Book, i = 0): Spread {
  return book.spreads[1 + i]!;
}
