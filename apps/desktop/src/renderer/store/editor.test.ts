import { newBook, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, SAVE_DELAY_MS } from './editor';

const retitle =
  (title: string) =>
  (book: Book): Book => ({ ...book, title });

function setup() {
  const save = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
  const store = createEditorStore({ save });
  store.getState().load(newBook({ title: 'Islande 2026', innerSpreads: 2 }));
  return { store, save };
}

describe('editor store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty with the default view state', () => {
    const store = createEditorStore({ save: () => Promise.resolve() });
    const s = store.getState();
    expect(s.book).toBeNull();
    expect(s.currentSpreadId).toBeNull();
    expect(s.selection).toEqual([]);
    expect(s.zoom).toBe(1);
    expect(s.tool).toBe('select');
    expect(s.panel).toBe('photos');
    expect(s.guides).toEqual({ bleed: true, trim: true, safe: true, gutter: true });
    expect(s.history).toEqual({ canUndo: false, canRedo: false, labels: [] });
    expect(s.saveStatus).toBe('saved');
  });

  it('load shows the first spread and starts a fresh history', () => {
    const { store } = setup();
    store.getState().apply(retitle('A'), 'Renommer');
    const other = newBook({ title: 'Autre' });
    store.getState().load(other);
    const s = store.getState();
    expect(s.book).toBe(other);
    expect(s.currentSpreadId).toBe(other.spreads[0]?.id);
    expect(s.history.canUndo).toBe(false);
  });

  it('apply runs the op and records an undo step with its label', () => {
    const { store } = setup();
    store.getState().apply(retitle('Islande'), 'Renommer le livre');
    const s = store.getState();
    expect(s.book?.title).toBe('Islande');
    expect(s.history).toEqual({ canUndo: true, canRedo: false, labels: ['Renommer le livre'] });
  });

  it('undo and redo move through the history', () => {
    const { store } = setup();
    store.getState().apply(retitle('A'), 'Un');
    store.getState().apply(retitle('B'), 'Deux');
    store.getState().undo();
    expect(store.getState().book?.title).toBe('A');
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: true, labels: ['Un'] });
    store.getState().undo();
    expect(store.getState().book?.title).toBe('Islande 2026');
    expect(store.getState().history.canUndo).toBe(false);
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().book?.title).toBe('B');
    expect(store.getState().history.canRedo).toBe(false);
  });

  it('applies with the same mergeKey form one undo step', () => {
    const { store } = setup();
    store.getState().apply(retitle('I'), 'Taper le titre', 'title');
    store.getState().apply(retitle('Is'), 'Taper le titre', 'title');
    store.getState().apply(retitle('Isl'), 'Taper le titre', 'title');
    expect(store.getState().history.labels).toEqual(['Taper le titre']);
    store.getState().undo();
    expect(store.getState().book?.title).toBe('Islande 2026');
  });

  it('saves once, 1 s after the last change, with the latest book', async () => {
    const { store, save } = setup();
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    store.getState().apply(retitle('B'), 'Deux');
    expect(store.getState().saveStatus).toBe('pending');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].title).toBe('B');
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('undo and redo are saved too', async () => {
    const { store, save } = setup();
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.getState().undo();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].title).toBe('Islande 2026');
  });

  it('an op that changes nothing records no step and schedules no save', async () => {
    const { store, save } = setup();
    store.getState().apply((b) => b, 'Rien');
    expect(store.getState().history.canUndo).toBe(false);
    expect(store.getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
  });

  it('load cancels a pending save of the previous book', async () => {
    const { store, save } = setup();
    store.getState().apply(retitle('A'), 'Un');
    store.getState().load(newBook({ title: 'Autre' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
  });

  it('a failed save is reported, and the next change saves again', async () => {
    const { store, save } = setup();
    save.mockRejectedValueOnce(new Error('disk full'));
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.getState().saveStatus).toBe('error');
    store.getState().apply(retitle('B'), 'Deux');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('a save waits for the one still running, so the last book is written last', async () => {
    const { store, save } = setup();
    let finishFirst = () => {};
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)));
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.getState().apply(retitle('B'), 'Deux');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    finishFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].title).toBe('B');
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('apply without an open book is a programming error', () => {
    const store = createEditorStore({ save: () => Promise.resolve() });
    expect(() => store.getState().apply(retitle('A'), 'Un')).toThrow(/no book/i);
  });
});
