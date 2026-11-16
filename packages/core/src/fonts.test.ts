import { describe, expect, it } from 'vitest';
import { newBook, newElement } from './factory';
import { mapElement } from './map/test-helpers';
import {
  firstFontFamily,
  fontFaceName,
  fontFaceOfAsset,
  fontFamiliesUsed,
  parseFontFaceName,
} from './fonts';

describe('firstFontFamily', () => {
  it.each([
    ["'Playfair Display', serif", 'Playfair Display'],
    ['"Inter", sans-serif', 'Inter'],
    ['Lora', 'Lora'],
    ['  Caveat ,cursive', 'Caveat'],
    ['', ''],
  ])('%s gives %s', (css, family) => {
    expect(firstFontFamily(css)).toBe(family);
  });
});

describe('fontFamiliesUsed', () => {
  it('collects the base family and the families set by marks, once each, sorted', () => {
    const book = newBook({ title: 'T', innerSpreads: 2 });
    const a = newElement('text', { x: 0, y: 0, w: 10, h: 10 });
    a.style.fontFamily = "'Lora', serif";
    a.doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'a',
              marks: [{ type: 'textStyle', attrs: { fontFamily: "'Caveat', cursive" } }],
            },
            {
              type: 'text',
              text: 'b',
              marks: [
                { type: 'bold' },
                { type: 'textStyle', attrs: { fontFamily: "'Lora', serif" } },
              ],
            },
          ],
        },
      ],
    };
    const b = newElement('text', { x: 0, y: 0, w: 10, h: 10 });
    b.style.fontFamily = "'Anton', sans-serif";
    book.spreads[1]!.elements = [a, b];
    book.cover.elements = [{ ...a, id: 'c' }];
    expect(fontFamiliesUsed(book)).toEqual(['Anton', 'Caveat', 'Lora']);
  });

  it('ignores photos and tolerates a document that is not a tree', () => {
    const book = newBook({ title: 'T', innerSpreads: 2 });
    const t = newElement('text', { x: 0, y: 0, w: 10, h: 10 });
    t.doc = 'nope';
    book.spreads[1]!.elements = [newElement('photo', { x: 0, y: 0, w: 5, h: 5 }), t];
    expect(fontFamiliesUsed(book)).toEqual([firstFontFamily(t.style.fontFamily)].filter(Boolean));
  });
});

describe('fontFamiliesUsed on a map', () => {
  it('collects the label and the badge fonts of its style', () => {
    const book = newBook({ title: 'T', innerSpreads: 2 });
    const map = mapElement();
    map.style.label.font = "'Lora', serif";
    map.style.badge.font = 'Caveat';
    book.spreads[1]!.elements = [map];
    expect(fontFamiliesUsed(book)).toEqual(['Caveat', 'Lora']);
  });
});

describe('font face names', () => {
  it('round-trips, with or without a file extension', () => {
    const face = { family: 'Source Serif 4', weight: 700, style: 'italic' } as const;
    expect(fontFaceName(face)).toBe('Source Serif 4|700|italic');
    expect(parseFontFaceName('Source Serif 4|700|italic')).toEqual(face);
    expect(parseFontFaceName('Source Serif 4|700|italic.woff2')).toEqual(face);
  });

  it.each(['Lora', 'Lora|bold|normal', 'Lora|700|oblique', '|700|normal', 'Lora|7000|normal'])(
    'refuses %j',
    (name) => {
      expect(parseFontFaceName(name)).toBeNull();
    },
  );

  it('reads the face of a font asset only', () => {
    const asset = {
      id: 'f',
      file: 'assets/f.woff2',
      sha256: 'f',
      originalName: 'Lora|400|normal.woff2',
    };
    expect(fontFaceOfAsset({ ...asset, kind: 'font' })).toEqual({
      family: 'Lora',
      weight: 400,
      style: 'normal',
    });
    expect(fontFaceOfAsset({ ...asset, kind: 'sticker' })).toBeNull();
  });
});
