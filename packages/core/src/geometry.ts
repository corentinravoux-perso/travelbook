import type { Book, Crop, ElementBase, Mm, Rect, Side, Spread } from './schema';

/** CSS pixels per millimetre (96 px per inch). */
export const MM_TO_PX = 96 / 25.4;

export function spreadSize(book: Book, spread: Spread): { w: Mm; h: Mm } {
  const { width, height } = book.format;
  const w = spread.kind === 'cover' ? 2 * width + book.spineWidth : 2 * width;
  return { w, h: height };
}

/** Trim box of a page in spread coordinates, or null when the page does not exist. */
export function pageBox(book: Book, spread: Spread, side: Side): Rect | null {
  const { width: W, height: H } = book.format;
  if (spread.kind === 'first' && side === 'left') return null;
  if (spread.kind === 'last' && side === 'right') return null;
  if (side === 'left') return { x: 0, y: 0, w: W, h: H };
  const x = spread.kind === 'cover' ? W + book.spineWidth : W;
  return { x, y: 0, w: W, h: H };
}

/** Spine zone of the cover spread. */
export function spineBox(book: Book): Rect {
  const { width: W, height: H } = book.format;
  return { x: W, y: 0, w: book.spineWidth, h: H };
}

/** Region exported for a page: the trim box, grown by the bleed on all four sides if asked. */
export function exportBox(book: Book, spread: Spread, side: Side, bleed: boolean): Rect {
  const box = pageBox(book, spread, side);
  if (!box) {
    throw new RangeError(`Spread of kind "${spread.kind}" has no ${side} page to export.`);
  }
  if (!bleed) return box;
  const b = spread.kind === 'cover' ? book.coverBleed : book.bleed;
  return { x: box.x - b, y: box.y - b, w: box.w + 2 * b, h: box.h + 2 * b };
}

/**
 * Page an element belongs to, from its centre. A centre exactly on the spine line is
 * 'right'. On a cover, the whole spine zone counts as 'right' (front).
 */
export function sideOfElement(book: Book, spread: Spread, el: ElementBase): Side {
  const cx = el.x + el.w / 2;
  return cx < book.format.width ? 'left' : 'right';
}

/** Axis-aligned box of the element's rect rotated (degrees) about its centre. */
export function boundingBox(el: ElementBase): Rect {
  const a = (el.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = el.w * c + el.h * s;
  const h = el.w * s + el.h * c;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Source-pixel window shown in a frame. At scale 1 the image covers the frame
 * (cover fit), centred on (cx, cy); scale s shows a window 1/s as large; the window
 * is clamped inside the image. Values are not rounded.
 */
export function visibleRect(
  pixel: { w: number; h: number },
  frame: { w: Mm; h: Mm },
  crop: Crop,
): { sx: number; sy: number; sw: number; sh: number } {
  const frameAspect = frame.w / frame.h;
  const imageAspect = pixel.w / pixel.h;
  let sw: number;
  let sh: number;
  if (imageAspect > frameAspect) {
    sh = pixel.h / crop.scale;
    sw = sh * frameAspect;
  } else {
    sw = pixel.w / crop.scale;
    sh = sw / frameAspect;
  }
  sw = Math.min(sw, pixel.w);
  sh = Math.min(sh, pixel.h);
  const sx = Math.min(Math.max(crop.cx * pixel.w - sw / 2, 0), pixel.w - sw);
  const sy = Math.min(Math.max(crop.cy * pixel.h - sh / 2, 0), pixel.h - sh);
  return { sx, sy, sw, sh };
}

/**
 * Shown source pixels per inch along the frame's limiting (lower-density) axis,
 * rounded with Math.round.
 */
export function effectiveDpi(
  pixel: { w: number; h: number },
  frame: { w: Mm; h: Mm },
  crop: Crop,
): number {
  const { sw, sh } = visibleRect(pixel, frame, crop);
  return Math.round(Math.min(sw / (frame.w / 25.4), sh / (frame.h / 25.4)));
}

export function dpiLevel(dpi: number, s: Book['settings']): 'good' | 'ok' | 'low' {
  if (dpi >= s.dpiGood) return 'good';
  if (dpi >= s.dpiLow) return 'ok';
  return 'low';
}

export function mmToPxAtDpi(mm: Mm, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}
