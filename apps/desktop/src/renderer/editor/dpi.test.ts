import {
  addElement,
  fillSlot,
  newBook,
  newElement,
  type Book,
  type PhotoElement,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { photoResolution } from './dpi';

function bookWith(pixel: { w: number; h: number } | undefined, frameMm: { w: number; h: number }) {
  const base = newBook({ title: 'T', innerSpreads: 2 });
  const book: Book = {
    ...base,
    assets: {
      a: {
        id: 'a',
        kind: 'photo',
        file: 'originals/a.jpg',
        originalName: 'a.jpg',
        sha256: 'a',
        pixel,
      },
    },
  };
  const spread = book.spreads[0]!.id;
  const el = newElement('photo', { x: 0, y: 0, ...frameMm });
  const placed = fillSlot(addElement(book, spread, el), spread, el.id, 'a');
  return { book: placed, el: placed.spreads[0]!.elements[0] as PhotoElement };
}

describe('photoResolution', () => {
  it('rates a 800 x 600 photo in a 200 mm frame as low', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 200, h: 150 });
    expect(photoResolution(book, el)).toEqual({ dpi: 102, level: 'low' });
  });
  it('rates the same photo in a 70 mm frame as good', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 70, h: 52.5 });
    const res = photoResolution(book, el);
    expect(res?.dpi).toBeGreaterThanOrEqual(250);
    expect(res?.level).toBe('good');
  });
  it('rates between the two thresholds as acceptable', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 120, h: 90 });
    expect(photoResolution(book, el)).toEqual({ dpi: 169, level: 'ok' });
  });
  it('follows the thresholds of the book', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 200, h: 150 });
    const strict = { ...book, settings: { ...book.settings, dpiLow: 90 } };
    expect(photoResolution(strict, el)?.level).toBe('ok');
  });
  it('gets coarser when the crop zooms in', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 200, h: 150 });
    const zoomed = { ...el, crop: { scale: 2, cx: 0.5, cy: 0.5 } };
    expect(photoResolution(book, zoomed)?.dpi).toBe(51);
  });
  it('has none for an empty frame or an asset of unknown size', () => {
    const { book, el } = bookWith({ w: 800, h: 600 }, { w: 200, h: 150 });
    expect(photoResolution(book, { ...el, assetId: null })).toBeNull();
    expect(photoResolution(bookWith(undefined, { w: 10, h: 10 }).book, el)).toBeNull();
  });
});
