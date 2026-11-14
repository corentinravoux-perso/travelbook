import {
  newBook,
  newElement,
  setIdSource,
  type AssetRef,
  type Book,
  type Element,
  type PhotoElement,
  type Rect,
  type ShapeElement,
  type Spread,
  type StickerElement,
} from '@travelbook/core';
import type { AssetUrl } from './types';

let counter = 0;
setIdSource(() => `id${++counter}`);

export function asset(
  id: string,
  kind: AssetRef['kind'] = 'photo',
  pixel?: { w: number; h: number },
): AssetRef {
  return {
    id,
    kind,
    file: `originals/${id}.jpg`,
    originalName: `${id}.jpg`,
    sha256: id,
    ...(pixel ? { pixel } : {}),
  };
}

/** The URL a test view of the album would ask for: everything the callback got, in the query. */
export const urlOf: AssetUrl = (assetId, quality, el) =>
  `test://asset/${assetId}?q=${quality}${el ? `&el=${el.id}` : ''}`;

export function photo(rect: Rect, patch: Partial<PhotoElement> = {}): PhotoElement {
  return { ...newElement('photo', rect), ...patch };
}

export function sticker(rect: Rect, patch: Partial<StickerElement> = {}): StickerElement {
  return { ...newElement('sticker', rect), assetId: 'stk', ...patch };
}

export function shape(rect: Rect, patch: Partial<ShapeElement> = {}): ShapeElement {
  return { ...newElement('shape', rect), ...patch };
}

/** A 210 x 297 album whose second spread (inner) holds `elements`. */
export function bookWith(
  elements: Element[] = [],
  assets: AssetRef[] = [],
  edit?: (book: Book, spread: Spread) => void,
): { book: Book; spread: Spread } {
  const book = newBook({ title: 'test', innerSpreads: 2 });
  book.assets = Object.fromEntries(assets.map((a) => [a.id, a]));
  const spread = book.spreads[1] as Spread;
  spread.elements = elements;
  edit?.(book, spread);
  return { book, spread };
}
