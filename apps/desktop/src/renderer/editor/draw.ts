import type { Rect } from '@travelbook/core';
import { round3, snapAngle, type Pt } from './transform';

// Pure geometry of drawing a new element with the pointer, in mm.

/** Shift snaps a drawn line to this step, in degrees. */
const LINE_STEP = 15;
/** A drag shorter than this, in mm, is a click: the element gets its default size. */
export const MIN_DRAWN_MM = 3;

/** With Shift a box stays square: the end moves to the larger of the two distances. */
export function constrainBox(from: Pt, to: Pt, shift: boolean): Pt {
  if (!shift) return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
}

/** With Shift a line keeps its length and snaps to a multiple of 15 degrees. */
export function constrainLine(from: Pt, to: Pt, shift: boolean): Pt {
  if (!shift) return to;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle =
    (snapAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI, LINE_STEP) * Math.PI) /
    180;
  return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
}

/**
 * The box and rotation of a line or arrow from `a` to `b`: a box as long as the segment and
 * `thickness` high, centred on its middle, turned so that its horizontal axis runs from `a` to `b`.
 */
export function lineBox(a: Pt, b: Pt, thickness: number): { rect: Rect; rotation: number } {
  const w = Math.hypot(b.x - a.x, b.y - a.y);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  return {
    rect: {
      x: round3(cx - w / 2),
      y: round3(cy - thickness / 2),
      w: round3(w),
      h: thickness,
    },
    rotation: round3((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI),
  };
}

/** A drawn rectangle with its numbers kept to a micrometre, so that the book holds no float noise. */
export function roundRect(rect: Rect): Rect {
  return { x: round3(rect.x), y: round3(rect.y), w: round3(rect.w), h: round3(rect.h) };
}
