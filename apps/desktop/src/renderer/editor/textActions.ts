import {
  addElement,
  pageBox,
  removeElements,
  spreadSize,
  type Book,
  type Rect,
  type Spread,
  type TextElement,
} from '@travelbook/core';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import { blankTextElement, presetElement, type TextPreset } from './textPresets';

/** The text element a creation just made: removed again if the user leaves it without typing. */
let fresh: string | null = null;

/** Does a Tiptap document hold any text? */
export function isEmptyDoc(doc: unknown): boolean {
  if (typeof doc !== 'object' || doc === null) return true;
  const node = doc as { text?: unknown; content?: unknown };
  if (typeof node.text === 'string' && node.text !== '') return false;
  return !Array.isArray(node.content) || node.content.every(isEmptyDoc);
}

/** The page of `spread` a new element is put on: the right one, else the left, else the spread. */
function targetPage(book: Book, spread: Spread): Rect {
  return (
    pageBox(book, spread, 'right') ??
    pageBox(book, spread, 'left') ?? { x: 0, y: 0, ...spreadSize(book, spread) }
  );
}

/** Put `el` on the current spread, select it and start typing in it. */
function place(el: TextElement, spreadId: string, selectAll: boolean): void {
  const store = editorStore.getState();
  store.apply((b) => addElement(b, spreadId, el), fr.text.undoCreate);
  fresh = el.id;
  store.enterTextEdit(el.id, selectAll);
}

/** The "Texte" panel: a text of `preset`, centred on the page, its sample selected. */
export function addPresetText(preset: TextPreset): void {
  const { book, currentSpreadId } = editorStore.getState();
  const spread = findSpread(book, currentSpreadId);
  if (!book || !spread) return;
  const page = targetPage(book, spread);
  const { w, h } = preset.size;
  place(
    presetElement(preset, { x: page.x + (page.w - w) / 2, y: page.y + (page.h - h) / 2 }),
    spread.id,
    true,
  );
}

/** The text tool: an empty text in the box drawn on the canvas. */
export function addDrawnText(rect: Rect): void {
  const { currentSpreadId } = editorStore.getState();
  if (currentSpreadId === null) return;
  place(blankTextElement(rect), currentSpreadId, false);
}

/**
 * Stop typing: the text is already in the document (every keystroke went through `store.apply`).
 * A text created a moment ago and left empty is removed, as it could neither be seen nor found.
 */
export function leaveTextEdit(): void {
  const { editingId, book, currentSpreadId, exitTextEdit, apply } = editorStore.getState();
  if (editingId === null) return;
  exitTextEdit();
  if (fresh !== editingId) return;
  fresh = null;
  const el = findSpread(book, currentSpreadId)?.elements.find((e) => e.id === editingId);
  if (currentSpreadId !== null && el?.type === 'text' && isEmptyDoc(el.doc)) {
    apply((b) => removeElements(b, currentSpreadId, [editingId]), fr.text.undoRemoveEmpty);
  }
}
