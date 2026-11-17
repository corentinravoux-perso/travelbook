import { describe, expect, it } from 'vitest';
import type { AssetRef, Book, PhotoElement } from '../schema';
import { OpError } from './errors';
import { mapElement } from '../map/test-helpers';
import {
  assetUsage,
  elementAssetIds,
  fillSlot,
  removePhotos,
  setCrop,
  swapPhotos,
  unusedAssets,
} from './photos';
import { freshBook, inner, photo, shape, useCounterIds } from './test-helpers';

useCounterIds();

const asset = (id: string, kind: AssetRef['kind'] = 'photo'): AssetRef => ({
  id,
  kind,
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
});

/** Inner spread 1 with photos p1 (asset a1, zoomed crop), p2 (empty slot) and a shape. */
function setup(): { book: Book; s1: string; s2: string } {
  const book = freshBook(2);
  const s1 = inner(book, 0);
  const s2 = inner(book, 1);
  const p1 = photo('p1', 0, 0, 100, 100, 'a1');
  p1.crop = { scale: 2, cx: 0.2, cy: 0.8 };
  p1.adjust.brightness = 1.2;
  p1.border = { width: 1, color: '#000' };
  p1.mask = { kind: 'ellipse' };
  s1.elements.push(p1, photo('p2', 120, 0, 80, 80), shape('sh', 0, 200, 10, 10));
  const q1 = photo('q1', 0, 0, 50, 50, 'a2');
  q1.crop = { scale: 3, cx: 0.9, cy: 0.1 };
  s2.elements.push(q1);
  book.assets = { a1: asset('a1'), a2: asset('a2'), a3: asset('a3') };
  return { book, s1: s1.id, s2: s2.id };
}

const get = (book: Book, sid: string, id: string): PhotoElement =>
  [book.cover, ...book.spreads]
    .find((s) => s.id === sid)!
    .elements.find((e) => e.id === id) as PhotoElement;

const NEUTRAL = { scale: 1, cx: 0.5, cy: 0.5 };

describe('fillSlot', () => {
  it('sets the asset and resets the crop, keeping the rest of the frame', () => {
    const { book, s1 } = setup();
    const out = fillSlot(book, s1, 'p1', 'a3');
    expect(get(out, s1, 'p1')).toMatchObject({
      assetId: 'a3',
      crop: NEUTRAL,
      mask: { kind: 'ellipse' },
      border: { width: 1, color: '#000' },
      adjust: { brightness: 1.2 },
      x: 0,
      w: 100,
    });
  });

  it('fills an empty slot', () => {
    const { book, s1 } = setup();
    expect(get(fillSlot(book, s1, 'p2', 'a3'), s1, 'p2').assetId).toBe('a3');
  });

  it('throws OpError for an unknown spread or element, and for a non-photo element', () => {
    const { book, s1 } = setup();
    expect(() => fillSlot(book, 'nope', 'p1', 'a1')).toThrow(OpError);
    expect(() => fillSlot(book, s1, 'zz', 'a1')).toThrow(OpError);
    expect(() => fillSlot(book, s1, 'sh', 'a1')).toThrow(OpError);
  });
});

