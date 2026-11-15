import { photoShadowIsCast, textShadowIsNative } from '@travelbook/render/src/shadows.ts';
import type { PhotoElement, Spread } from '@travelbook/core';

/**
 * Why a page cannot be printed as vector: the effects that Chromium's `printToPDF` rasterises at
 * low resolution (proven with `pdfimages -list`, see docs/decisions/0001-export-fidelity.md,
 * section "7.3 effects"). A page with a reason is captured at 600 dpi and embedded as an image.
 * Nearly every effect is drawn another way in `export` quality; what is left is rare:
 * a feathered photo with a shadow, a text outline with no fill and a shadow.
 */
export function rasterReasons(spread: Spread, photos: PhotoElement[]): string[] {
  const reasons: string[] = [];
  if (photos.some((p) => p.shadow !== null && !photoShadowIsCast(p))) {
    reasons.push('photo with a shadow and a feathered edge');
  }
  for (const el of spread.elements) {
    if (el.type === 'text' && !el.hidden && el.shadow && !textShadowIsNative(el)) {
      reasons.push('text with a shadow and an outline but no fill');
    }
  }
  return reasons;
}
