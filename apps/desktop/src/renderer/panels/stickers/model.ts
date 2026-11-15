import type { Licence } from '@travelbook/core';
import { sourceErrorKind, type LibraryItem, type StickerHit } from '../../../shared/api';
import { fr } from '../../strings/fr';

const t = fr.stickers;

/** A thing the panel shows as a tile: a found sticker, or a file of the user library. */
export interface Tile {
  /** Unique among the tiles on screen. */
  key: string;
  title: string;
  /** A `tb://` address: the page loads nothing else. */
  src: string;
  licence?: Licence;
  /** A single-colour pictogram that can be tinted. */
  mono: boolean;
  /** A raster: it may have a background that shows. */
  raster: boolean;
  /** What placing it needs: a hit main knows, or a library item id. */
  ref: StickerRef;
  favourite?: boolean;
}

export type StickerRef =
  { kind: 'hit'; source: string; id: string } | { kind: 'item'; itemId: string };

export const tileOfHit = (hit: StickerHit): Tile => ({
  key: `hit:${hit.source}:${hit.id}`,
  title: hit.title,
  src: hit.thumbUrl,
  licence: hit.licence,
  mono: hit.mono,
  raster: hit.format !== 'svg',
  ref: { kind: 'hit', source: hit.source, id: hit.id },
});

export const tileOfItem = (item: LibraryItem): Tile => ({
  key: `item:${item.id}`,
  title: item.title,
  src: `tb://library/${item.id}`,
  ...(item.licence ? { licence: item.licence } : {}),
  mono: item.tags.includes('monochrome'),
  raster: /\.(png|jpe?g|webp)$/i.test(item.file),
  ref: { kind: 'item', itemId: item.id },
  favourite: item.favourite,
});

/** The short mark on a tile: `CC BY`, `CC0`, `MIT`… */
export function licenceMark(licence: string): string {
  if (/^CC0/i.test(licence)) return 'CC0';
  const sa = /^CC-BY-SA/i.exec(licence);
  if (sa) return 'CC BY-SA';
  if (/^CC-BY/i.test(licence)) return 'CC BY';
  if (/^(PDM|PD)/i.test(licence)) return 'PD';
  if (/^Apache/i.test(licence)) return 'Apache';
  return licence;
}

export interface Filters {
  mono: 'all' | 'colour' | 'mono';
  noAttribution: boolean;
}

export const NO_FILTERS: Filters = { mono: 'all', noAttribution: false };

/** Keep the tiles the filters allow (the offline search filters on its own side). */
export function applyFilters(tiles: readonly Tile[], filters: Filters): Tile[] {
  return tiles.filter(
    (tile) =>
      (filters.mono === 'all' || tile.mono === (filters.mono === 'mono')) &&
      (!filters.noAttribution || tile.licence === undefined || !tile.licence.requiresAttribution),
  );
}

/** The French message of a failed call to an online source, from the error that crossed IPC. */
export function sourceMessage(error: unknown): string {
  const kind = sourceErrorKind(error);
  return kind === null ? t.error.other : t.error[kind];
}

/** Debounce delay of the online search box, in ms. */
export const SEARCH_DEBOUNCE_MS = 400;

/** Width of a sticker placed on a page, in mm. */
export const STICKER_WIDTH_MM = 40;

/** Height of a sticker `width` mm wide with the given width over height ratio. */
export const stickerHeight = (width: number, ratio: number): number => width / ratio;

/**
 * The width over height ratio an SVG draws at: its viewBox, else its width and height attributes.
 * `undefined` when it states neither.
 */
export function svgRatio(svg: string): number | undefined {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (root === undefined) return undefined;
  const attr = (name: string): string | undefined =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(root)?.[1];
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box?.length === 4 &&
    box.every(Number.isFinite) &&
    (box[2] as number) > 0 &&
    (box[3] as number) > 0
  ) {
    return (box[2] as number) / (box[3] as number);
  }
  const w = parseFloat(attr('width') ?? '');
  const h = parseFloat(attr('height') ?? '');
  return w > 0 && h > 0 ? w / h : undefined;
}

/** The drag type of a sticker tile: a JSON `StickerRef`. */
export const STICKER_DRAG_TYPE = 'application/x-travelbook-sticker';

export const encodeStickerDrag = (ref: StickerRef): string => JSON.stringify(ref);

export function decodeStickerDrag(data: string): StickerRef | null {
  try {
    const value = JSON.parse(data) as Partial<Record<string, unknown>>;
    if (
      value['kind'] === 'hit' &&
      typeof value['source'] === 'string' &&
      typeof value['id'] === 'string'
    ) {
      return { kind: 'hit', source: value['source'], id: value['id'] };
    }
    if (value['kind'] === 'item' && typeof value['itemId'] === 'string') {
      return { kind: 'item', itemId: value['itemId'] };
    }
  } catch {
    // Not ours.
  }
  return null;
}
