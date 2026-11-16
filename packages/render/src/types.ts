import type { Book, Element, MapGeometry, Rect, Spread } from '@travelbook/core';
import type { ReactNode } from 'react';

/**
 * How much the image files are worth: `thumb` and `preview` are the proxies of the photos
 * (320 and 2560 px), `export` is what the PDF is made from.
 */
export type Quality = 'thumb' | 'preview' | 'export';

/**
 * URL of the image file of an asset at a quality. `el` is the element asking, when there is one
 * (photos, stickers; not backgrounds): in `export` quality the file of a photo is already cropped
 * to what its frame shows, so it can depend on the element and not only on the asset.
 */
export type AssetUrl = (assetId: string, quality: Quality, el?: Element) => string;

export interface SpreadViewProps {
  book: Book;
  spread: Spread;
  quality: Quality;
  assetUrl: AssetUrl;
  /** Spread coordinates (mm). Default: the whole spread, without bleed. */
  clip?: Rect;
  /** Editor overlay hook: wraps the node drawn for each element that is on the page. */
  renderElement?(el: Element, node: ReactNode): ReactNode;
  /** Draw the frame of a photo that has no photo yet. `true` in the editor only. */
  showEmptySlots?: boolean;
  /**
   * `export` only: URL of the tile of the pattern background of `layer`, already painted with its
   * foreground colour (PNG with alpha, natural size). With it the pattern is a tiled image: the
   * mask a pattern is otherwise made of is rasterised at 300 dpi by `printToPDF`.
   */
  patternTile?(layer: 'spread' | 'left' | 'right'): string | undefined;
  /**
   * The baked geometry of a map asset: `null` while it loads (the map is an empty frame),
   * `'missing'` when the asset cannot be read (a hatched frame). Without it every map is empty.
   */
  mapGeometry?(assetId: string): MapGeometry | null | 'missing';
}
