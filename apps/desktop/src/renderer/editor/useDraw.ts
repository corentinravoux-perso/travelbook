import type { Rect } from '@travelbook/core';
import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { constrainBox, constrainLine } from './draw';
import { normalizedRect, type Pt } from './transform';
import { DRAG_SLOP_PX, type ToMm } from './useTransform';

/** What is being drawn now, for the canvas to show. */
export type Draft = { kind: 'box'; rect: Rect } | { kind: 'line'; a: Pt; b: Pt };

export interface Draw {
  draft: Draft | null;
  /**
   * Follow the pointer from `first` until it is released. `onDone` gets the start and end points
   * on the page (mm), with Shift applied, and whether the pointer moved enough to be a drag; a
   * press that is cancelled gives nothing.
   */
  start(
    first: PointerEvent,
    kind: Draft['kind'],
    onDone: (from: Pt, to: Pt, dragged: boolean) => void,
  ): void;
}

/** Drawing a new element: a box (text, shapes) or a segment (lines, arrows). */
export function useDraw(toMm: ToMm): Draw {
  const [draft, setDraft] = useState<Draft | null>(null);
  const toMmRef = useRef(toMm);
  useLayoutEffect(() => {
    toMmRef.current = toMm;
  });

  const start: Draw['start'] = useCallback((first, kind, onDone) => {
    const from = toMmRef.current(first.clientX, first.clientY);
    let to = from;
    let dragged = false;
    const end = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDraft(null);
      if (ev.type === 'pointerup') onDone(from, to, dragged);
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (
        !dragged &&
        Math.hypot(ev.clientX - first.clientX, ev.clientY - first.clientY) < DRAG_SLOP_PX
      ) {
        return;
      }
      dragged = true;
      const raw = toMmRef.current(ev.clientX, ev.clientY);
      if (kind === 'box') {
        to = constrainBox(from, raw, ev.shiftKey);
        setDraft({ kind, rect: normalizedRect(from, to) });
      } else {
        to = constrainLine(from, raw, ev.shiftKey);
        setDraft({ kind, a: from, b: to });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  return { draft, start };
}
