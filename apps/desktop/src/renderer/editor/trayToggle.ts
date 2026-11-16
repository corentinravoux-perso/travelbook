import {
  addElement,
  defaultCrop,
  fillSlot,
  newElement,
  pageBox,
  removeElements,
  updateElements,
  type Book,
  type PhotoElement,
  type Rect,
  type Side,
  type Spread,
} from '@travelbook/core';
import { editorStore, findSpread, type BookOp } from '../store/editor';
import { fr } from '../strings/fr';
import { newPhotoRect } from './PhotoDrop';

// A click on a photo of the tray puts it on the page in view, or takes it off. The plan is pure
// (tested without a DOM); `togglePhotoOnPage` applies it to the store.

export interface TogglePlan {
  op: BookOp;
  label: string;
  /** `add`: the photo went on the page; `remove`: it came off. */
  action: 'add' | 'remove';
  /** The frame the photo now fills (`add`), to select. */
  frameId?: string;
  /** A frame made for it (`add` on a page with no empty frame). */
  createdId?: string;
}

const centre = (el: Rect) => ({ x: el.x + el.w / 2, y: el.y + el.h / 2 });
const inside = (box: Rect, p: { x: number; y: number }) =>
  p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
/** Reading order: top to bottom, then left to right. */
const reading = (a: Rect, b: Rect) => a.y - b.y || a.x - b.x;

/** The page of `spread` that a photo goes on: `side` when the spread has it, else its only page. */
function targetPage(book: Book, spread: Spread, side: Side): Rect | null {
  return pageBox(book, spread, side) ?? pageBox(book, spread, side === 'left' ? 'right' : 'left');
}

/**
 * What a click on photo `assetId` of the tray does to the spread `spreadId`:
 * - the photo is on the spread: it comes off. A frame made by a click (`created`) goes; any other
 *   frame (a layout's) is emptied, so the next click fills it again;
 * - else it fills the first empty frame of page `side` (reading order), then of the spread, or
 *   gets a frame of its own at its ratio, in the middle of that page, shifted from the photos
 *   already there.
 * Locked frames are never touched. `null` when nothing can change.
 */
export function planTrayToggle(
  book: Book,
  spreadId: string,
  side: Side,
  assetId: string,
  created: ReadonlySet<string>,
): TogglePlan | null {
  const spread = findSpread(book, spreadId);
  const asset = book.assets[assetId];
  if (!spread || asset?.kind !== 'photo') return null;
  const photos = spread.elements.filter((el): el is PhotoElement => el.type === 'photo');

  const placed = photos.filter((el) => el.assetId === assetId);
  if (placed.length > 0) {
    const free = placed.filter((el) => !el.locked);
    if (free.length === 0) return null;
    const drop = free.filter((el) => created.has(el.id)).map((el) => el.id);
    const empty = free.filter((el) => !created.has(el.id)).map((el) => el.id);
    const op: BookOp = (b) => {
      let next = b;
      if (empty.length > 0) {
        next = updateElements(next, spreadId, empty, { assetId: null, crop: defaultCrop() });
      }
      if (drop.length > 0) next = removeElements(next, spreadId, drop);
      return next;
    };
    return { op, label: fr.photos.undoTakeOff, action: 'remove' };
  }

  const page = targetPage(book, spread, side);
  const slots = photos.filter((el) => el.assetId === null && !el.locked && !el.hidden);
  const onPage = page ? slots.filter((el) => inside(page, centre(el))) : [];
  const slot = [...onPage].sort(reading)[0] ?? [...slots].sort(reading)[0];
  if (slot) {
    return {
      op: (b) => fillSlot(b, spreadId, slot.id, assetId),
      label: fr.photos.undoPutOn,
      action: 'add',
      frameId: slot.id,
    };
  }

  const box = page ?? { x: 0, y: 0, w: book.format.width, h: book.format.height };
  const already = photos.filter((el) => inside(box, centre(el))).length;
  const rect = newPhotoRect(book, spread, asset, centre(box), already);
  const el: PhotoElement = { ...newElement('photo', rect), assetId };
  return {
    op: (b) => addElement(b, spreadId, el),
    label: fr.photos.undoPutOn,
    action: 'add',
    frameId: el.id,
    createdId: el.id,
  };
}

/** Frames made by a click on the tray this session: taking their photo off removes them. */
const madeByClick = new Set<string>();

/** Put photo `assetId` on the page in view, or take it off: one undo step. */
export function togglePhotoOnPage(assetId: string): TogglePlan['action'] | null {
  const store = editorStore.getState();
  const { book, currentSpreadId, activePage } = store;
  if (!book || currentSpreadId === null) return null;
  const plan = planTrayToggle(book, currentSpreadId, activePage, assetId, madeByClick);
  if (!plan) return null;
  if (plan.createdId) madeByClick.add(plan.createdId);
  store.apply(plan.op, plan.label);
  const after = editorStore.getState();
  if (plan.frameId) after.select([plan.frameId]);
  return plan.action;
}

/** Whether photo `assetId` is in a frame of the spread `spreadId`. */
export function isOnSpread(book: Book | null, spreadId: string | null, assetId: string): boolean {
  const spread = findSpread(book, spreadId);
  return spread?.elements.some((el) => el.type === 'photo' && el.assetId === assetId) ?? false;
}
