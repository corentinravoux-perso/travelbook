import { describe, expect, it } from 'vitest';
import { newElement } from '../factory';
import type { Book, Spread } from '../schema';
import { groupElements } from './elements';
import { OpError } from './errors';
import {
  addSpread,
  deleteSpread,
  duplicateSpread,
  moveSpread,
  setFormat,
  swapPages,
} from './spreads';
import { freshBook, inner, photo, shape, useCounterIds } from './test-helpers';

useCounterIds();

const kinds = (book: Book): string[] => book.spreads.map((s) => s.kind);
const ids = (book: Book): string[] => book.spreads.map((s) => s.id);

describe('addSpread', () => {
  it('inserts an empty inner spread after the given one', () => {
    const book = freshBook(2);
    const [first, i1, i2, last] = ids(book) as [string, string, string, string];
    const out = addSpread(book, i1);
    expect(kinds(out)).toEqual(['first', 'inner', 'inner', 'inner', 'last']);
    expect(ids(out).filter((id) => ![first, i1, i2, last].includes(id))).toHaveLength(1);
    expect(out.spreads[2]).toMatchObject({ kind: 'inner', background: {}, elements: [] });
    expect(ids(out)[1]).toBe(i1);
    expect(ids(out)[3]).toBe(i2);
  });

  it('can add right after the first spread', () => {
    const book = freshBook(1);
    const out = addSpread(book, book.spreads[0]!.id);
    expect(kinds(out)).toEqual(['first', 'inner', 'inner', 'last']);
  });

  it('throws OpError after the last spread, after the cover, or after an unknown id', () => {
    const book = freshBook(2);
    expect(() => addSpread(book, book.spreads.at(-1)!.id)).toThrow(OpError);
    expect(() => addSpread(book, book.cover.id)).toThrow(OpError);
    expect(() => addSpread(book, 'nope')).toThrow(OpError);
  });
});

describe('duplicateSpread', () => {
  function withContent(): Book {
    const book = freshBook(2);
    const s = inner(book);
    s.background = { left: { kind: 'color', color: '#fff' } };
    s.elements.push(shape('a', 1, 2, 3, 4), shape('b', 5, 6, 7, 8), photo('p', 0, 0, 10, 10, 'x'));
    return groupElements(book, s.id, ['a', 'b']);
  }

  it('copies the spread right after the original with fresh ids and the same content', () => {
    const book = withContent();
    const src = inner(book);
    const out = duplicateSpread(book, src.id);
    expect(kinds(out)).toEqual(['first', 'inner', 'inner', 'inner', 'last']);
    const copy = out.spreads[2]!;
    expect(copy.id).not.toBe(src.id);
    expect(copy.background).toEqual(src.background);
    expect(copy.elements).toHaveLength(3);
    expect(copy.elements.map((e) => e.id).some((id) => ['a', 'b', 'p'].includes(id))).toBe(false);
    expect(copy.elements.map((e) => [e.type, e.x, e.y, e.w, e.h])).toEqual(
      src.elements.map((e) => [e.type, e.x, e.y, e.w, e.h]),
    );
    expect(out.spreads[1]).toEqual(src);
  });

  it('keeps the copied group together under a new group id', () => {
    const book = withContent();
    const src = inner(book);
    const copy = duplicateSpread(book, src.id).spreads[2]!;
    const [a, b, p] = copy.elements;
    expect(a!.groupId).toBeDefined();
    expect(a!.groupId).toBe(b!.groupId);
    expect(a!.groupId).not.toBe(src.elements[0]!.groupId);
    expect(p!.groupId).toBeUndefined();
  });

  it('does not share nested objects with the original', () => {
    const book = withContent();
    const out = duplicateSpread(book, inner(book).id);
    expect(out.spreads[2]!.background.left).not.toBe(out.spreads[1]!.background.left);
    expect(out.spreads[2]!.elements[2]).not.toBe(out.spreads[1]!.elements[2]);
  });

  it('throws OpError for the first, last, cover or an unknown spread', () => {
    const book = freshBook(2);
    expect(() => duplicateSpread(book, book.spreads[0]!.id)).toThrow(OpError);
    expect(() => duplicateSpread(book, book.spreads.at(-1)!.id)).toThrow(OpError);
    expect(() => duplicateSpread(book, book.cover.id)).toThrow(OpError);
    expect(() => duplicateSpread(book, 'nope')).toThrow(OpError);
  });
});

