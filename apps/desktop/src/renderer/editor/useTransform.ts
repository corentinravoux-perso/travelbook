import {
  boundingBox,
  snapLinesFor,
  snapMove,
  snapResize,
  transformElements,
  type Element,
  type ElementTransform,
  type Guide,
  type Rect,
  type ResizeHandle,
} from '@travelbook/core';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import {
  angleFrom,
  centreOf,
  isCorner,
  isUpright,
  keepsRatioOnCorners,
  localRect,
  placeLocalRect,
  rotateAbout,
  rotatePoint,
  resizeRect,
  round3,
  scaleWith,
  snapAngle,
  unionBox,
  type Pt,
} from './transform';

/** Snapping engages this far from a line, in screen px (converted to mm at the current zoom). */
export const SNAP_PX = 6;
/** A press moves nothing until the pointer has travelled this far, in px: a click is not a drag. */
export const DRAG_SLOP_PX = 3;
/** Shift snaps a rotation to this step, in degrees. */
const ROTATE_STEP = 15;

let gestureCount = 0;

/** Where a pointer is on the page, in mm. */
export type ToMm = (clientX: number, clientY: number) => Pt;

interface Gesture {
  /** Elements as they were when the gesture began (the book changes under it). */
  start: Element[];
  spreadId: string;
  /** Snap lines of the rest of the spread, computed once. */
  lines: ReturnType<typeof snapLinesFor>;
  /** Pointer on the page at the start, in mm. */
  origin: Pt;
}

interface Modifiers {
  shift: boolean;
  alt: boolean;
}

export interface Transform {
  /** Snap guides to draw now, spread coordinates. */
  guides: Guide[];
  startMove(e: { clientX: number; clientY: number }): void;
  startResize(handle: ResizeHandle, e: { clientX: number; clientY: number }): void;
  startRotate(e: { clientX: number; clientY: number }): void;
}

/**
 * Move, resize and rotate the selection with the pointer. The canvas converts px to mm
 * (`toMm`, `scale`); where an edge may snap, `core`'s `snapMove` and `snapResize` decide. One
 * gesture is one undo step: every update is applied with the same `mergeKey`.
 */
export function useTransform(toMm: ToMm, scale: number): Transform {
  const [guides, setGuides] = useState<Guide[]>([]);
  const scaleRef = useRef(scale);
  const toMmRef = useRef(toMm);
  // Gestures run long after the render that started them: they read the latest values from here.
  useLayoutEffect(() => {
    scaleRef.current = scale;
    toMmRef.current = toMm;
  });

  /** Track the pointer until it is released; `update` maps it to changes of the document. */
  const run = useCallback(
    (
      label: string,
      kind: string,
      begin: (
        g: Gesture,
      ) => ((pointer: Pt, m: Modifiers) => { changes: ElementTransform[]; guides: Guide[] }) | null,
      first: { clientX: number; clientY: number },
    ) => {
      const { book, currentSpreadId, selection } = editorStore.getState();
      const spread = findSpread(book, currentSpreadId);
      if (!book || !spread) return;
      const start = spread.elements.filter((el) => selection.includes(el.id) && !el.locked);
      if (start.length === 0) return;
      const gesture: Gesture = {
        start,
        spreadId: spread.id,
        lines: snapLinesFor(
          book,
          spread,
          start.map((el) => el.id),
        ),
        origin: toMmRef.current(first.clientX, first.clientY),
      };
      const update = begin(gesture);
      if (!update) return;
      const key = `${kind}:${++gestureCount}`;
      let moved = false;

      const move = (ev: PointerEvent) => {
        if (
          !moved &&
          Math.hypot(ev.clientX - first.clientX, ev.clientY - first.clientY) < DRAG_SLOP_PX
        ) {
          return;
        }
        moved = true;
        const out = update(toMmRef.current(ev.clientX, ev.clientY), {
          shift: ev.shiftKey,
          alt: ev.altKey,
        });
        setGuides(out.guides);
        editorStore
          .getState()
          .apply((b) => transformElements(b, gesture.spreadId, out.changes), label, key);
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        setGuides([]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [],
  );

  const threshold = () => SNAP_PX / scaleRef.current;

  const startMove: Transform['startMove'] = useCallback(
    (e) =>
      run(
        fr.canvas.undoMove,
        'drag',
        (g) => {
          const box = unionBox(g.start.map(boundingBox));
          return (pointer, m) => {
            let dx = pointer.x - g.origin.x;
            let dy = pointer.y - g.origin.y;
            let guides: Guide[] = [];
            if (!m.alt) {
              const snap = snapMove({ ...box, x: box.x + dx, y: box.y + dy }, g.lines, threshold());
              dx += snap.dx;
              dy += snap.dy;
              guides = snap.guides;
            }
            return {
              guides,
              changes: g.start.map((el) => ({
                id: el.id,
                x: round3(el.x + dx),
                y: round3(el.y + dy),
              })),
            };
          };
        },
        e,
      ),
    [run],
  );

  const startResize: Transform['startResize'] = useCallback(
    (handle, e) =>
      run(
        fr.canvas.undoResize,
        'resize',
        (g) => {
          const single = g.start.length === 1 ? g.start[0]! : null;
          return (pointer, m) => {
            const d = { x: pointer.x - g.origin.x, y: pointer.y - g.origin.y };
            if (single) {
              // The drag is measured in the element's own axes, so a rotated frame resizes true.
              const own = rotatePoint(d, -single.rotation);
              const keep = m.shift || (keepsRatioOnCorners(single) && isCorner(handle));
              const local = resizeRect(localRect(single), handle, own.x, own.y, keep);
              let rect: Rect = placeLocalRect(single, local);
              let guides: Guide[] = [];
              if (!m.alt && isUpright(single)) {
                const snapped = snapResize(rect, handle, g.lines, threshold(), keep);
                rect = snapped.rect;
                guides = snapped.guides;
              }
              return {
                guides,
                changes: [
                  {
                    id: single.id,
                    x: round3(rect.x),
                    y: round3(rect.y),
                    w: round3(rect.w),
                    h: round3(rect.h),
                  },
                ],
              };
            }
            // Several elements stretch with the box around them.
            const box = unionBox(g.start.map(boundingBox));
            const keep = m.shift || (isCorner(handle) && g.start.every(keepsRatioOnCorners));
            let rect = resizeRect(box, handle, d.x, d.y, keep);
            let guides: Guide[] = [];
            if (!m.alt) {
              const snapped = snapResize(rect, handle, g.lines, threshold(), keep);
              rect = snapped.rect;
              guides = snapped.guides;
            }
            return { guides, changes: scaleWith(g.start, box, rect) };
          };
        },
        e,
      ),
    [run],
  );

  const startRotate: Transform['startRotate'] = useCallback(
    (e) =>
      run(
        fr.canvas.undoRotate,
        'rotate',
        (g) => {
          const pivot = centreOf(unionBox(g.start.map(boundingBox)));
          const from = angleFrom(pivot, g.origin);
          const many = g.start.length > 1;
          return (pointer, m) => {
            let delta = angleFrom(pivot, pointer) - from;
            if (m.shift && many) delta = snapAngle(delta, ROTATE_STEP);
            return {
              guides: [],
              changes: rotateAbout(
                g.start,
                pivot,
                delta,
                m.shift && !many ? ROTATE_STEP : undefined,
              ),
            };
          };
        },
        e,
      ),
    [run],
  );

  return { guides, startMove, startResize, startRotate };
}
