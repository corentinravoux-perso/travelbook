import { describe, expect, it } from 'vitest';
import type { Background } from '../schema';
import { setBackground } from './backgrounds';
import { OpError } from './errors';
import { freshBook, inner, useCounterIds } from './test-helpers';

useCounterIds();

const red: Background = { kind: 'color', color: '#f00' };
const blue: Background = { kind: 'color', color: '#00f' };

describe('setBackground', () => {
  it('sets the background of one page', () => {
    const book = freshBook(1);
    const s = inner(book).id;
    const left = setBackground(book, s, 'left', red);
    expect(left.spreads[1]!.background).toEqual({ left: red });
    const both = setBackground(left, s, 'right', blue);
    expect(both.spreads[1]!.background).toEqual({ left: red, right: blue });
  });

  it('removes a background with null', () => {
    const book = freshBook(1);
    const s = inner(book).id;
    const set = setBackground(setBackground(book, s, 'left', red), s, 'right', blue);
    const out = setBackground(set, s, 'left', null);
    expect(out.spreads[1]!.background).toEqual({ right: blue });
    expect('left' in out.spreads[1]!.background).toBe(false);
  });

  it('a spread background replaces the page backgrounds', () => {
    const book = freshBook(1);
    const s = inner(book).id;
    const pages = setBackground(setBackground(book, s, 'left', red), s, 'right', blue);
    const out = setBackground(pages, s, 'spread', red);
    expect(out.spreads[1]!.background).toEqual({ spread: red });
  });

  it('a page background is added on top of an existing spread background', () => {
    const book = freshBook(1);
    const s = inner(book).id;
    const out = setBackground(setBackground(book, s, 'spread', red), s, 'right', blue);
    expect(out.spreads[1]!.background).toEqual({ spread: red, right: blue });
    const cleared = setBackground(out, s, 'spread', null);
    expect(cleared.spreads[1]!.background).toEqual({ right: blue });
  });

  it('works on the cover and stores a copy', () => {
    const book = freshBook(1);
    const bg: Background = { kind: 'color', color: '#0f0' };
    const out = setBackground(book, book.cover.id, 'left', bg);
    expect(out.cover.background.left).toEqual(bg);
    expect(out.cover.background.left).not.toBe(bg);
    expect(Object.isFrozen(bg)).toBe(false);
  });

  it('throws OpError on an unknown spread or a page the spread lacks', () => {
    const book = freshBook(1);
    expect(() => setBackground(book, 'nope', 'left', red)).toThrow(OpError);
    expect(() => setBackground(book, book.spreads[0]!.id, 'left', red)).toThrow(OpError);
    expect(() => setBackground(book, book.spreads.at(-1)!.id, 'right', red)).toThrow(OpError);
    // the first spread still takes a background on its right page or across the spread
    expect(setBackground(book, book.spreads[0]!.id, 'right', red).spreads[0]!.background).toEqual({
      right: red,
    });
  });
});