describe('moveSpread', () => {
  it('moves an inner spread to the given final index', () => {
    const book = freshBook(3);
    const [first, i1, i2, i3, last] = ids(book) as string[];
    expect(ids(moveSpread(book, i1!, 3))).toEqual([first, i2, i3, i1, last]);
    expect(ids(moveSpread(book, i3!, 1))).toEqual([first, i3, i1, i2, last]);
    expect(moveSpread(book, i2!, 2)).toBe(book);
  });

  it('cannot place a spread before the first or after the last', () => {
    const book = freshBook(3);
    const i2 = book.spreads[2]!.id;
    expect(() => moveSpread(book, i2, 0)).toThrow(OpError);
    expect(() => moveSpread(book, i2, 4)).toThrow(OpError);
    expect(() => moveSpread(book, i2, 99)).toThrow(OpError);
    expect(() => moveSpread(book, i2, -1)).toThrow(OpError);
    expect(() => moveSpread(book, i2, 1.5)).toThrow(OpError);
  });

  it('cannot move the first, last, cover or an unknown spread', () => {
    const book = freshBook(3);
    expect(() => moveSpread(book, book.spreads[0]!.id, 2)).toThrow(OpError);
    expect(() => moveSpread(book, book.spreads.at(-1)!.id, 2)).toThrow(OpError);
    expect(() => moveSpread(book, book.cover.id, 2)).toThrow(OpError);
    expect(() => moveSpread(book, 'nope', 2)).toThrow(OpError);
  });
});

describe('deleteSpread', () => {
  it('removes an inner spread', () => {
    const book = freshBook(2);
    const i1 = book.spreads[1]!.id;
    const out = deleteSpread(book, i1);
    expect(kinds(out)).toEqual(['first', 'inner', 'last']);
    expect(ids(out)).not.toContain(i1);
  });

  it('throws OpError for the first, last, cover or an unknown spread', () => {
    const book = freshBook(2);
    expect(() => deleteSpread(book, book.spreads[0]!.id)).toThrow(OpError);
    expect(() => deleteSpread(book, book.spreads.at(-1)!.id)).toThrow(OpError);
    expect(() => deleteSpread(book, book.cover.id)).toThrow(OpError);
    expect(() => deleteSpread(book, 'nope')).toThrow(OpError);
  });
});

describe('swapPages', () => {
  it('mirrors x about the spine: x 20, w 50 on an A4 spread lands at x 350', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push({ ...shape('a', 20, 30, 50, 10), rotation: 12 });
    const out = swapPages(book, s.id);
    expect(out.spreads[1]!.elements[0]).toMatchObject({
      x: 350,
      y: 30,
      w: 50,
      h: 10,
      rotation: 12,
    });
  });

  it('keeps an element centred on the spine in place and is its own inverse', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(shape('wide', 100, 0, 220, 50), shape('a', 20, 0, 50, 10));
    const once = swapPages(book, s.id);
    expect(once.spreads[1]!.elements[0]).toMatchObject({ x: 100, w: 220 });
    const twice = swapPages(once, s.id);
    expect(twice.spreads[1]).toEqual(book.spreads[1]);
  });

  it('exchanges the left and right backgrounds and leaves a spread background alone', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = {
      left: { kind: 'color', color: '#111' },
      right: { kind: 'color', color: '#222' },
      spread: { kind: 'color', color: '#333' },
    };
    const out = swapPages(book, s.id).spreads[1]!;
    expect(out.background).toEqual({
      left: { kind: 'color', color: '#222' },
      right: { kind: 'color', color: '#111' },
      spread: { kind: 'color', color: '#333' },
    });
  });

  it('moves a background that exists on one page only', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = { left: { kind: 'color', color: '#111' } };
    const out = swapPages(book, s.id).spreads[1]!;
    expect(out.background).toEqual({ right: { kind: 'color', color: '#111' } });
    expect('left' in out.background).toBe(false);
  });

  it('mirrors about the middle of a cover with a spine', () => {
    const base = freshBook(1);
    const book: Book = { ...base, spineWidth: 10 };
    book.cover.elements.push(shape('a', 20, 0, 50, 10));
    const out = swapPages(book, book.cover.id);
    expect(out.cover.elements[0]!.x).toBe(360);
  });

  it('throws OpError on the first and last spreads (one page only) and unknown ids', () => {
    const book = freshBook(1);
    expect(() => swapPages(book, book.spreads[0]!.id)).toThrow(OpError);
    expect(() => swapPages(book, book.spreads.at(-1)!.id)).toThrow(OpError);
    expect(() => swapPages(book, 'nope')).toThrow(OpError);
  });
});

