import { addElement, newBook, newElement } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import {
  addSpreadAfter,
  deleteSpreadById,
  duplicateSpreadById,
  moveSpreadTo,
  swapPagesOf,
} from './spreadActions';

const state = () => editorStore.getState();
const ids = () => state().book!.spreads.map((s) => s.id);
const kinds = () => state().book!.spreads.map((s) => s.kind);

describe('spread actions on the editor store', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // The app's store saves through `window.tb`; these tests only look at the document.
    vi.stubGlobal('window', { tb: { project: { save: () => Promise.resolve() } } });
    const book = newBook({ title: 'T', innerSpreads: 3 });
    await state().openWith(() => Promise.resolve({ dir: '/x', book }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('adds a spread after the given one and shows it', () => {
    const [first, one] = state().book!.spreads;
    addSpreadAfter(one!.id);
    expect(state().book!.spreads).toHaveLength(6);
    expect(ids().slice(0, 2)).toEqual([first!.id, one!.id]);
    expect(state().currentSpreadId).toBe(ids()[2]);
    expect(state().book!.spreads[2]!.kind).toBe('inner');
  });

  it('adds after the first spread when asked from the cover, before the last when from the last', () => {
    const { book } = state();
    addSpreadAfter(book!.cover.id);
    expect(ids()[1]).toBe(state().currentSpreadId);
    expect(kinds()).toEqual(['first', 'inner', 'inner', 'inner', 'inner', 'last']);
    const last = ids().at(-1)!;
    addSpreadAfter(last);
    expect(ids().at(-1)).toBe(last);
    expect(state().currentSpreadId).toBe(ids().at(-2));
    expect(state().book!.spreads).toHaveLength(7);
  });

  it('duplicates an inner spread, shows the copy, and leaves the first and last alone', () => {
    const one = state().book!.spreads[1]!.id;
    duplicateSpreadById(one);
    expect(state().book!.spreads).toHaveLength(6);
    expect(state().currentSpreadId).toBe(ids()[2]);
    expect(ids()[2]).not.toBe(one);
    const before = state().book;
    duplicateSpreadById(ids()[0]!);
    duplicateSpreadById(ids().at(-1)!);
    duplicateSpreadById(state().book!.cover.id);
    expect(state().book).toBe(before);
  });

  it('deletes only inner spreads', () => {
    const before = state().book;
    deleteSpreadById(ids()[0]!);
    deleteSpreadById(ids().at(-1)!);
    deleteSpreadById(state().book!.cover.id);
    expect(state().book).toBe(before);
    deleteSpreadById(ids()[2]!);
    expect(state().book!.spreads).toHaveLength(4);
  });

  it('swaps the pages of inner spreads, and never throws on the one-page spreads', () => {
    const before = state().book;
    expect(() => swapPagesOf(ids()[0]!)).not.toThrow();
    expect(() => swapPagesOf(ids().at(-1)!)).not.toThrow();
    expect(state().book).toBe(before);
    const one = ids()[1]!;
    state().apply(
      (b) => addElement(b, one, newElement('shape', { x: 10, y: 5, w: 20, h: 20 })),
      'x',
    );
    swapPagesOf(one);
    // The spread is 420 mm wide: a shape at 10 mm with a width of 20 mm lands at 390 mm.
    expect(state().book!.spreads[1]!.elements[0]!.x).toBe(390);
    expect(state().history.labels.at(-1)).toBe('Échanger les pages');
  });

  it('moves an inner spread, and refuses the first, the last and the ends of the book', () => {
    const [first, a, b, c, last] = ids();
    moveSpreadTo(c!, 1);
    expect(ids()).toEqual([first, c, a, b, last]);
    const before = state().book;
    moveSpreadTo(first!, 2);
    moveSpreadTo(last!, 1);
    expect(state().book).toBe(before);
  });

  it('is undoable, one step each', () => {
    const start = ids();
    addSpreadAfter(start[1]!);
    deleteSpreadById(ids()[2]!);
    moveSpreadTo(ids()[2]!, 1);
    expect(state().history.labels).toHaveLength(3);
    state().undo();
    state().undo();
    state().undo();
    expect(ids()).toEqual(start);
  });
});