describe('swapPhotos', () => {
  it('exchanges assetId within a spread and resets both crops', () => {
    const { book, s1 } = setup();
    const out = swapPhotos(
      book,
      { spreadId: s1, elementId: 'p1' },
      { spreadId: s1, elementId: 'p2' },
    );
    expect(get(out, s1, 'p1')).toMatchObject({ assetId: null, crop: NEUTRAL, w: 100 });
    expect(get(out, s1, 'p2')).toMatchObject({ assetId: 'a1', crop: NEUTRAL, w: 80 });
  });

  it('works across two spreads', () => {
    const { book, s1, s2 } = setup();
    const out = swapPhotos(
      book,
      { spreadId: s1, elementId: 'p1' },
      { spreadId: s2, elementId: 'q1' },
    );
    expect(get(out, s1, 'p1')).toMatchObject({ assetId: 'a2', crop: NEUTRAL });
    expect(get(out, s2, 'q1')).toMatchObject({ assetId: 'a1', crop: NEUTRAL });
    expect(get(out, s1, 'p1').adjust.brightness).toBe(1.2);
  });

  it('throws OpError on an unknown reference or a non-photo element', () => {
    const { book, s1 } = setup();
    const a = { spreadId: s1, elementId: 'p1' };
    expect(() => swapPhotos(book, a, { spreadId: s1, elementId: 'zz' })).toThrow(OpError);
    expect(() => swapPhotos(book, a, { spreadId: 'nope', elementId: 'p2' })).toThrow(OpError);
    expect(() => swapPhotos(book, a, { spreadId: s1, elementId: 'sh' })).toThrow(OpError);
  });
});

describe('setCrop', () => {
  it('stores a copy of the crop', () => {
    const { book, s1 } = setup();
    const crop = { scale: 1.5, cx: 0.3, cy: 0.6 };
    const out = setCrop(book, s1, 'p2', crop);
    expect(get(out, s1, 'p2').crop).toEqual(crop);
    expect(get(out, s1, 'p2').crop).not.toBe(crop);
    expect(Object.isFrozen(crop)).toBe(false);
  });

  it('throws OpError on a crop the schema would reject', () => {
    const { book, s1 } = setup();
    expect(() => setCrop(book, s1, 'p1', { scale: 0.9, cx: 0.5, cy: 0.5 })).toThrow(OpError);
    expect(() => setCrop(book, s1, 'p1', { scale: 1, cx: 1.1, cy: 0.5 })).toThrow(OpError);
    expect(() => setCrop(book, s1, 'p1', { scale: 1, cx: 0.5, cy: -0.1 })).toThrow(OpError);
    expect(() => setCrop(book, s1, 'p1', { scale: Number.NaN, cx: 0.5, cy: 0.5 })).toThrow(OpError);
  });

  it('throws OpError on an unknown element or a non-photo element', () => {
    const { book, s1 } = setup();
    expect(() => setCrop(book, s1, 'zz', NEUTRAL)).toThrow(OpError);
    expect(() => setCrop(book, s1, 'sh', NEUTRAL)).toThrow(OpError);
  });
});

describe('assetUsage / unusedAssets', () => {
  it('counts a photo placed twice as 2 and lists the unplaced asset as unused', () => {
    const { book, s1, s2 } = setup();
    const twice = fillSlot(fillSlot(book, s1, 'p2', 'a1'), s2, 'q1', 'a1');
    expect(assetUsage(twice)).toEqual({ a1: 3 });
    expect(unusedAssets(twice)).toEqual(['a2', 'a3']);
    expect(assetUsage(book)).toEqual({ a1: 1, a2: 1 });
    expect(unusedAssets(book)).toEqual(['a3']);
  });

  it('counts photos on the cover, stickers and image or pattern backgrounds', () => {
    const { book } = setup();
    book.assets.st = asset('st', 'sticker');
    book.assets.bg = asset('bg', 'background');
    book.assets.pat = asset('pat', 'pattern');
    book.assets.f = asset('f', 'font');
    book.cover.elements.push(photo('c1', 0, 0, 10, 10, 'a3'), {
      id: 'stk',
      type: 'sticker',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      assetId: 'st',
      flipH: false,
      flipV: false,
      tint: null,
    });
    book.spreads[1]!.background = {
      left: { kind: 'image', assetId: 'bg', fit: 'cover', opacity: 1, blur: 0, tint: null },
      right: { kind: 'pattern', assetId: 'pat', fg: '#000', bg: '#fff', scale: 1 },
      spread: { kind: 'color', color: '#fff' },
    };
    book.spreads[2]!.background = {
      spread: { kind: 'image', assetId: 'a1', fit: 'cover', opacity: 1, blur: 0, tint: null },
    };
    expect(assetUsage(book)).toEqual({ a1: 2, a2: 1, a3: 1, st: 1, bg: 1, pat: 1 });
    // a font is never "placed", so it is not reported as unused
    expect(unusedAssets(book)).toEqual([]);
  });

  it('ignores empty slots and an empty sticker asset id', () => {
    const book = freshBook(1);
    inner(book).elements.push(photo('e', 0, 0, 10, 10, null));
    expect(assetUsage(book)).toEqual({});
  });
});

