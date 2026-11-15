import { describe, expect, it } from 'vitest';
import type { LibraryItem, StickerHit } from '../../../shared/api';
import { fr } from '../../strings/fr';
import {
  NO_FILTERS,
  applyFilters,
  decodeStickerDrag,
  encodeStickerDrag,
  licenceMark,
  sourceMessage,
  svgRatio,
  tileOfHit,
  tileOfItem,
} from './model';

const licence = (name: string, requiresAttribution: boolean) => ({
  source: 'S',
  licence: name,
  url: 'https://x.org',
  requiresAttribution,
});

const hit = (over: Partial<StickerHit> = {}): StickerHit => ({
  source: 'noto',
  id: 'airplane',
  title: 'Avion',
  thumbUrl: 'tb://sticker/noto/airplane.svg',
  fileUrl: 'tb://sticker/noto/airplane.svg',
  format: 'svg',
  licence: licence('Apache-2.0', false),
  mono: false,
  ...over,
});

describe('licenceMark', () => {
  it.each([
    ['CC0-1.0', 'CC0'],
    ['CC-BY-4.0', 'CC BY'],
    ['CC-BY-SA-3.0', 'CC BY-SA'],
    ['PDM-1.0', 'PD'],
    ['PD', 'PD'],
    ['Apache-2.0', 'Apache'],
    ['MIT', 'MIT'],
  ])('%s is marked %s', (spdx, mark) => {
    expect(licenceMark(spdx)).toBe(mark);
  });
});

describe('tiles', () => {
  it('a hit tile shows its thumbnail address and knows it is a raster or not', () => {
    expect(tileOfHit(hit())).toMatchObject({
      key: 'hit:noto:airplane',
      src: 'tb://sticker/noto/airplane.svg',
      raster: false,
      ref: { kind: 'hit', source: 'noto', id: 'airplane' },
    });
    expect(tileOfHit(hit({ format: 'png' })).raster).toBe(true);
  });

  it('a library tile is shown through tb://library and keeps its favourite flag and monochrome tag', () => {
    const item: LibraryItem = {
      id: 'sticker-abc',
      kind: 'sticker',
      file: 'files/sticker-abc.png',
      title: 'Logo',
      tags: ['monochrome'],
      addedAt: '2026-01-01T00:00:00.000Z',
      favourite: true,
    };
    expect(tileOfItem(item)).toMatchObject({
      src: 'tb://library/sticker-abc',
      mono: true,
      raster: true,
      favourite: true,
      ref: { kind: 'item', itemId: 'sticker-abc' },
    });
  });
});

describe('applyFilters', () => {
  const tiles = [
    tileOfHit(hit({ id: 'a', mono: false, licence: licence('MIT', false) })),
    tileOfHit(hit({ id: 'b', mono: true, licence: licence('CC-BY-4.0', true) })),
    tileOfHit(hit({ id: 'c', mono: true, licence: licence('CC0-1.0', false) })),
  ];
  it('keeps everything by default', () => {
    expect(applyFilters(tiles, NO_FILTERS)).toHaveLength(3);
  });
  it('filters on colour or monochrome', () => {
    expect(applyFilters(tiles, { ...NO_FILTERS, mono: 'mono' }).map((t) => t.key)).toEqual([
      'hit:noto:b',
      'hit:noto:c',
    ]);
    expect(applyFilters(tiles, { ...NO_FILTERS, mono: 'colour' })).toHaveLength(1);
  });
  it('"sans attribution" drops the licences that ask for a credit', () => {
    expect(applyFilters(tiles, { ...NO_FILTERS, noAttribution: true }).map((t) => t.key)).toEqual([
      'hit:noto:a',
      'hit:noto:c',
    ]);
  });
});

describe('sourceMessage', () => {
  it.each([
    ['SourceError:offline', fr.stickers.error.offline],
    ['SourceError:rateLimited', fr.stickers.error.rateLimited],
    ['SourceError:badAnswer', fr.stickers.error.badAnswer],
    ['SourceError:tooLarge', fr.stickers.error.tooLarge],
    ['SourceError:notFound', fr.stickers.error.notFound],
  ])('maps %s to its French message', (message, french) => {
    // Electron wraps the message: "Error invoking remote method 'x': Error: SourceError:offline".
    expect(
      sourceMessage(new Error(`Error invoking remote method 'stickers:search': Error: ${message}`)),
    ).toBe(french);
  });
  it('gives the general message for anything else', () => {
    expect(sourceMessage(new Error('boom'))).toBe(fr.stickers.error.other);
    expect(sourceMessage('x')).toBe(fr.stickers.error.other);
  });
});

describe('svgRatio', () => {
  it('reads the viewBox, then width and height', () => {
    expect(svgRatio('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"/>')).toBe(2);
    expect(svgRatio('<svg viewBox="0,0,50,100" width="1" height="1"></svg>')).toBe(0.5);
    expect(svgRatio('<svg width="30mm" height="10mm"/>')).toBe(3);
  });
  it('is undefined without any size or for text that is no SVG', () => {
    expect(svgRatio('<svg/>')).toBeUndefined();
    expect(svgRatio('<svg viewBox="0 0 0 10"/>')).toBeUndefined();
    expect(svgRatio('hello')).toBeUndefined();
  });
});

describe('sticker drag payload', () => {
  it('round-trips a hit and an item', () => {
    for (const ref of [
      { kind: 'hit', source: 'noto', id: 'a' },
      { kind: 'item', itemId: 'sticker-1' },
    ] as const) {
      expect(decodeStickerDrag(encodeStickerDrag(ref))).toEqual(ref);
    }
  });
  it.each(['', 'nope', '{"kind":"hit"}', '{"kind":"item","itemId":3}', '[]', 'null'])(
    'refuses %j',
    (data) => {
      expect(decodeStickerDrag(data)).toBeNull();
    },
  );
});
