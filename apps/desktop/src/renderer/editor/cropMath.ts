import { visibleRect, type Crop, type Mm } from '@travelbook/core';

// Pan and zoom of a photo inside its frame (crop mode). Pure geometry on `core`'s `visibleRect`:
// the crop keeps the window of source pixels the frame shows inside the image.

/** Zoom bounds of a crop; 1 is the cover fit. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

type Pixel = { w: number; h: number };
type Frame = { w: Mm; h: Mm };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
/** Crops are kept to four decimals: the saved book stays free of float noise. */
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/**
 * `crop` with its scale held within `MIN_SCALE..MAX_SCALE` and its centre moved, if need be, so
 * that the window stays inside the image (no empty band in the frame). The result is valid for
 * `setCrop`.
 */
export function clampCrop(pixel: Pixel, frame: Frame, crop: Crop): Crop {
  const scale = round4(clamp(crop.scale, MIN_SCALE, MAX_SCALE));
  if (!(frame.w > 0 && frame.h > 0)) return { scale, cx: 0.5, cy: 0.5 };
  const { sw, sh } = visibleRect(pixel, frame, { ...crop, scale });
  const halfW = sw / pixel.w / 2;
  const halfH = sh / pixel.h / 2;
  return {
    scale,
    cx: round4(clamp(crop.cx, halfW, 1 - halfW)),
    cy: round4(clamp(crop.cy, halfH, 1 - halfH)),
  };
}

/**
 * The crop after dragging the image by (`dx`, `dy`) mm in the frame's own axes (right and down are
 * positive, as the user sees them). The window moves the other way; a flipped photo is seen in a
 * mirror, so its window moves with the pointer along the flipped axis.
 */
export function panCrop(
  pixel: Pixel,
  frame: Frame,
  crop: Crop,
  dx: Mm,
  dy: Mm,
  flip: { h: boolean; v: boolean },
): Crop {
  if (!(frame.w > 0 && frame.h > 0)) return crop;
  const { sw, sh } = visibleRect(pixel, frame, crop);
  const sx = (flip.h ? -1 : 1) * dx * (sw / frame.w);
  const sy = (flip.v ? -1 : 1) * dy * (sh / frame.h);
  return clampCrop(pixel, frame, {
    scale: crop.scale,
    cx: (crop.cx * pixel.w - sx) / pixel.w,
    cy: (crop.cy * pixel.h - sy) / pixel.h,
  });
}

/** The crop at another zoom, around the same centre (moved inside the image if it must be). */
export function zoomCrop(pixel: Pixel, frame: Frame, crop: Crop, scale: number): Crop {
  return clampCrop(pixel, frame, { ...crop, scale });
}

/**
 * CSS `clip-path` for the full image of a crop view that leaves the window the frame shows out:
 * the dimmed picture is drawn around the frame, not over it. The coordinates are percentages of
 * the image's own box, so the path holds at any zoom of the canvas.
 */
export function dimClip(pixel: Pixel, frame: Frame, crop: Crop): string {
  const { sx, sy, sw, sh } = visibleRect(pixel, frame, crop);
  const pct = (v: number): string => `${round4(v * 100)}%`;
  const x1 = pct(sx / pixel.w);
  const y1 = pct(sy / pixel.h);
  const x2 = pct((sx + sw) / pixel.w);
  const y2 = pct((sy + sh) / pixel.h);
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x1} ${y1}, ${x1} ${y2}, ${x2} ${y2}, ${x2} ${y1}, ${x1} ${y1})`;
}