describe('assets of a map element', () => {
  /** A map whose second place carries the medallion photo `photo-1`, as `mapElement()` builds it. */
  const mapWith = (id: string) => ({ ...mapElement(), id });

  it('lists the geometry, then the photo of each place that has one', () => {
    const map = mapElement();
    map.places[0]!.photo = { ...map.places[1]!.photo!, assetId: 'photo-0' };
    expect(elementAssetIds(map)).toEqual(['map-0123456789abcdef', 'photo-0', 'photo-1']);
  });

  it('lists only the geometry for a map with no photo, and nothing for a shape', () => {
    const map = mapElement();
    map.places[1]!.photo = null;
    expect(elementAssetIds(map)).toEqual(['map-0123456789abcdef']);
    expect(elementAssetIds(shape('sh', 0, 0, 1, 1))).toEqual([]);
  });

  it('counts the geometry and the medallion photos as placements', () => {
    const book = freshBook(2);
    book.assets = {
      'map-0123456789abcdef': asset('map-0123456789abcdef', 'map'),
      'photo-1': asset('photo-1'),
      a1: asset('a1'),
    };
    inner(book, 0).elements.push(mapWith('m1'), photo('p1', 0, 0, 10, 10, 'a1'));
    book.cover.elements.push(mapWith('m2'));
    expect(assetUsage(book)).toEqual({ 'map-0123456789abcdef': 2, 'photo-1': 2, a1: 1 });
  });

  it('counts a medallion photo even while the medallions are off, so it is never "unused"', () => {
    const book = freshBook(1);
    book.assets = {
      'map-0123456789abcdef': asset('map-0123456789abcdef', 'map'),
      'photo-1': asset('photo-1'),
      spare: asset('spare'),
    };
    const map = mapWith('m1');
    map.medallions = false;
    inner(book).elements.push(map);
    expect(unusedAssets(book)).toEqual(['spare']);
  });

  it('lists the geometry of a map that was deleted as unused', () => {
    const book = freshBook(1);
    book.assets = { 'map-0123456789abcdef': asset('map-0123456789abcdef', 'map') };
    expect(unusedAssets(book)).toEqual(['map-0123456789abcdef']);
  });
});

describe('removePhotos', () => {
  it('drops the assets and empties every frame that showed them, keeping the frame', () => {
    const { book, s1, s2 } = setup();
    const next = removePhotos(book, ['a1', 'a3']);
    expect(Object.keys(next.assets).sort()).toEqual(['a2']);
    const p1 = get(next, s1, 'p1');
    expect(p1.assetId).toBeNull();
    expect(p1.crop).toEqual(NEUTRAL);
    // The look of the frame stays: a new photo dropped in gets it.
    expect(p1.mask).toEqual({ kind: 'ellipse' });
    expect(p1.border).toEqual({ width: 1, color: '#000' });
    expect(get(next, s2, 'q1').assetId).toBe('a2');
    expect(book.assets['a1']).toBeDefined();
  });

  it('empties frames on the cover too', () => {
    const { book } = setup();
    book.cover.elements.push(photo('c1', 0, 0, 10, 10, 'a2'));
    const next = removePhotos(book, ['a2']);
    expect((next.cover.elements[0] as PhotoElement).assetId).toBeNull();
  });

  it('leaves assets that are not photos, and unknown ids, alone', () => {
    const { book } = setup();
    book.assets['st'] = asset('st', 'sticker');
    expect(removePhotos(book, ['st', 'nope'])).toBe(book);
  });
});