describe('setFormat', () => {
  const a5 = { width: 148, height: 210 };
  const sx = 148 / 210;
  const sy = 210 / 297;

  it('changes only the format when content is not scaled', () => {
    const book = freshBook(1);
    inner(book).elements.push(shape('a', 20, 30, 50, 60));
    const out = setFormat(book, a5, false);
    expect(out.format).toEqual(a5);
    expect(out.spreads[1]!.elements[0]).toMatchObject({ x: 20, y: 30, w: 50, h: 60 });
  });

  it('scales positions and sizes per axis, and text sizes by the smaller factor', () => {
    const book = freshBook(1);
    const s = inner(book);
    const text = newElement('text', { x: 300, y: 100, w: 80, h: 20 });
    text.style.fontSizePt = 12;
    s.elements.push(shape('a', 20, 30, 50, 60), text);
    const out = setFormat(book, a5, true);
    const [a, t] = out.spreads[1]!.elements as [Spread['elements'][number], typeof text];
    expect(a.x).toBeCloseTo(20 * sx, 9);
    expect(a.y).toBeCloseTo(30 * sy, 9);
    expect(a.w).toBeCloseTo(50 * sx, 9);
    expect(a.h).toBeCloseTo(60 * sy, 9);
    expect(t.x).toBeCloseTo(300 * sx, 9);
    expect(t.style.fontSizePt).toBeCloseTo(12 * Math.min(sx, sy), 9);
  });

  it('scales the cover by zone: back, spine (moves, keeps its size) and front', () => {
    const base = freshBook(1);
    const book: Book = { ...base, spineWidth: 10 };
    book.cover.elements.push(
      shape('back', 10, 20, 100, 50),
      shape('spine', 212, 100, 6, 90),
      shape('front', 250, 20, 100, 50),
    );
    const out = setFormat(book, a5, true);
    const [back, spine, front] = out.cover.elements;
    expect(back).toMatchObject({ x: expect.closeTo(10 * sx, 9), w: expect.closeTo(100 * sx, 9) });
    expect(back!.y).toBeCloseTo(20 * sy, 9);
    // front starts at 148 + 10 in the new cover; its offset into the front page is scaled
    expect(front!.x).toBeCloseTo(148 + 10 + (250 - 220) * sx, 9);
    expect(front!.w).toBeCloseTo(100 * sx, 9);
    expect(spine).toMatchObject({ x: 150, w: 6, h: 90 });
    expect(spine!.y + spine!.h / 2).toBeCloseTo(145 * sy, 9);
  });

  it('throws OpError on a format that is not positive and finite', () => {
    const book = freshBook(1);
    expect(() => setFormat(book, { width: 0, height: 210 }, false)).toThrow(OpError);
    expect(() => setFormat(book, { width: 148, height: -1 }, true)).toThrow(OpError);
    expect(() => setFormat(book, { width: Number.NaN, height: 210 }, false)).toThrow(OpError);
  });
});
