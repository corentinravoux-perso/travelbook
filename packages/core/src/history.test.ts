import { describe, expect, it } from 'vitest';
import { createHistory } from './history';
import { addElement, updateElements } from './ops/elements';
import { OpError } from './ops/errors';
import { freshBook, inner, shape, useCounterIds } from './ops/test-helpers';
import type { Book } from './schema';

useCounterIds();

/** A book with one inner spread holding a shape 'a' at x = 0, and the op that moves it. */
function setup(): { book: Book; spreadId: string; moveTo: (x: number) => (b: Book) => Book } {
  const fresh = freshBook(1);
  const spreadId = inner(fresh).id;
  const book = addElement(fresh, spreadId, shape('a', 0, 0, 10, 10));
  return { book, spreadId, moveTo: (x) => (b) => updateElements(b, spreadId, ['a'], { x }) };
}

const xOf = (book: Book): number => inner(book).elements[0]!.x;

describe('createHistory', () => {
  it('starts empty', () => {
    const history = createHistory();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.labels).toEqual([]);
  });

  it('applies an operation and returns its result', () => {
    const { book, moveTo } = setup();
    const history = createHistory();
    const next = history.apply(book, moveTo(5), 'Déplacer');
    expect(xOf(next)).toBe(5);
    expect(xOf(book)).toBe(0);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.labels).toEqual(['Déplacer']);
  });

  it('undoes and redoes, one step at a time', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'un');
    const b2 = history.apply(b1, moveTo(2), 'deux');
    const b3 = history.apply(b2, moveTo(3), 'trois');
    const u1 = history.undo(b3);
    expect(xOf(u1)).toBe(2);
    expect(history.canRedo).toBe(true);
    expect(history.labels).toEqual(['un', 'deux']);
    const u2 = history.undo(u1);
    expect(xOf(u2)).toBe(1);
    const r1 = history.redo(u2);
    expect(xOf(r1)).toBe(2);
    expect(history.labels).toEqual(['un', 'deux']);
    const r2 = history.redo(r1);
    expect(xOf(r2)).toBe(3);
    expect(history.labels).toEqual(['un', 'deux', 'trois']);
    expect(history.canRedo).toBe(false);
  });

  it('gives back the earlier books themselves, not copies', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'un');
    const b2 = history.apply(b1, moveTo(2), 'deux');
    const back = history.undo(b2);
    expect(back).toBe(b1);
    expect(history.undo(back)).toBe(b0);
    expect(history.redo(b0)).toBe(b1);
  });

  it('leaves the book alone when there is nothing to undo or redo', () => {
    const { book } = setup();
    const history = createHistory();
    expect(history.undo(book)).toBe(book);
    expect(history.redo(book)).toBe(book);
  });

  it('collapses consecutive applies with the same mergeKey into one undo step', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'Déplacer', 'drag:el1');
    const b2 = history.apply(b1, moveTo(2), 'Déplacer', 'drag:el1');
    const b3 = history.apply(b2, moveTo(3), 'Déplacer', 'drag:el1');
    expect(xOf(b3)).toBe(3);
    expect(history.labels).toEqual(['Déplacer']);
    const undone = history.undo(b3);
    expect(xOf(undone)).toBe(0);
    expect(undone).toBe(b0);
    expect(history.canUndo).toBe(false);
    const redone = history.redo(undone);
    expect(redone).toBe(b3);
    expect(history.canRedo).toBe(false);
  });

  it('keeps the label of the first apply of a merged step', () => {
    const { book, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(book, moveTo(1), 'premier', 'k');
    history.apply(b1, moveTo(2), 'second', 'k');
    expect(history.labels).toEqual(['premier']);
  });

  it('does not merge different keys, or applies without a key', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    let b = history.apply(b0, moveTo(1), 'a', 'k1');
    b = history.apply(b, moveTo(2), 'b', 'k2');
    b = history.apply(b, moveTo(3), 'c');
    b = history.apply(b, moveTo(4), 'd');
    b = history.apply(b, moveTo(5), 'e', 'k2');
    expect(history.labels).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(xOf(history.undo(b))).toBe(4);
  });

  it('starts a new step after an undo or a redo, even with the same key', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'x', 'k');
    const undone = history.undo(b1);
    const b2 = history.apply(undone, moveTo(2), 'y', 'k');
    expect(history.labels).toEqual(['y']);
    const b3 = history.apply(b2, moveTo(3), 'z', 'k'); // merges into y
    expect(history.labels).toEqual(['y']);
    const back = history.undo(b3);
    const redone = history.redo(back);
    const b4 = history.apply(redone, moveTo(4), 'w', 'k');
    expect(history.labels).toEqual(['y', 'w']);
    expect(xOf(history.undo(b4))).toBe(3);
  });

  it('starts a new step after clear', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'x', 'k');
    history.clear();
    history.apply(b1, moveTo(2), 'y', 'k');
    expect(history.labels).toEqual(['y']);
  });

  it('drops the redo steps when a new change is applied after an undo', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'un');
    const b2 = history.apply(b1, moveTo(2), 'deux');
    const undone = history.undo(b2);
    expect(history.canRedo).toBe(true);
    const other = history.apply(undone, moveTo(9), 'neuf');
    expect(history.canRedo).toBe(false);
    expect(history.redo(other)).toBe(other);
    expect(history.labels).toEqual(['un', 'neuf']);
    expect(xOf(history.undo(other))).toBe(1);
  });

  it('keeps at most `limit` steps, dropping the oldest', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory(3);
    let b = b0;
    for (let i = 1; i <= 5; i++) b = history.apply(b, moveTo(i), `m${i}`);
    expect(history.labels).toEqual(['m3', 'm4', 'm5']);
    b = history.undo(b);
    b = history.undo(b);
    b = history.undo(b);
    expect(xOf(b)).toBe(2); // the state before the oldest kept step
    expect(history.canUndo).toBe(false);
    expect(history.undo(b)).toBe(b);
  });

  it('does not count a merged apply against the limit', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory(1);
    let b = b0;
    for (let i = 1; i <= 4; i++) b = history.apply(b, moveTo(i), 'drag', 'k');
    expect(history.labels).toEqual(['drag']);
    expect(history.undo(b)).toBe(b0);
  });

  it('rejects a limit that is not a positive integer', () => {
    for (const limit of [0, -1, 1.5, NaN]) expect(() => createHistory(limit)).toThrow(RangeError);
  });

  it('records nothing for an operation that changes nothing', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'x');
    const undone = history.undo(b1);
    const same = history.apply(undone, (b) => b, 'rien');
    expect(same).toBe(undone);
    expect(history.canRedo).toBe(true); // an apply that does nothing keeps the redo steps
    expect(history.labels).toEqual([]);
    const still = history.apply(b1, moveTo(1), 'encore'); // x is already 1
    expect(still).toBe(b1);
    expect(history.labels).toEqual([]);
  });

  it('keeps a merge going across an operation that changes nothing', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'drag', 'k');
    const b2 = history.apply(b1, moveTo(1), 'drag', 'k');
    expect(b2).toBe(b1);
    history.apply(b2, moveTo(2), 'drag', 'k');
    expect(history.labels).toEqual(['drag']);
  });

  it('leaves the history and the book untouched when the operation throws', () => {
    const { book: b0, spreadId, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'x', 'k');
    const undone = history.undo(b1);
    const redoable = history.canRedo;
    expect(() =>
      history.apply(undone, (b) => updateElements(b, spreadId, ['nope'], { x: 1 }), 'oups', 'k'),
    ).toThrow(OpError);
    expect(history.canRedo).toBe(redoable);
    expect(history.labels).toEqual([]);
    expect(history.redo(undone)).toBe(b1);
  });

  it('clear forgets every step', () => {
    const { book: b0, moveTo } = setup();
    const history = createHistory();
    const b1 = history.apply(b0, moveTo(1), 'x');
    const b2 = history.apply(b1, moveTo(2), 'y');
    history.undo(b2);
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.labels).toEqual([]);
    expect(history.undo(b2)).toBe(b2);
  });

  it('returns a fresh copy of the labels', () => {
    const { book, moveTo } = setup();
    const history = createHistory();
    history.apply(book, moveTo(1), 'x');
    history.labels.push('hack');
    expect(history.labels).toEqual(['x']);
  });

  it('keeps independent histories independent', () => {
    const { book, moveTo } = setup();
    const one = createHistory();
    const two = createHistory();
    one.apply(book, moveTo(1), 'x');
    expect(two.canUndo).toBe(false);
  });
});
