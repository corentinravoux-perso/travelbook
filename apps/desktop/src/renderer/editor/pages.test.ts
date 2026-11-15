import { newBook, pageCount, setBookSettings } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { dropIndex, pageNumbers, pageRuleShortfall } from './pages';

describe('pageNumbers', () => {
  const book = newBook({ title: 'T', innerSpreads: 3 });
  const of = (i: number) => pageNumbers(book, book.spreads[i]!);

  it('leaves the cover unnumbered', () => {
    expect(pageNumbers(book, book.cover)).toEqual({ left: null, right: null });
  });

  it('makes page 1 the right page of the first spread', () => {
    expect(of(0)).toEqual({ left: null, right: 1 });
  });

  it('numbers each inner spread left then right, from 2', () => {
    expect(of(1)).toEqual({ left: 2, right: 3 });
    expect(of(2)).toEqual({ left: 4, right: 5 });
    expect(of(3)).toEqual({ left: 6, right: 7 });
  });

  it('ends on the left page of the last spread, which is the page count', () => {
    expect(of(4)).toEqual({ left: 8, right: null });
    expect(of(4).left).toBe(pageCount(book));
  });
});

describe('pageRuleShortfall', () => {
  it('is null when the rule is met and reports the count when not', () => {
    expect(pageRuleShortfall(newBook({ title: 'T', innerSpreads: 11 }))).toBeNull();
    expect(pageRuleShortfall(newBook({ title: 'T', innerSpreads: 5 }))).toEqual({
      pages: 12,
      min: 24,
      multiple: 2,
    });
    const four = setBookSettings(newBook({ title: 'T', innerSpreads: 12 }), {
      pageRule: { min: 24, multiple: 4 },
    });
    expect(pageRuleShortfall(four)).toMatchObject({ pages: 26, multiple: 4 });
  });
});

describe('dropIndex (6 spreads: first, inner 1 to 4, last)', () => {
  it('drops before or after the tile it is over', () => {
    expect(dropIndex(4, 1, false, 6)).toBe(1);
    expect(dropIndex(4, 2, false, 6)).toBe(2);
    expect(dropIndex(1, 3, true, 6)).toBe(3);
    expect(dropIndex(1, 3, false, 6)).toBe(2);
  });

  it('does not move when dropped next to itself', () => {
    expect(dropIndex(2, 2, false, 6)).toBe(2);
    expect(dropIndex(2, 2, true, 6)).toBe(2);
    expect(dropIndex(2, 3, false, 6)).toBe(2);
    expect(dropIndex(2, 1, true, 6)).toBe(2);
  });

  it('keeps the first and last spreads in place', () => {
    expect(dropIndex(3, 0, true, 6)).toBe(1);
    expect(dropIndex(3, 0, false, 6)).toBe(1);
    expect(dropIndex(2, 5, false, 6)).toBe(4);
    expect(dropIndex(2, 5, true, 6)).toBe(4);
  });
});
