import {
  boundingBox,
  type Element,
  type ElementTransform,
  type Mm,
  type Rect,
  type ResizeHandle,
  type Spread,
} from '@travelbook/core';

// Pure geometry of the canvas gestures, in mm. The pointer handling converts px to mm and back;
// the snapping itself is `core`'s (`snapMove`, `snapResize`), applied by `useTransform`.

export interface Pt {
  x: Mm;
  y: Mm;
}

/** Smallest size a resize can leave, in mm. */
export const MIN_SIZE = 2;

/** Positions are kept to a micrometre: the saved book stays free of float noise. */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function rotatePoint(p: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const centreOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Is `p` inside the (rotated) frame of the element? */
export function pointInElement(el: Element, p: Pt): boolean {
  const local = rotatePoint(
    { x: p.x - (el.x + el.w / 2), y: p.y - (el.y + el.h / 2) },
    -el.rotation,
  );
  return Math.abs(local.x) <= el.w / 2 && Math.abs(local.y) <= el.h / 2;
}

/** What the canvas lets the user pick: hidden elements are not drawn, locked ones are not picked. */
export const isSelectable = (el: Element): boolean => !el.hidden && !el.locked;

/** The topmost selectable element under `p`. */
export function elementAt(spread: Spread, p: Pt): Element | undefined {
  for (let i = spread.elements.length - 1; i >= 0; i--) {
    const el = spread.elements[i]!;
    if (isSelectable(el) && pointInElement(el, p)) return el;
  }
  return undefined;
}

/** `ids` plus the other selectable members of their groups. */
export function withGroups(spread: Spread, ids: readonly string[]): string[] {
  const groups = new Set<string>();
  for (const el of spread.elements) {
    if (ids.includes(el.id) && el.groupId !== undefined) groups.add(el.groupId);
  }
  return spread.elements
    .filter(
      (el) => isSelectable(el) && (ids.includes(el.id) || (el.groupId && groups.has(el.groupId))),
    )
    .map((el) => el.id);
}

/** Selectable elements whose box lies entirely inside `rect` (the marquee). */
export function enclosedBy(spread: Spread, rect: Rect): string[] {
  return spread.elements
    .filter((el) => {
      if (!isSelectable(el)) return false;
      const b = boundingBox(el);
      return (
        b.x >= rect.x &&
        b.y >= rect.y &&
        b.x + b.w <= rect.x + rect.w &&
        b.y + b.h <= rect.y + rect.h
      );
    })
    .map((el) => el.id);
}

export function normalizedRect(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function unionBox(boxes: readonly Rect[]): Rect {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * The rect a handle drag leaves: the opposite edges stay fixed. With `keepRatio` the size follows
 * the start ratio (on a corner, the larger of the two changes wins; on an edge the other side
 * follows about the centre). No side goes under `MIN_SIZE`. `dx`, `dy` are in the rect's own axes.
 */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: Mm,
  dy: Mm,
  keepRatio: boolean,
  min: Mm = MIN_SIZE,
): Rect {
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  let w = start.w + sx * dx;
  let h = start.h + sy * dy;
  if (keepRatio && start.w > 0 && start.h > 0) {
    const floor = Math.max(min / start.w, min / start.h);
    let k: number;
    if (sx !== 0 && sy !== 0) k = Math.max(w / start.w, h / start.h);
    else k = sx !== 0 ? w / start.w : h / start.h;
    k = Math.max(k, floor);
    w = start.w * k;
    h = start.h * k;
  } else {
    if (sx !== 0) w = Math.max(w, min);
    if (sy !== 0) h = Math.max(h, min);
  }
  const x = sx < 0 ? start.x + start.w - w : sx > 0 ? start.x : start.x + (start.w - w) / 2;
  const y = sy < 0 ? start.y + start.h - h : sy > 0 ? start.y : start.y + (start.h - h) / 2;
  return { x, y, w, h };
}

/**
 * Handles whose ratio-keeping the user did not ask for: photos and stickers keep it on corners.
 * Texts, shapes and maps resize freely: a taller or wider map shows more context (spec §7.1).
 */
export const keepsRatioOnCorners = (el: Element): boolean =>
  el.type === 'photo' || el.type === 'sticker';

export const isCorner = (handle: ResizeHandle): boolean => handle.length === 2;

/** Is the element's frame axis-aligned, so that edge snapping means something? */
export const isUpright = (el: Element): boolean => el.rotation % 360 === 0;

export function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return round3(a >= 360 ? 0 : a);
}

export function snapAngle(deg: number, step: number): number {
  return Math.round(deg / step) * step;
}

/** Angle of `p` seen from `from`, in degrees, 0 pointing up and growing clockwise. */
export function angleFrom(from: Pt, p: Pt): number {
  return (Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI + 90;
}

/** Turn elements by `delta` degrees about `pivot`: positions orbit it, rotations add up. */
export function rotateAbout(
  els: readonly Element[],
  pivot: Pt,
  delta: number,
  snapTo?: number,
): ElementTransform[] {
  const single = els.length === 1;
  return els.map((el) => {
    let rotation = el.rotation + delta;
    if (snapTo !== undefined && single) rotation = snapAngle(rotation, snapTo);
    const c = rotatePoint(
      { x: el.x + el.w / 2 - pivot.x, y: el.y + el.h / 2 - pivot.y },
      rotation - el.rotation,
    );
    return {
      id: el.id,
      x: round3(pivot.x + c.x - el.w / 2),
      y: round3(pivot.y + c.y - el.h / 2),
      rotation: normalizeAngle(rotation),
    };
  });
}

/**
 * Move the frame of one element to a rect given in its own (unrotated, centred) axes: the new
 * centre is the old one shifted by the rect's centre, turned with the element.
 */
export function placeLocalRect(el: Element, local: Rect): Rect {
  const c = rotatePoint(centreOf(local), el.rotation);
  const cx = el.x + el.w / 2 + c.x;
  const cy = el.y + el.h / 2 + c.y;
  return { x: cx - local.w / 2, y: cy - local.h / 2, w: local.w, h: local.h };
}

/** The frame of `el` as a rect centred on the origin, in its own axes. */
export const localRect = (el: Element): Rect => ({ x: -el.w / 2, y: -el.h / 2, w: el.w, h: el.h });

/** Stretch elements with the box around them: each follows the box from `from` to `to`. */
export function scaleWith(els: readonly Element[], from: Rect, to: Rect): ElementTransform[] {
  const kx = from.w > 0 ? to.w / from.w : 1;
  const ky = from.h > 0 ? to.h / from.h : 1;
  return els.map((el) => {
    const upright = el.rotation % 180 === 0;
    const fw = upright ? kx : (kx + ky) / 2;
    const fh = upright ? ky : (kx + ky) / 2;
    const cx = to.x + (el.x + el.w / 2 - from.x) * kx;
    const cy = to.y + (el.y + el.h / 2 - from.y) * ky;
    const w = el.w * fw;
    const h = el.h * fh;
    return { id: el.id, x: round3(cx - w / 2), y: round3(cy - h / 2), w: round3(w), h: round3(h) };
  });
}
