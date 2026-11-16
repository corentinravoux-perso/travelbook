import { newBook } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { clickDirection, cutZones, pagesLabel, previewPages, turn } from './previewModel';

describe('preview model', () => {
  const book = newBook({ title: 'T' });

  it('lists the cover first, then the spreads', () => {
    const pages = previewPages(book);
    expect(pages[0]).toBe(book.cover);
    expect(pages).toHaveLength(book.spreads.length + 1);
  });

  it('turns within the first and the last page', () => {
    expect(turn(0, -1, 5)).toBe(0);
    expect(turn(4, 1, 5)).toBe(4);
    expect(turn(2, 1, 5)).toBe(3);
    expect(turn(2, -1, 5)).toBe(1);
    expect(turn(0, 1, 0)).toBe(0);
  });

  it('names the cover, a single page and a pair of pages', () => {
    expect(pagesLabel(book, book.cover)).toBe('Couverture');
    expect(pagesLabel(book, book.spreads[0]!)).toBe('Page 1');
    expect(pagesLabel(book, book.spreads[1]!)).toBe('Pages 2–3');
    const last = book.spreads[book.spreads.length - 1]!;
    expect(pagesLabel(book, last)).toBe(`Page ${2 * (book.spreads.length - 1)}`);
  });

  it('goes back on the left half of the stage and on on the right', () => {
    expect(clickDirection(10, 100)).toBe(-1);
    expect(clickDirection(100, 100)).toBe(1);
    expect(clickDirection(190, 100)).toBe(1);
  });
});

describe('cutZones', () => {
  const base = { ...newBook({ title: 'T' }), coverBleed: 5, bleed: 3 };
  const W = base.format.width;
  const H = base.format.height;

  it('draws a cover with its bleed all round, hatches outside the trim, dashes the spine edges', () => {
    const book = { ...base, spineWidth: 12 };
    const z = cutZones(book, book.cover);
    expect(z.box).toEqual({ x: -5, y: -5, w: 2 * W + 12 + 10, h: H + 10 });
    expect(z.veils).toEqual([{ outer: z.box, inner: { x: 0, y: 0, w: 2 * W + 12, h: H } }]);
    expect(z.folds).toEqual([W, W + 12]);
    expect(z.spine).toEqual({ x: W, y: 0, w: 12, h: H });
    expect(z.bleed).toBe(5);
  });

  it('has a single fold and no spine band on a cover without spine', () => {
    const book = { ...base, spineWidth: 0 };
    const z = cutZones(book, book.cover);
    expect(z.folds).toEqual([W]);
    expect(z.spine).toBeNull();
  });

  it('grows only the outer edges of the pages of a spread; the gutter is a fold', () => {
    const inner = base.spreads[1]!;
    const z = cutZones(base, inner);
    expect(z.veils.map((v) => v.outer)).toEqual([
      { x: -3, y: -3, w: W + 3, h: H + 6 },
      { x: W, y: -3, w: W + 3, h: H + 6 },
    ]);
    expect(z.box).toEqual({ x: -3, y: -3, w: 2 * W + 6, h: H + 6 });
    expect(z.folds).toEqual([W]);
  });

  it('covers only the page there is on the first spread, with no fold', () => {
    const z = cutZones(base, base.spreads[0]!);
    expect(z.veils).toHaveLength(1);
    expect(z.box).toEqual({ x: W, y: -3, w: W + 3, h: H + 6 });
    expect(z.folds).toEqual([]);
  });
});
