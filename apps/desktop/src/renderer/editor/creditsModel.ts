import {
  MAP_LICENCE,
  elementAssetIds,
  newElement,
  pageBox,
  spreadSize,
  type AssetRef,
  type Book,
  type Rect,
  type Spread,
  type TextElement,
} from '@travelbook/core';
import { fr } from '../strings/fr';

export interface CreditEntry {
  assetId: string;
  /** What the credit names: the file name without its extension. */
  title: string;
  author?: string;
  /** Absent for a file of the user's own (a sticker or background they imported). */
  licence?: string;
  source?: string;
  url?: string;
  requiresAttribution: boolean;
}

/**
 * The ids of the assets the book draws: on an element (a map's geometry and medallion photos
 * included), or as a background.
 */
export function usedAssetIds(book: Book): Set<string> {
  const used = new Set<string>();
  for (const spread of [book.cover, ...book.spreads]) {
    for (const el of spread.elements) for (const id of elementAssetIds(el)) used.add(id);
    for (const bg of Object.values(spread.background)) {
      if (bg && (bg.kind === 'image' || bg.kind === 'pattern')) used.add(bg.assetId);
    }
  }
  return used;
}

/** A map's geometry is credited as "Cartes" whichever places the album maps: one entry for all. */
const titleOf = (asset: AssetRef): string =>
  asset.kind === 'map'
    ? fr.credits.mapTitle
    : asset.originalName.replace(/\.[A-Za-z0-9]{1,5}$/, '');

/** GeoNames (CC BY 4.0) names the cities of countries Natural Earth covers thinly: credited once. */
const GEONAMES_ENTRY: CreditEntry = {
  assetId: 'geonames',
  title: 'GeoNames',
  licence: 'CC BY 4.0',
  source: 'https://www.geonames.org/',
  url: 'https://www.geonames.org/',
  requiresAttribution: true,
};

/** Whether a map of the album (cover included) has a place taken from GeoNames (`ref` `gn:…`). */
function usesGeoNames(book: Book): boolean {
  return [book.cover, ...book.spreads].some((spread) =>
    spread.elements.some(
      (el) =>
        el.type === 'map' &&
        el.places.some((p) => p.source.kind !== 'custom' && p.source.ref.startsWith('gn:')),
    ),
  );
}

/**
 * The licences of every asset the book uses. Photos are left out unless they carry licence data
 * (a photo of the user's own has none); any other asset is listed, as the user's own file when it
 * has no licence. A map geometry always comes from Overture and OpenStreetMap, so one saved
 * without licence data is credited with `MAP_LICENCE`: the attribution is owed all the same. Two
 * assets with the same title, author, licence and source page are listed once (so the geometries
 * of all the album's maps make one ODbL entry); the list is ordered by title.
 */
export function creditEntries(book: Book): CreditEntry[] {
  const used = usedAssetIds(book);
  const seen = new Set<string>();
  const entries: CreditEntry[] = [];
  for (const id of used) {
    const asset = book.assets[id];
    if (asset === undefined) continue;
    const licence = asset.licence ?? (asset.kind === 'map' ? MAP_LICENCE : undefined);
    if (licence === undefined && asset.kind === 'photo') continue;
    const key = [
      licence?.author ?? '',
      licence?.licence ?? '',
      licence?.source ?? '',
      licence?.url ?? '',
      titleOf(asset),
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      assetId: id,
      title: titleOf(asset),
      ...(licence?.author ? { author: licence.author } : {}),
      ...(licence ? { licence: licence.licence, source: licence.source, url: licence.url } : {}),
      requiresAttribution: licence?.requiresAttribution ?? false,
    });
  }
  if (usesGeoNames(book)) entries.push(GEONAMES_ENTRY);
  return entries.sort(
    (a, b) => a.title.localeCompare(b.title, 'fr') || a.assetId.localeCompare(b.assetId),
  );
}

/** One line of the credits, as it is read in the dialog and printed in the book. */
export const creditLine = (entry: CreditEntry): string =>
  entry.licence === undefined || entry.source === undefined
    ? fr.credits.ownEntry(entry.title)
    : fr.credits.entry(entry.title, entry.author, entry.licence, entry.source);

/** A text element of `rect` carrying the credits: a heading, then one paragraph per entry. */
export function creditsTextElement(entries: readonly CreditEntry[], rect: Rect): TextElement {
  const el = newElement('text', rect);
  el.style = {
    fontFamily: "'Inter', sans-serif",
    fontSizePt: 7,
    color: '#222222',
    lineHeight: 1.3,
    letterSpacing: 0,
  };
  el.align = 'left';
  el.doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: fr.credits.heading, marks: [{ type: 'bold' }] }],
      },
      ...entries.map((entry) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: creditLine(entry) }],
      })),
    ],
  };
  return el;
}

/** Margin kept around the credits block, in mm. */
const MARGIN_MM = 10;
/** Height of a heading and of each line of the credits block, in mm (7 pt text at 1.3). */
const LINE_MM = 4.2;

/**
 * Where the credits go on `spread`: along the bottom of the right page (else the left one, else
 * the spread), `MARGIN_MM` from its edges, tall enough for a line per entry.
 */
export function creditsRect(book: Book, spread: Spread, lines: number): Rect {
  const page = pageBox(book, spread, 'right') ??
    pageBox(book, spread, 'left') ?? { x: 0, y: 0, ...spreadSize(book, spread) };
  const w = Math.max(10, page.w - 2 * MARGIN_MM);
  // A long line wraps: leave room for about two lines per entry.
  const h = Math.min(page.h - 2 * MARGIN_MM, (1 + lines * 2) * LINE_MM);
  return {
    x: page.x + MARGIN_MM,
    y: page.y + page.h - MARGIN_MM - h,
    w,
    h: Math.max(h, LINE_MM * 3),
  };
}
