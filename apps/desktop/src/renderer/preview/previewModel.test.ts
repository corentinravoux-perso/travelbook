import { newBook } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { clickDirection, pagesLabel, previewPages, turn } from './previewModel';

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
