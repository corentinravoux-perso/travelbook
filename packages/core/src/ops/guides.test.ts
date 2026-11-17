import { describe, expect, it } from 'vitest';
import { BookSchema } from '../schema';
import { OpError } from './errors';
import { addGuide, moveGuide, removeGuide } from './guides';
import { freshBook, inner, useCounterIds } from './test-helpers';

useCounterIds();

describe('ruler guides', () => {
  it('adds guides on both axes, rounded to 0.01 mm, without doubles', () => {
    const book = freshBook(1);
    const id = inner(book).id;
    let next = addGuide(book, id, 'x', 40.123);
    next = addGuide(next, id, 'y', 100);
    next = addGuide(next, id, 'x', 40.12);
    expect(inner(next).guides).toEqual({ x: [40.12], y: [100] });
    // The input is not touched.
    expect(inner(book).guides).toBeUndefined();
  });

  it('moves and removes a guide; the field goes with the last one', () => {
    const book = freshBook(1);
    const id = inner(book).id;
    let next = addGuide(addGuide(book, id, 'x', 10), id, 'x', 20);
    next = moveGuide(next, id, 'x', 1, 25.5);
    expect(inner(next).guides).toEqual({ x: [10, 25.5], y: [] });
    next = removeGuide(next, id, 'x', 0);
    expect(inner(next).guides).toEqual({ x: [25.5], y: [] });
    next = removeGuide(next, id, 'x', 0);
    expect(inner(next).guides).toBeUndefined();
  });

  it('works on the cover', () => {
    const book = freshBook(1);
    expect(addGuide(book, book.cover.id, 'y', 5).cover.guides).toEqual({ x: [], y: [5] });
  });

  it('rejects a position that is not finite and an unknown guide', () => {
    const book = freshBook(1);
    const id = inner(book).id;
    expect(() => addGuide(book, id, 'x', Number.NaN)).toThrow(OpError);
    expect(() => moveGuide(book, id, 'x', 0, 3)).toThrow(OpError);
    expect(() => removeGuide(addGuide(book, id, 'y', 3), id, 'y', 4)).toThrow(OpError);
  });

  it('round-trips through the schema; a book without guides stays valid', () => {
    const book = freshBook(1);
    const withGuides = addGuide(book, inner(book).id, 'x', 12);
    expect(inner(BookSchema.parse(withGuides)).guides).toEqual({ x: [12], y: [] });
    expect(inner(BookSchema.parse(book)).guides).toBeUndefined();
  });
});
