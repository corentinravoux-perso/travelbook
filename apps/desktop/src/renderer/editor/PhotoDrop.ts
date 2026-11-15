import {
  addElement,
  fillSlot,
  newElement,
  spreadSize,
  swapPhotos,
  type AssetRef,
  type Book,
  type Element,
  type PhotoElement,
  type Rect,
  type Spread,
} from '@travelbook/core';
import { useCallback, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { editorStore, findSpread, type BookOp } from '../store/editor';
import { fr } from '../strings/fr';
import { droppedPaths, photoImporter } from './photoImport';
import { pointInElement, round3, type Pt } from './transform';
import { DRAG_SLOP_PX, type ToMm } from './useTransform';

// Photos dropped on the page, and photos swapped: where a drop lands, and what it changes. The
// geometry and the plan are pure (tested without a DOM); the hooks wire them to the pointer.

/** MIME type of a drag that carries photos of the tray: a JSON array of asset ids. */
export const PHOTO_DRAG_TYPE = 'application/x-travelbook-photos';

/** A new frame is at most this share of the page, along each side. */
export const NEW_FRAME_SHARE = 0.45;
/** Each further frame of one drop is shifted by this much from the previous one, in mm. */
export const CASCADE_STEP = 6;
/** Ratio of a new frame for a photo whose size is not known. */
const DEFAULT_RATIO = 3 / 2;

export const encodePhotoDrag = (ids: readonly string[]): string => JSON.stringify(ids);

/** The asset ids of a tray drag; an empty list for anything else. */
export function decodePhotoDrag(data: string): string[] {
  try {
    const parsed: unknown = JSON.parse(data);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string' && id !== '')
      ? (parsed as string[])
      : [];
  } catch {
    return [];
  }
}

/** The topmost visible element under `p`, locked ones included (a locked frame still takes the hit). */
export function frameAt(spread: Spread, p: Pt): Element | undefined {
  for (let i = spread.elements.length - 1; i >= 0; i--) {
    const el = spread.elements[i] as Element;
    if (!el.hidden && pointInElement(el, p)) return el;
  }
  return undefined;
}

export type DropTarget =
  | { kind: 'slot'; element: PhotoElement }
  | { kind: 'page' }
  /** A locked photo frame: nothing may change there, and nothing is created under it either. */
  | { kind: 'refused' };

/** What a photo dropped at `p` lands on. */
export function dropTarget(spread: Spread, p: Pt): DropTarget {
  const hit = frameAt(spread, p);
  if (hit?.type !== 'photo') return { kind: 'page' };
  return hit.locked ? { kind: 'refused' } : { kind: 'slot', element: hit };
}

/**
 * The frame of a new photo element: the photo's own ratio, at most `NEW_FRAME_SHARE` of the
 * page on each side, centred on `p` (shifted by `step` cascade steps) and kept inside the spread.
 */
export function newPhotoRect(
  book: Book,
  spread: Spread,
  asset: AssetRef | undefined,
  p: Pt,
  step = 0,
): Rect {
  const ratio = asset?.pixel ? asset.pixel.w / asset.pixel.h : DEFAULT_RATIO;
  const maxW = book.format.width * NEW_FRAME_SHARE;
  const maxH = book.format.height * NEW_FRAME_SHARE;
  let w = Math.min(maxW, maxH * ratio);
  let h = w / ratio;
  const size = spreadSize(book, spread);
  w = Math.min(w, size.w);
  h = Math.min(h, size.h);
  const shift = step * CASCADE_STEP;
  return {
    x: round3(Math.min(Math.max(p.x - w / 2 + shift, 0), size.w - w)),
    y: round3(Math.min(Math.max(p.y - h / 2 + shift, 0), size.h - h)),
    w: round3(w),
    h: round3(h),
  };
}

export interface DropPlan {
  op: BookOp;
  /** The elements to select once it is done: the filled frame and the new ones. */
  select: string[];
  label: string;
}

/**
 * What dropping photos `assetIds` at `p` of a spread does. The first photo fills the frame it
 * lands on (a filled one too: its photo is replaced and, if nowhere else, becomes unused again);
 * the others, and all of them when `p` is on the bare page, get new frames at their own ratio,
 * shifted from one another. `null` when nothing changes: a locked frame, no known photo, or the
 * photo already in that frame.
 */
export function planPhotoDrop(
  book: Book,
  spreadId: string,
  assetIds: readonly string[],
  p: Pt,
): DropPlan | null {
  const spread = findSpread(book, spreadId);
  const ids = assetIds.filter((id) => book.assets[id] !== undefined);
  if (!spread || ids.length === 0) return null;
  const target = dropTarget(spread, p);
  if (target.kind === 'refused') return null;

  const ops: BookOp[] = [];
  const select: string[] = [];
  let rest = ids;
  let step = 0;
  let label: string = fr.photos.undoPlace;
  if (target.kind === 'slot') {
    const [first, ...others] = ids as [string, ...string[]];
    const slot = target.element;
    if (slot.assetId !== first) {
      ops.push((b) => fillSlot(b, spreadId, slot.id, first));
      label = others.length === 0 ? fr.photos.undoFill : fr.photos.undoPlace;
    }
    select.push(slot.id);
    rest = others;
    step = 1;
  }
  for (const id of rest) {
    const frame = newPhotoRect(book, spread, book.assets[id], p, step++);
    const el: PhotoElement = { ...newElement('photo', frame), assetId: id };
    ops.push((b) => addElement(b, spreadId, el));
    select.push(el.id);
  }
  if (ops.length === 0) return null;
  return { op: (b) => ops.reduce((acc, op) => op(acc), b), select, label };
}

/** Drop `assetIds` at `p` of `spreadId`: one undo step, and the result selected. */
export function placePhotos(spreadId: string, assetIds: readonly string[], p: Pt): void {
  const store = editorStore.getState();
  if (!store.book) return;
  const plan = planPhotoDrop(store.book, spreadId, assetIds, p);
  if (!plan) return;
  store.apply(plan.op, plan.label);
  if (editorStore.getState().currentSpreadId === spreadId)
    editorStore.getState().select(plan.select);
}

/**
 * The photo frame to swap with when a placed photo is released at `p`: another unlocked photo
 * frame, empty or filled, that is the topmost thing there.
 */
export function swapTarget(spread: Spread, sourceId: string, p: Pt): PhotoElement | null {
  const hit = frameAt(spread, p);
  return hit?.type === 'photo' && !hit.locked && hit.id !== sourceId ? hit : null;
}

/** Exchange the photos of two frames of the current spread (one undo step). */
export function swapFrames(spreadId: string, a: string, b: string): void {
  editorStore
    .getState()
    .apply(
      (book) => swapPhotos(book, { spreadId, elementId: a }, { spreadId, elementId: b }),
      fr.photos.undoSwap,
    );
}

/** Does this drag carry photos the page can take: the tray's, or files from the system? */
function carriesPhotos(types: readonly string[]): boolean {
  return types.includes(PHOTO_DRAG_TYPE) || types.includes('Files');
}

export interface PhotoDrop {
  /** The frame under a drag, to outline; `null` over the bare page. */
  hover: PhotoElement | null;
  onDragOver(e: DragEvent): void;
  onDragLeave(e: DragEvent): void;
  onDrop(e: DragEvent): void;
}

/**
 * Drops on the canvas: photos dragged from the tray, and image files or folders dragged from the
 * system, which are imported first and then placed like the others. The canvas gives `toMm` to
 * convert the pointer.
 */
export function usePhotoDrop(toMm: ToMm): PhotoDrop {
  const [hover, setHover] = useState<PhotoElement | null>(null);
  const toMmRef = useRef(toMm);
  useLayoutEffect(() => {
    toMmRef.current = toMm;
  });

  const spreadNow = () => {
    const { book, currentSpreadId } = editorStore.getState();
    return { book, spread: findSpread(book, currentSpreadId) };
  };

  const onDragOver = useCallback((e: DragEvent) => {
    if (!carriesPhotos(Array.from(e.dataTransfer.types))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { spread } = spreadNow();
    const target = spread ? dropTarget(spread, toMmRef.current(e.clientX, e.clientY)) : null;
    const frame = target?.kind === 'slot' ? target.element : null;
    setHover((old) => (old?.id === frame?.id ? old : frame));
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    // Moving over a child of the canvas fires a leave too: only leaving the canvas counts.
    if (e.currentTarget instanceof Node && e.relatedTarget instanceof Node) {
      if (e.currentTarget.contains(e.relatedTarget)) return;
    }
    setHover(null);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    if (!carriesPhotos(Array.from(e.dataTransfer.types))) return;
    e.preventDefault();
    setHover(null);
    const { spread } = spreadNow();
    if (!spread) return;
    const at = toMmRef.current(e.clientX, e.clientY);

    const own = e.dataTransfer.getData(PHOTO_DRAG_TYPE);
    if (own !== '') {
      placePhotos(spread.id, decodePhotoDrag(own), at);
      return;
    }
    // The file list is only readable during the event: take the paths now.
    const paths = droppedPaths(e.dataTransfer.files, (file) => window.tb.photos.pathForFile(file));
    if (paths.length === 0) return;
    void photoImporter.importPaths(paths).then((ids) => placePhotos(spread.id, ids, at));
  }, []);

  return { hover, onDragOver, onDragLeave, onDrop };
}

export interface PhotoSwap {
  /** The frame the dragged photo would swap with if released now. */
  target: PhotoElement | null;
  /** Begin dragging the photo `source`; the swap happens on release over another frame. */
  start(e: { clientX: number; clientY: number }, source: PhotoElement): void;
}

/**
 * Ctrl-drag of a placed photo onto another frame: the two exchange their photos and keep their
 * places. Nothing moves while dragging, so the frames stay where they are, and a drag that ends
 * on the bare page changes nothing.
 */
export function usePhotoSwap(toMm: ToMm): PhotoSwap {
  const [target, setTarget] = useState<PhotoElement | null>(null);
  const toMmRef = useRef(toMm);
  useLayoutEffect(() => {
    toMmRef.current = toMm;
  });

  const start = useCallback((first: { clientX: number; clientY: number }, source: PhotoElement) => {
    const spreadId = editorStore.getState().currentSpreadId;
    let moved = false;
    let over: PhotoElement | null = null;
    const find = (ev: PointerEvent): PhotoElement | null => {
      const { book, currentSpreadId } = editorStore.getState();
      const spread = findSpread(book, currentSpreadId);
      return spread ? swapTarget(spread, source.id, toMmRef.current(ev.clientX, ev.clientY)) : null;
    };
    const move = (ev: PointerEvent) => {
      if (
        !moved &&
        Math.hypot(ev.clientX - first.clientX, ev.clientY - first.clientY) < DRAG_SLOP_PX
      ) {
        return;
      }
      moved = true;
      over = find(ev);
      setTarget((old) => (old?.id === over?.id ? old : over));
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setTarget(null);
      if (ev.type === 'pointerup' && moved && spreadId !== null) {
        const final = find(ev);
        if (final) swapFrames(spreadId, source.id, final.id);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  return { target, start };
}
