import { newBook, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore } from '../store/editor';
import { createCoverThumbs } from './coverThumb';

const open = (book: Book) => () => Promise.resolve({ dir: '/x', book });

async function setup(hasThumb = true) {
  const store = createEditorStore({ save: () => Promise.resolve() });
  const capture = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
  const thumbs = createCoverThumbs({
    store,
    capture,
    hasThumb: () => Promise.resolve(hasThumb),
    delayMs: 3000,
  });
  const book = newBook({ title: 'T', innerSpreads: 2 });
  await store.getState().openWith(open(book));
  await vi.advanceTimersByTimeAsync(0);
  return { store, capture, thumbs, book };
}

const editCover = (store: ReturnType<typeof createEditorStore>) =>
  store.getState().apply((b) => ({ ...b, cover: { ...b.cover, elements: [] } }), 'Couverture');
const editInner = (store: ReturnType<typeof createEditorStore>) =>
  store
    .getState()
    .apply(
      (b) => ({ ...b, spreads: b.spreads.map((s, i) => (i === 1 ? { ...s, elements: [] } : s)) }),
      'Double page',
    );

describe('cover thumbnail controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures 3 s after the last edit of the cover, once', async () => {
    const { store, capture } = await setup();
    editCover(store);
    await vi.advanceTimersByTimeAsync(2900);
    editCover(store);
    await vi.advanceTimersByTimeAsync(2900);
    expect(capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![0]).toBe(store.getState().book);
  });

  it('ignores edits of other spreads and view changes', async () => {
    const { store, capture } = await setup();
    editInner(store);
    store.getState().setZoom(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('flush captures at once when the cover changed, and only then', async () => {
    const { store, capture, thumbs } = await setup();
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
    editCover(store);
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('builds a missing thumbnail soon after the book opens', async () => {
    const { capture } = await setup(false);
    await vi.advanceTimersByTimeAsync(3100);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild the thumbnail of a book that is opened again unchanged', async () => {
    const { store, capture, book } = await setup();
    // Back from the home screen: the same album, read from disk, so its parts are new objects.
    const again = structuredClone(book);
    await store.getState().openWith(open(again));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture).not.toHaveBeenCalled();
    editCover(store);
    await vi.advanceTimersByTimeAsync(3100);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a failed capture and never rejects', async () => {
    const { store, capture, thumbs } = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    capture.mockRejectedValueOnce(new Error('no window'));
    editCover(store);
    await expect(thumbs.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    editCover(store);
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
