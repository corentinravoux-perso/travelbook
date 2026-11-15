import {
  addSpread,
  deleteSpread,
  duplicateSpread,
  moveSpread,
  swapPages,
  type Book,
  type Spread,
} from '@travelbook/core';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';

// What the strip and the overview do to the book's spreads: each goes through `store.apply`, so
// it is undoable and saved, and each leaves the editor on the spread it made or kept.

/** The spread a new one goes after: `spread` itself, or the nearest one that accepts a spread. */
function insertionPoint(book: Book, spread: Spread): Spread {
  if (spread.kind === 'cover') return book.spreads[0]!;
  if (spread.kind === 'last') return book.spreads[book.spreads.length - 2]!;
  return spread;
}

/** Add an empty spread after `afterId` (the cover and the last spread count as their neighbour). */
export function addSpreadAfter(afterId: string): void {
  const { book, apply, goToSpread } = editorStore.getState();
  const spread = findSpread(book, afterId);
  if (!book || !spread) return;
  const after = insertionPoint(book, spread);
  apply((b) => addSpread(b, after.id), fr.strip.undoAdd);
  const next = editorStore.getState().book?.spreads;
  const created = next?.[next.findIndex((s) => s.id === after.id) + 1];
  if (created) goToSpread(created.id);
}

export function duplicateSpreadById(id: string): void {
  const { book, apply, goToSpread } = editorStore.getState();
  const spread = findSpread(book, id);
  if (!book || spread?.kind !== 'inner') return;
  apply((b) => duplicateSpread(b, id), fr.strip.undoDuplicate);
  const next = editorStore.getState().book?.spreads;
  const copy = next?.[next.findIndex((s) => s.id === id) + 1];
  if (copy) goToSpread(copy.id);
}

/** Delete an inner spread; the editor moves to its neighbour (see `commit` in the store). */
export function deleteSpreadById(id: string): void {
  const { book, apply } = editorStore.getState();
  if (findSpread(book, id)?.kind !== 'inner') return;
  apply((b) => deleteSpread(b, id), fr.strip.undoRemove);
}

export function swapPagesOf(id: string): void {
  const { book, apply } = editorStore.getState();
  if (findSpread(book, id)?.kind !== 'inner') return;
  apply((b) => swapPages(b, id), fr.strip.undoSwap);
}

/** Move an inner spread to `toIndex` of `book.spreads`; the same logic for strip and overview. */
export function moveSpreadTo(id: string, toIndex: number): void {
  const { book, apply } = editorStore.getState();
  if (findSpread(book, id)?.kind !== 'inner') return;
  apply((b) => moveSpread(b, id, toIndex), fr.strip.undoMove);
}
