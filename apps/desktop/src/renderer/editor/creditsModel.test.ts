import { newBook, newElement, type AssetRef, type Book } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { describe, expect, it } from 'vitest';
import {
  creditEntries,
  creditLine,
  creditsRect,
  creditsTextElement,
  usedAssetIds,
} from './creditsModel';

const licence = (author: string | undefined, spdx = 'CC-BY-4.0') => ({
  source: 'Openverse',
  ...(author ? { author } : {}),
  licence: spdx,
  url: 'https://example.org/p',
  requiresAttribution: spdx.startsWith('CC-BY'),
});

const asset = (
  id: string,
  kind: AssetRef['kind'],
  name: string,
  lic?: AssetRef['licence'],
): AssetRef => ({
  id,
  kind,
  file: `assets/${id}.png`,
  originalName: name,
  sha256: id,
  ...(lic ? { licence: lic } : {}),
});

function bookWith(): Book {
  const book = newBook({ title: 'T', innerSpreads: 2 });
  const assets = [
    asset('s1', 'sticker', 'Avion.png', licence('Ada')),
    asset('s2', 'sticker', 'Mine.png'),
    asset('p1', 'photo', 'IMG_1.jpg'),
    asset('p2', 'photo', 'Ciel.jpg', licence('Bob', 'CC0-1.0')),
    asset('b1', 'background', 'Mer.jpg', licence('Cy')),
    asset('unused', 'sticker', 'Zèbre.png', licence('Zed')),
  ];
  book.assets = Object.fromEntries(assets.map((a) => [a.id, a]));
  const place = (assetId: string, type: 'sticker' | 'photo') => ({
    ...newElement(type, { x: 0, y: 0, w: 10, h: 10 }),
    assetId,
  });
  book.spreads[1]!.elements = [
    place('s1', 'sticker'),
    place('s2', 'sticker'),
    place('p1', 'photo'),
    place('p2', 'photo'),
  ] as never;
  book.spreads[1]!.background = {
    spread: { kind: 'image', assetId: 'b1', fit: 'cover', opacity: 1, blur: 0, tint: null },
  };
  return book;
}

describe('credits', () => {
  it('counts the assets on elements and in backgrounds, and no other', () => {
    expect([...usedAssetIds(bookWith())].sort()).toEqual(['b1', 'p1', 'p2', 's1', 's2']);
  });

  it('lists used assets; photos only with licence data; unused ones never', () => {
    const entries = creditEntries(bookWith());
    expect(entries.map((e) => e.title)).toEqual(['Avion', 'Ciel', 'Mer', 'Mine']);
    expect(entries.map((e) => e.assetId)).not.toContain('unused');
    expect(entries.map((e) => e.assetId)).not.toContain('p1');
  });

  it("lists the user's own sticker, which has no licence, as a personal file", () => {
    const own = creditEntries(bookWith()).find((e) => e.assetId === 's2')!;
    expect(own.licence).toBeUndefined();
    expect(creditLine(own)).toBe('Mine, fichier personnel');
  });

  it('lists one line for the same work used twice', () => {
    const book = bookWith();
    book.assets['s1b'] = { ...book.assets['s1']!, id: 's1b' };
    book.spreads[1]!.elements.push({
      ...newElement('sticker', { x: 0, y: 0, w: 5, h: 5 }),
      assetId: 's1b',
    } as never);
    expect(creditEntries(book).filter((e) => e.title === 'Avion')).toHaveLength(1);
  });

  it('writes a line in French with the author when known', () => {
    const [first] = creditEntries(bookWith());
    expect(creditLine(first!)).toBe('Avion, Ada, CC-BY-4.0 (Openverse)');
    const anonymous = { ...first! };
    delete anonymous.author;
    expect(creditLine(anonymous)).toBe('Avion, CC-BY-4.0 (Openverse)');
  });

  it('builds a text element: a heading then one paragraph per entry', () => {
    const entries = creditEntries(bookWith());
    const el = creditsTextElement(entries, { x: 1, y: 2, w: 50, h: 20 });
    const doc = el.doc as { content: { content: { text: string }[] }[] };
    expect(doc.content).toHaveLength(1 + entries.length);
    expect(doc.content[0]!.content[0]!.text).toBe('Crédits des images');
    expect(doc.content[1]!.content[0]!.text).toBe(creditLine(entries[0]!));
    expect(el).toMatchObject({ type: 'text', x: 1, y: 2, w: 50 });
  });

  it('puts the block along the bottom of the page, inside it', () => {
    const book = bookWith();
    const rect = creditsRect(book, book.spreads[1]!, 3);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.y + rect.h).toBeLessThanOrEqual(book.format.height);
    expect(rect.y).toBeGreaterThanOrEqual(0);
  });
});

describe('credits of maps', () => {
  const ODBL = {
    source: '© OpenStreetMap contributors, Overture Maps Foundation',
    licence: 'ODbL 1.0',
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    requiresAttribution: true,
  };
  const geometry = (id: string, name: string): AssetRef => ({
    id,
    kind: 'map',
    file: `assets/${id}.json`,
    originalName: name,
    sha256: id,
    licence: ODBL,
  });

  /** Thailand on the cover and Peru on an inner spread, each with its own geometry asset. */
  function bookWithMaps(): Book {
    const book = newBook({ title: 'T', innerSpreads: 2 });
    book.assets = {
      'map-th': geometry('map-th', 'Thaïlande.json'),
      'map-pe': geometry('map-pe', 'Pérou.json'),
      'photo-1': asset('photo-1', 'photo', 'Phuket.jpg', licence('Dan', 'CC0-1.0')),
      'photo-2': asset('photo-2', 'photo', 'Mine.jpg'),
    };
    const th = { ...mapElement(), id: 'm-th', geometryAssetId: 'map-th' };
    const pe = { ...mapElement(), id: 'm-pe', geometryAssetId: 'map-pe' };
    pe.places = pe.places.map((p) => ({ ...p, photo: null }));
    book.cover.elements = [th];
    book.spreads[1]!.elements = [pe];
    return book;
  }

  it('counts the geometry and the medallion photos of a map', () => {
    expect([...usedAssetIds(bookWithMaps())].sort()).toEqual(['map-pe', 'map-th', 'photo-1']);
  });

  it('lists the ODbL entry once for two maps of different places', () => {
    const entries = creditEntries(bookWithMaps());
    const maps = entries.filter((e) => e.licence === 'ODbL 1.0');
    expect(maps).toHaveLength(1);
    expect(creditLine(maps[0]!)).toBe(
      'Cartes, ODbL 1.0 (© OpenStreetMap contributors, Overture Maps Foundation)',
    );
    expect(maps[0]!.requiresAttribution).toBe(true);
  });

  it('leaves out a geometry that carries no licence data', () => {
    const book = bookWithMaps();
    delete book.assets['map-th']!.licence;
    delete book.assets['map-pe']!.licence;
    expect(creditEntries(book).map((e) => e.title)).toEqual(['Phuket']);
  });

  it('lists a medallion photo only when it carries a licence', () => {
    const entries = creditEntries(bookWithMaps());
    expect(entries.map((e) => e.title).sort()).toEqual(['Cartes', 'Phuket']);
    const book = bookWithMaps();
    book.cover.elements = [];
    book.spreads[1]!.elements = [];
    expect(creditEntries(book)).toEqual([]);
  });
});
