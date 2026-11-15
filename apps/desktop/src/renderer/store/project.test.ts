import { newBook, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenedProject, ProjectInfo, SnapshotInfo } from '../../shared/api';
import { createEditorStore } from './editor';
import { createProjectStore, SNAPSHOT_NOTE_MS } from './project';

const retitle =
  (title: string) =>
  (book: Book): Book => ({ ...book, title });

const info = (label: SnapshotInfo['label']): SnapshotInfo => ({
  id: `x-${label}`,
  at: '2026-11-15T10:00:00.000Z',
  label,
  pages: 24,
});

function setup() {
  const save = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
  const editor = createEditorStore({ save });
  const api = {
    create: vi.fn<(o: { name: string }) => Promise<ProjectInfo | null>>(),
    open: vi.fn<(dir?: string) => Promise<OpenedProject | null>>(),
    recent: vi.fn(() => Promise.resolve([])),
    snapshot: vi.fn((label: SnapshotInfo['label']) => Promise.resolve(info(label))),
  };
  const store = createProjectStore({ editor, api });
  return { save, editor, api, store };
}

const opened = (book: Book, missing: string[] = []): OpenedProject => ({
  dir: '/albums/x.travelbook',
  book,
  missing,
});

describe('project store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the home screen', () => {
    const { store } = setup();
    expect(store.getState().view).toBe('home');
  });

  it('creates a book through the editor store and shows the editor', async () => {
    const { store, editor, api } = setup();
    const book = newBook({ title: 'Islande' });
    api.create.mockResolvedValue({ dir: '/albums/islande.travelbook', book });
    expect(await store.getState().createProject({ name: 'Islande' })).toBe(true);
    expect(editor.getState().book).toBe(book);
    expect(store.getState().view).toBe('editor');
    expect(store.getState().missing).toEqual([]);
  });

  it('stays on the home screen when the user cancels', async () => {
    const { store, editor, api } = setup();
    api.open.mockResolvedValue(null);
    expect(await store.getState().openProject()).toBe(false);
    expect(store.getState().view).toBe('home');
    expect(store.getState().error).toBeNull();
    expect(editor.getState().book).toBeNull();
  });

  it('keeps the missing asset ids of an opened book', async () => {
    const { store, api } = setup();
    api.open.mockResolvedValue(opened(newBook({ title: 'A' }), ['p1', 'p2']));
    await store.getState().openProject('/albums/x.travelbook');
    expect(store.getState().missing).toEqual(['p1', 'p2']);
    store.getState().dismissMissing();
    expect(store.getState().missing).toEqual([]);
  });

  it('reports a failed open and leaves the previous state', async () => {
    const { store, api } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.open.mockRejectedValue(new Error('no book.json'));
    expect(await store.getState().openProject('/nope')).toBe(false);
    expect(store.getState().error).toBe('open');
    expect(store.getState().view).toBe('home');
    expect(store.getState().busy).toBe(false);
  });

  it('saves the open book before opening another one', async () => {
    const { store, editor, api, save } = setup();
    api.open.mockResolvedValueOnce(opened(newBook({ title: 'A' })));
    await store.getState().openProject('/a');
    editor.getState().apply(retitle('A2'), 'Renommer');
    api.open.mockImplementationOnce(() => {
      expect(save).toHaveBeenCalledTimes(1);
      return Promise.resolve(opened(newBook({ title: 'B' })));
    });
    await store.getState().openProject('/b');
    expect(editor.getState().book?.title).toBe('B');
  });

  it('goHome saves first and refreshes the recent list; a failed save keeps the editor', async () => {
    const { store, editor, api, save } = setup();
    api.open.mockResolvedValue(opened(newBook({ title: 'A' })));
    await store.getState().openProject('/a');
    editor.getState().apply(retitle('A2'), 'Renommer');
    save.mockRejectedValue(new Error('disk full'));
    await store.getState().goHome();
    expect(store.getState().view).toBe('editor');
    save.mockResolvedValue();
    await store.getState().goHome();
    expect(store.getState().view).toBe('home');
    expect(api.recent).toHaveBeenCalled();
  });

  describe('snapshots', () => {
    it('Ctrl+S flushes the book, writes a manual snapshot and shows a note', async () => {
      const { store, editor, api, save } = setup();
      api.open.mockResolvedValue(opened(newBook({ title: 'A' })));
      await store.getState().openProject('/a');
      editor.getState().apply(retitle('A2'), 'Renommer');
      await store.getState().manualSnapshot();
      expect(save).toHaveBeenCalledTimes(1);
      expect(api.snapshot).toHaveBeenCalledWith('manual');
      expect(save.mock.invocationCallOrder[0]).toBeLessThan(
        api.snapshot.mock.invocationCallOrder[0]!,
      );
      expect(store.getState().snapshotNote).toBe('saved');
      vi.advanceTimersByTime(SNAPSHOT_NOTE_MS);
      expect(store.getState().snapshotNote).toBeNull();
    });

    it('does nothing on the home screen, and notes a failure', async () => {
      const { store, api } = setup();
      await store.getState().manualSnapshot();
      expect(api.snapshot).not.toHaveBeenCalled();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      api.open.mockResolvedValue(opened(newBook({ title: 'A' })));
      await store.getState().openProject('/a');
      api.snapshot.mockRejectedValueOnce(new Error('disk full'));
      await store.getState().manualSnapshot();
      expect(store.getState().snapshotNote).toBe('failed');
    });

    it('takes an automatic snapshot only when the book changed since the last one', async () => {
      const { store, editor, api } = setup();
      api.open.mockResolvedValue(opened(newBook({ title: 'A' })));
      await store.getState().openProject('/a');
      const stop = store.getState().startAutoSnapshots(1000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(api.snapshot).not.toHaveBeenCalled(); // unchanged since open

      editor.getState().apply(retitle('A2'), 'Renommer');
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.snapshot).toHaveBeenCalledTimes(1);
      expect(api.snapshot).toHaveBeenLastCalledWith('auto');
      await vi.advanceTimersByTimeAsync(3000);
      expect(api.snapshot).toHaveBeenCalledTimes(1); // nothing new

      editor.getState().apply(retitle('A3'), 'Renommer');
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.snapshot).toHaveBeenCalledTimes(2);
      stop();
      editor.getState().apply(retitle('A4'), 'Renommer');
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.snapshot).toHaveBeenCalledTimes(2);
    });

    it('a manual snapshot counts as the baseline of the automatic ones', async () => {
      const { store, editor, api } = setup();
      api.open.mockResolvedValue(opened(newBook({ title: 'A' })));
      await store.getState().openProject('/a');
      editor.getState().apply(retitle('A2'), 'Renommer');
      await store.getState().manualSnapshot();
      store.getState().startAutoSnapshots(1000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(api.snapshot).toHaveBeenCalledTimes(1); // the manual one only
    });
  });
});
