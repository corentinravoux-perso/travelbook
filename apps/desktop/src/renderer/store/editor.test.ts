import { deleteSpread, newBook, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, MAX_ZOOM, MIN_ZOOM, SAVE_DELAY_MS } from './editor';

const retitle =
  (title: string) =>
  (book: Book): Book => ({ ...book, title });

/** What `tb.project.open` / `create` give back, reduced to what the store reads. */
const opened = (book: Book) => () => Promise.resolve({ dir: '/albums/x.travelbook', book });

async function setup() {
  const save = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
  const store = createEditorStore({ save });
  await store.getState().openWith(opened(newBook({ title: 'Islande 2026', innerSpreads: 2 })));
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
    expect(s.activePage).toBe('left');
    expect(s.guides).toEqual({ bleed: true, trim: true, safe: true, gutter: true });
    expect(s.history).toEqual({ canUndo: false, canRedo: false, labels: [] });
    expect(s.saveStatus).toBe('saved');
    expect(s.opening).toBe(false);
  });

  it('setActivePage points at a page of the spread in view', async () => {
    const { store } = await setup();
    store.getState().setActivePage('right');
    expect(store.getState().activePage).toBe('right');
    store.getState().setActivePage('left');
    expect(store.getState().activePage).toBe('left');
  });

  it('openWith shows the first spread of the new book and starts a fresh history', async () => {
    const { store } = await setup();
    store.getState().apply(retitle('A'), 'Renommer');
    const other = newBook({ title: 'Autre' });
    const result = await store.getState().openWith(opened(other));
    expect(result?.book).toBe(other);
    const s = store.getState();
    expect(s.book).toBe(other);
    expect(s.currentSpreadId).toBe(other.spreads[0]?.id);
    expect(s.history.canUndo).toBe(false);
  });

  it('apply runs the op and records an undo step with its label', async () => {
    const { store } = await setup();
    store.getState().apply(retitle('Islande'), 'Renommer le livre');
    const s = store.getState();
    expect(s.book?.title).toBe('Islande');
    expect(s.history).toEqual({ canUndo: true, canRedo: false, labels: ['Renommer le livre'] });
  });

  it('undo and redo move through the history', async () => {
    const { store } = await setup();
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

  it('applies with the same mergeKey form one undo step', async () => {
    const { store } = await setup();
    store.getState().apply(retitle('I'), 'Taper le titre', 'title');
    store.getState().apply(retitle('Is'), 'Taper le titre', 'title');
    store.getState().apply(retitle('Isl'), 'Taper le titre', 'title');
    expect(store.getState().history.labels).toEqual(['Taper le titre']);
    store.getState().undo();
    expect(store.getState().book?.title).toBe('Islande 2026');
  });

  it('saves once, 1 s after the last change, with the latest book', async () => {
    const { store, save } = await setup();
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
    const { store, save } = await setup();
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.getState().undo();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].title).toBe('Islande 2026');
  });

  it('an op that changes nothing records no step and schedules no save', async () => {
    const { store, save } = await setup();
    store.getState().apply((b) => b, 'Rien');
    expect(store.getState().history.canUndo).toBe(false);
    expect(store.getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
  });

  it('flush saves a waiting change at once, and only once', async () => {
    const { store, save } = await setup();
    store.getState().apply(retitle('A'), 'Un');
    await store.getState().flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].title).toBe('A');
    expect(store.getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('openWith saves the old book with its latest change before the project switches', async () => {
    const { store, save } = await setup();
    const calls: string[] = [];
    save.mockImplementation((book) => {
      calls.push(`save ${book.title}`);
      return Promise.resolve();
    });
    store.getState().apply(retitle('A'), 'Un');
    store.getState().apply(retitle('B'), 'Deux');
    await store.getState().openWith(() => {
      calls.push('open');
      return opened(newBook({ title: 'Autre' }))();
    });
    expect(calls).toEqual(['save B', 'open']);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getState().book?.title).toBe('Autre');
  });

  it('openWith waits for a save still running before the project switches', async () => {
    const { store, save } = await setup();
    let finish = () => {};
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    const open = vi.fn(opened(newBook({ title: 'Autre' })));
    const switching = store.getState().openWith(open);
    await vi.advanceTimersByTimeAsync(0);
    expect(open).not.toHaveBeenCalled();
    finish();
    await switching;
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('openWith with nothing waiting saves nothing', async () => {
    const { store, save } = await setup();
    await store.getState().openWith(opened(newBook({ title: 'Autre' })));
    expect(save).not.toHaveBeenCalled();
  });

  it('openWith does not switch when the old book cannot be saved', async () => {
    const { store, save } = await setup();
    save.mockRejectedValueOnce(new Error('disk full'));
    store.getState().apply(retitle('A'), 'Un');
    const open = vi.fn(opened(newBook({ title: 'Autre' })));
    await expect(store.getState().openWith(open)).rejects.toThrow('disk full');
    expect(open).not.toHaveBeenCalled();
    expect(store.getState().book?.title).toBe('A');
    expect(store.getState().saveStatus).toBe('error');
  });

  it('a cancelled open keeps the book being edited', async () => {
    const { store } = await setup();
    store.getState().apply(retitle('A'), 'Un');
    expect(await store.getState().openWith(() => Promise.resolve(null))).toBeNull();
    expect(store.getState().book?.title).toBe('A');
    expect(store.getState().history.canUndo).toBe(true);
    expect(store.getState().opening).toBe(false);
  });

  it('changes are refused while another album opens, so none is saved into it', async () => {
    const { store, save } = await setup();
    type Opened = { dir: string; book: Book };
    let answer: (opened: Opened) => void = () => {};
    const switching = store
      .getState()
      .openWith(() => new Promise<Opened>((resolve) => (answer = resolve)));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().opening).toBe(true);
    store.getState().apply(retitle('A'), 'Un');
    store.getState().undo();
    expect(store.getState().book?.title).toBe('Islande 2026');
    answer({ dir: '/albums/y.travelbook', book: newBook({ title: 'Autre' }) });
    await switching;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
    expect(store.getState().opening).toBe(false);
  });

  it('a change made while openWith saves the old book is refused, never saved into the new project', async () => {
    const { store, save } = await setup();
    const calls: string[] = [];
    let finish = () => {};
    save.mockImplementation((book) => {
      calls.push(`save ${book.title}`);
      return calls.length === 1
        ? new Promise<void>((resolve) => (finish = resolve))
        : Promise.resolve();
    });
    store.getState().apply(retitle('A'), 'Un');
    const switching = store.getState().openWith(() => {
      calls.push('open');
      return opened(newBook({ title: 'Autre' }))();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().opening).toBe(true);
    store.getState().apply(retitle('B'), 'Deux');
    expect(store.getState().book?.title).toBe('A');
    finish();
    await switching;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(calls).toEqual(['save A', 'open']);
  });

  it('openWith saves again when the debounced save already running fails', async () => {
    const { store, save } = await setup();
    const calls: string[] = [];
    let fail: (error: Error) => void = () => {};
    save.mockImplementation((book) => {
      calls.push(`save ${book.title}`);
      return calls.length === 1
        ? new Promise<void>((_resolve, reject) => (fail = reject))
        : Promise.resolve();
    });
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    const switching = store.getState().openWith(() => {
      calls.push('open');
      return opened(newBook({ title: 'Autre' }))();
    });
    fail(new Error('disk full'));
    await switching;
    expect(calls).toEqual(['save A', 'save A', 'open']);
  });

  it('openWith refuses to switch when the running save fails and so does the retry', async () => {
    const { store, save } = await setup();
    let fail: (error: Error) => void = () => {};
    save.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (fail = reject)));
    save.mockRejectedValueOnce(new Error('still full'));
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    const open = vi.fn(opened(newBook({ title: 'Autre' })));
    const switching = store.getState().openWith(open);
    fail(new Error('disk full'));
    await expect(switching).rejects.toThrow('still full');
    expect(open).not.toHaveBeenCalled();
    expect(store.getState().book?.title).toBe('A');
    expect(store.getState().opening).toBe(false);
  });

  it('openWith saves a book whose last save failed, even with no change since', async () => {
    const { store, save } = await setup();
    save.mockRejectedValueOnce(new Error('disk full'));
    store.getState().apply(retitle('A'), 'Un');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.getState().saveStatus).toBe('error');
    const open = vi.fn(opened(newBook({ title: 'Autre' })));
    await store.getState().openWith(open);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].title).toBe('A');
    expect(save.mock.invocationCallOrder[1]).toBeLessThan(open.mock.invocationCallOrder[0] ?? 0);
  });

  it('a second openWith while one runs is refused and does not end the first early', async () => {
    const { store } = await setup();
    type Opened = { dir: string; book: Book };
    let answer: (opened: Opened) => void = () => {};
    const first = store.getState().openWith(() => new Promise<Opened>((r) => (answer = r)));
    await vi.advanceTimersByTimeAsync(0);
    const second = vi.fn(opened(newBook({ title: 'Deuxième' })));
    await expect(store.getState().openWith(second)).rejects.toThrow(/already/i);
    expect(second).not.toHaveBeenCalled();
    expect(store.getState().opening).toBe(true);
    answer({ dir: '/albums/y.travelbook', book: newBook({ title: 'Premier' }) });
    await first;
    expect(store.getState().book?.title).toBe('Premier');
    expect(store.getState().opening).toBe(false);
  });

  it('a failed save is reported, and the next change saves again', async () => {
    const { store, save } = await setup();
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
    const { store, save } = await setup();
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

  it('zooms within bounds, and fits again on request', async () => {
    const { store } = await setup();
    expect(store.getState().fit).toBe(true);
    store.getState().setZoom(2);
    expect(store.getState()).toMatchObject({ zoom: 2, fit: false });
    store.getState().zoomBy(100);
    expect(store.getState().zoom).toBe(MAX_ZOOM);
    store.getState().zoomBy(1e-6);
    expect(store.getState().zoom).toBe(MIN_ZOOM);
    store.getState().fitSpread();
    expect(store.getState().fit).toBe(true);
  });

  it('keeps the selection reference when it does not change, and shows one overlay at a time', async () => {
    const { store } = await setup();
    store.getState().select(['a', 'b']);
    const before = store.getState().selection;
    store.getState().select(['a', 'b']);
    expect(store.getState().selection).toBe(before);
    store.getState().setGuide('bleed', false);
    expect(store.getState().guides).toEqual({ bleed: false, trim: true, safe: true, gutter: true });
  });

  describe('current spread', () => {
    it('goToSpread shows another spread (the cover included) and empties the selection', async () => {
      const { store } = await setup();
      const { book } = store.getState();
      store.getState().select(['x']);
      store.getState().goToSpread(book!.cover.id);
      expect(store.getState()).toMatchObject({ currentSpreadId: book!.cover.id, selection: [] });
      store.getState().goToSpread('nope');
      expect(store.getState().currentSpreadId).toBe(book!.cover.id);
    });

    it('moves to the spread that takes the place of a deleted one', async () => {
      const { store } = await setup();
      const [, a, b] = store.getState().book!.spreads;
      store.getState().goToSpread(a!.id);
      store.getState().apply((bk) => deleteSpread(bk, a!.id), 'Supprimer');
      expect(store.getState().currentSpreadId).toBe(b!.id);
      store.getState().undo();
      expect(store.getState().currentSpreadId).toBe(b!.id);
      store.getState().goToSpread(b!.id);
      store.getState().apply((bk) => deleteSpread(bk, b!.id), 'Supprimer');
      expect(store.getState().book!.spreads.map((s) => s.id)).not.toContain(b!.id);
      expect(store.getState().currentSpreadId).toBe(store.getState().book!.spreads[2]!.id);
      expect(store.getState().book!.spreads[2]!.kind).toBe('last');
    });

    it('opens and closes the overview', async () => {
      const { store } = await setup();
      store.getState().setOverview(true);
      expect(store.getState().overview).toBe(true);
      store.getState().setOverview(false);
      expect(store.getState().overview).toBe(false);
    });
  });

  describe('crop mode and the photo picker', () => {
    it('starts with neither open', async () => {
      const { store } = await setup();
      expect(store.getState()).toMatchObject({ cropId: null, pickerId: null });
    });

    it('enterCrop selects the frame alone and closes the picker; exitCrop leaves', async () => {
      const { store } = await setup();
      store.getState().openPicker('slot');
      store.getState().select(['x', 'y']);
      store.getState().enterCrop('photo');
      expect(store.getState()).toMatchObject({
        cropId: 'photo',
        pickerId: null,
        selection: ['photo'],
      });
      store.getState().exitCrop();
      expect(store.getState().cropId).toBeNull();
      expect(store.getState().selection).toEqual(['photo']);
    });

    it('openPicker shows the photos panel and ends a crop; closePicker closes', async () => {
      const { store } = await setup();
      store.getState().setPanel('shapes');
      store.getState().enterCrop('photo');
      store.getState().openPicker('slot');
      expect(store.getState()).toMatchObject({ pickerId: 'slot', cropId: null, panel: 'photos' });
      store.getState().closePicker();
      expect(store.getState().pickerId).toBeNull();
    });

    it('both end when another spread is shown, and when an album is opened', async () => {
      const { store } = await setup();
      const [first, second] = store.getState().book!.spreads;
      store.getState().goToSpread(first!.id);
      store.getState().enterCrop('photo');
      store.getState().goToSpread(second!.id);
      expect(store.getState().cropId).toBeNull();
      store.getState().openPicker('slot');
      store.getState().goToSpread(first!.id);
      expect(store.getState().pickerId).toBeNull();
      store.getState().enterCrop('photo');
      await store.getState().openWith(opened(newBook({ title: 'Autre' })));
      expect(store.getState().cropId).toBeNull();
    });
  });
});
