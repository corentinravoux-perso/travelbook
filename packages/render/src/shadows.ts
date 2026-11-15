import type { PhotoElement, TextElement } from '@travelbook/core';
import { validColor } from './cssValues';

/**
 * In `export` quality the shadow is cast by a plain shape under the photo, not by a `drop-shadow`
 * filter on the photo: `printToPDF` rasterises whatever a filter wraps, photo included, at 300 dpi.
 * A feathered photo keeps the filter (its shadow follows the soft edge, which the shape does not
 * have); a page that holds one is printed as a 600 dpi capture instead.
 */
export function photoShadowIsCast(el: PhotoElement): boolean {
  return el.shadow !== null && !(el.edge && el.edge.feather > 0);
}

/**
 * In `export` quality the shadow of a text is drawn by `text-shadow` (or `box-shadow` when the box
 * has a fill) instead of a `drop-shadow` filter: `printToPDF` rasterises whatever a filter wraps,
 * the glyphs included. An outline with no fill has no such equivalent; a page that holds one is
 * printed as a 600 dpi capture.
 */
export function textShadowIsNative(el: TextElement): boolean {
  return !(el.outline && validColor(el.outline.color) && !validColor(el.box.fill));
}
