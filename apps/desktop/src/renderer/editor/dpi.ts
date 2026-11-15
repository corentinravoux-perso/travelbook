import { dpiLevel, effectiveDpi, type Book, type PhotoElement } from '@travelbook/core';

export type DpiLevel = ReturnType<typeof dpiLevel>;

export interface Resolution {
  /** Source pixels per inch that the frame shows at print size. */
  dpi: number;
  level: DpiLevel;
}

/**
 * The resolution a placed photo will print at (spec §8): what its frame shows of the image, at
 * its size on the page, judged by the book's thresholds. `null` for an empty frame, or when the
 * asset has no recorded pixel size.
 */
export function photoResolution(book: Book, el: PhotoElement): Resolution | null {
  if (el.assetId === null) return null;
  const pixel = book.assets[el.assetId]?.pixel;
  if (!pixel) return null;
  const dpi = effectiveDpi(pixel, el, el.crop);
  return { dpi, level: dpiLevel(dpi, book.settings) };
}
