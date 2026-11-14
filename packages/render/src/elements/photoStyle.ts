import { visibleRect, type Crop, type Mm, type PhotoElement } from '@travelbook/core';
import { pct } from '../units';

/**
 * Where to put the image inside its frame so that the frame shows exactly `visibleRect`: the
 * frame's own box is the unit, so the placement holds for the original, the preview and the
 * thumbnail alike (they differ in pixels, not in aspect ratio).
 */
export function imagePlacement(
  pixel: { w: number; h: number },
  frame: { w: Mm; h: Mm },
  crop: Crop,
): { left: string; top: string; width: string; height: string } {
  const { sx, sy, sw, sh } = visibleRect(pixel, frame, crop);
  return {
    left: pct((-sx / sw) * 100),
    top: pct((-sy / sh) * 100),
    width: pct((pixel.w / sw) * 100),
    height: pct((pixel.h / sh) * 100),
  };
}

/** CSS `filter` for the adjustments, with the neutral ones left out; undefined when all are. */
export function adjustFilter(adjust: PhotoElement['adjust']): string | undefined {
  const parts = [
    adjust.brightness !== 1 && `brightness(${adjust.brightness})`,
    adjust.contrast !== 1 && `contrast(${adjust.contrast})`,
    adjust.saturation !== 1 && `saturate(${adjust.saturation})`,
    adjust.grayscale !== 0 && `grayscale(${adjust.grayscale})`,
    adjust.sepia !== 0 && `sepia(${adjust.sepia})`,
  ].filter((part): part is string => part !== false);
  return parts.length === 0 ? undefined : parts.join(' ');
}
