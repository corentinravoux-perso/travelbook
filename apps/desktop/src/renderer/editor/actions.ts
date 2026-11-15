import {
  groupElements,
  pasteElements,
  removeElements,
  reorderElements,
  transformElements,
  ungroupElements,
  type AssetRef,
  type Book,
  type Element,
  type Spread,
} from '@travelbook/core';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import { isSelectable, round3 } from './transform';

// The document actions behind the shortcuts (and, later, menus and buttons): each reads the
// current selection from the store and changes the book only through `store.apply`.

/** How far a paste or duplicate is shifted so the copy does not hide the original, in mm. */
const COPY_OFFSET = 5;
/** Arrow presses closer than this fold into one undo step. */
const NUDGE_WINDOW_MS = 600;

interface Context {
  book: Book;
  spread: Spread;
  /** The selected elements that still exist, in stacking order. */
  elements: Element[];
}

function context(): Context | null {
  const { book, currentSpreadId, selection } = editorStore.getState();
  const spread = findSpread(book, currentSpreadId);
  if (!book || !spread) return null;
  return { book, spread, elements: spread.elements.filter((el) => selection.includes(el.id)) };
}

/** Select the last `count` elements of the current spread: what an add or paste just put on top. */
function selectTop(count: number): void {
  const { book, currentSpreadId } = editorStore.getState();
  const spread = findSpread(book, currentSpreadId);
  if (spread) editorStore.getState().select(spread.elements.slice(-count).map((el) => el.id));
}

export function selectAll(): void {
  const c = context();
  if (c) editorStore.getState().select(c.spread.elements.filter(isSelectable).map((el) => el.id));
}

export function clearSelection(): void {
  editorStore.getState().select([]);
}

let nudgeKey = '';
let nudgeIds = '';
let nudgeAt = 0;

/** Move the selection by `dx`, `dy` mm. */
export function nudge(dx: number, dy: number): void {
  const c = context();
  const movable = c?.elements.filter((el) => !el.locked) ?? [];
  if (!c || movable.length === 0) return;
  const now = Date.now();
  const ids = movable.map((e) => e.id).join(',');
  if (now - nudgeAt > NUDGE_WINDOW_MS || ids !== nudgeIds) {
    nudgeKey = `nudge:${now}:${ids}`;
    nudgeIds = ids;
  }
  nudgeAt = now;
  editorStore.getState().apply(
    (book) =>
      transformElements(
        book,
        c.spread.id,
        movable.map((el) => ({ id: el.id, x: round3(el.x + dx), y: round3(el.y + dy) })),
      ),
    fr.canvas.undoNudge,
    nudgeKey,
  );
}

export function deleteSelection(): void {
  const c = context();
  if (!c || c.elements.length === 0) return;
  const ids = c.elements.map((el) => el.id);
  editorStore
    .getState()
    .apply((book) => removeElements(book, c.spread.id, ids), fr.canvas.undoDelete);
  clearSelection();
}

export function duplicateSelection(): void {
  const c = context();
  if (!c || c.elements.length === 0) return;
  const els = c.elements;
  editorStore
    .getState()
    .apply(
      (book) => pasteElements(book, c.spread.id, els, { dx: COPY_OFFSET, dy: COPY_OFFSET }),
      fr.canvas.undoDuplicate,
    );
  selectTop(els.length);
}

export function group(): void {
  const c = context();
  if (!c || c.elements.length < 2) return;
  const ids = c.elements.map((el) => el.id);
  editorStore
    .getState()
    .apply((book) => groupElements(book, c.spread.id, ids), fr.canvas.undoGroup);
}

export function ungroup(): void {
  const c = context();
  const groups = [...new Set(c?.elements.map((el) => el.groupId).filter((g) => g !== undefined))];
  if (!c || groups.length === 0) return;
  editorStore
    .getState()
    .apply(
      (book) => groups.reduce((b, g) => ungroupElements(b, c.spread.id, g), book),
      fr.canvas.undoUngroup,
    );
}

export function stack(to: 'forward' | 'backward'): void {
  const c = context();
  if (!c || c.elements.length === 0) return;
  const ids = c.elements.map((el) => el.id);
  editorStore
    .getState()
    .apply(
      (book) => reorderElements(book, c.spread.id, ids, to),
      to === 'forward' ? fr.canvas.undoForward : fr.canvas.undoBackward,
    );
}

/** Pastes since the last copy into the spread it came from: each is shifted one step more. */
let streak = 0;

/** Put the selection on the system clipboard, with the assets it uses. */
export async function copySelection(): Promise<boolean> {
  const c = context();
  if (!c || c.elements.length === 0) return false;
  const assets: AssetRef[] = [];
  for (const el of c.elements) {
    const id = el.type === 'photo' || el.type === 'sticker' ? el.assetId : null;
    const asset = id === null ? undefined : c.book.assets[id];
    if (asset && !assets.includes(asset)) assets.push(asset);
  }
  try {
    await window.tb.clipboard.writeElements({
      origin: { bookId: c.book.id, spreadId: c.spread.id },
      elements: c.elements,
      assets,
    });
  } catch {
    editorStore.getState().notify(fr.canvas.copyFailed);
    return false;
  }
  streak = 0;
  return true;
}

export async function cutSelection(): Promise<void> {
  if (await copySelection()) deleteSelection();
}

/** Paste what the clipboard holds on the current spread, and select it. */
export async function pasteClipboard(): Promise<void> {
  const { notify } = editorStore.getState();
  let payload;
  try {
    payload = await window.tb.clipboard.readElements();
  } catch {
    notify(fr.canvas.pasteFailed);
    return;
  }
  if (payload === null || payload.elements.length === 0) {
    notify(fr.canvas.nothingToPaste);
    return;
  }
  const c = context();
  if (!c) return;
  const sameSpread = payload.origin.bookId === c.book.id && payload.origin.spreadId === c.spread.id;
  const shift = sameSpread ? COPY_OFFSET * ++streak : 0;
  const { elements, assets } = payload;
  editorStore.getState().apply((book) => {
    const missing = assets.filter((a) => book.assets[a.id] === undefined);
    const withAssets =
      missing.length === 0
        ? book
        : {
            ...book,
            assets: { ...book.assets, ...Object.fromEntries(missing.map((a) => [a.id, a])) },
          };
    return pasteElements(withAssets, c.spread.id, elements, { dx: shift, dy: shift });
  }, fr.canvas.undoPaste);
  selectTop(elements.length);
}

/** Enter: start typing in the selected text element, if one alone is selected and unlocked. */
export function editSelectedText(): void {
  const c = context();
  const only = c?.elements.length === 1 ? c.elements[0] : undefined;
  if (only?.type === 'text' && !only.locked) editorStore.getState().enterTextEdit(only.id);
}
