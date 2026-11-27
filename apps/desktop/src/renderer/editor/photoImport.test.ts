import { newBook, type AssetRef, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportReport } from '../../shared/api';
import { createEditorStore } from '../store/editor';
import { createTrayStore, importsSettled } from '../store/tray';
import {
  baseName,
  createPhotoImporter,
  describeFailure,
  droppedPaths,
  withAssets,
} from './photoImport';

const asset = (id: string): AssetRef => ({
  id,
  kind: 'photo',
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
  pixel: { w: 4000, h: 3000 },
});

const report = (parts: Partial<ImportReport>): ImportReport => ({
  added: [],
  duplicates: [],
  restored: [],
  failed: [],
  ...parts,
});

async function setup(reports: ImportReport[] | (() => Promise<ImportReport>)) {
  const editor = createEditorStore({ save: () => Promise.resolve() });
  const book = newBook({ title: 'T', innerSpreads: 2 });
  await editor.getState().openWith(() => Promise.resolve({ dir: '/x', book }));
  const tray = createTrayStore();
  const queue = Array.isArray(reports) ? [...reports] : null;
  const calls: string[][] = [];
  const restoredCalls: string[][] = [];
  const progressListeners: ((done: number, total: number) => void)[] = [];
  const importer = createPhotoImporter({
    editor,
    tray,
    onRestored: (ids) => restoredCalls.push(ids),
    import: (paths) => {
      calls.push(paths);
      if (queue) return Promise.resolve(queue.shift() as ImportReport);
      return (reports as () => Promise<ImportReport>)();
    },
    onProgress: (cb) => {
      progressListeners.push(cb);
      return () => progressListeners.splice(progressListeners.indexOf(cb), 1);
    },
  });
  return { editor, tray, importer, calls, restoredCalls, progressListeners };
}

describe('describeFailure', () => {
  it('turns the English reasons of main into French sentences', () => {
    expect(describeFailure('File not found')).toBe('fichier introuvable');
    expect(describeFailure('Permission denied')).toBe('accès refusé');
    expect(describeFailure('Unsupported file type: .txt')).toBe('format non pris en charge');
    expect(describeFailure('Unsupported image format: gif')).toBe('format non pris en charge');
    expect(describeFailure('The copy does not match the source: the file changed')).toBe(
      "le fichier a changé pendant l'importation",
    );
    expect(describeFailure('vips: premature end of JPEG')).toBe('fichier illisible ou abîmé');
  });
});

describe('baseName', () => {
  it('keeps the file name of a path with either separator', () => {
    expect(baseName('/home/a/Été 2026/IMG_1.jpg')).toBe('IMG_1.jpg');
    expect(baseName('C:\\Photos\\IMG_2.jpg')).toBe('IMG_2.jpg');
  });
});

describe('droppedPaths', () => {
  const file = (name: string) => ({ name }) as File;
  it('names each dropped file through the preload', () => {
    const paths = droppedPaths([file('a.jpg'), file('Été')], (f) => `/p/${f.name}`);
    expect(paths).toEqual(['/p/a.jpg', '/p/Été']);
  });
  it('skips what is not backed by a file, and what makes the preload throw', () => {
    const paths = droppedPaths([file('a'), file('b'), file('c')], (f) => {
      if (f.name === 'a') return '';
      if (f.name === 'b') throw new TypeError('not a File');
      return '/p/c';
    });
    expect(paths).toEqual(['/p/c']);
  });
});

describe('withAssets', () => {
  it('adds the missing assets and returns the same book when there is nothing to add', () => {
    const book = newBook({ title: 'T' });
    const added = withAssets(book, [asset('a'), asset('b')]);
    expect(Object.keys(added.assets)).toEqual(['a', 'b']);
    expect(withAssets(added, [asset('a')])).toBe(added);
  });
});

describe('photo importer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the imported photos to the book as one undo step', async () => {
    const { editor, importer, calls } = await setup([report({ added: [asset('a'), asset('b')] })]);
    const ids = await importer.importPaths(['/p/a.jpg', '/p/b.jpg']);
    expect(ids).toEqual(['a', 'b']);
    expect(calls).toEqual([['/p/a.jpg', '/p/b.jpg']]);
    expect(Object.keys(editor.getState().book!.assets)).toEqual(['a', 'b']);
    expect(editor.getState().history.labels).toEqual(['Importer des photos']);
    editor.getState().undo();
    expect(editor.getState().book!.assets).toEqual({});
  });

  it('names the files that failed, in French, and imports the rest', async () => {
    const { editor, tray, importer } = await setup([
      report({
        added: [asset('a')],
        failed: [
          { path: '/p/notes.txt', reason: 'Unsupported file type: .txt' },
          { path: '/p/broken.jpg', reason: 'vips error' },
        ],
      }),
    ]);
    expect(await importer.importPaths(['x'])).toEqual(['a']);
    expect(tray.getState().failures).toEqual([
      { name: 'notes.txt', reason: 'format non pris en charge' },
      { name: 'broken.jpg', reason: 'fichier illisible ou abîmé' },
    ]);
    expect(Object.keys(editor.getState().book!.assets)).toEqual(['a']);
  });

  it('tells which originals came back, and hands their photos on to be placed', async () => {
    const { editor, tray, importer, restoredCalls } = await setup([
      report({ added: [asset('a')] }),
      report({
        added: [asset('b')],
        restored: [{ path: '/p/Été/a.jpg', assetId: 'a' }],
        duplicates: [{ path: '/p/c.jpg', assetId: 'a' }],
      }),
    ]);
    await importer.importPaths(['/p/a.jpg']);
    expect(restoredCalls).toEqual([[]]);
    const ids = await importer.importPaths(['/p/b.jpg', '/p/Été/a.jpg', '/p/c.jpg']);
    expect(ids).toEqual(['b', 'a']);
    expect(restoredCalls.at(-1)).toEqual(['a']);
    expect(tray.getState().restored).toEqual(['a.jpg']);
    // Nothing was added to the book twice, and the restore is not an undo step of its own.
    expect(Object.keys(editor.getState().book!.assets)).toEqual(['a', 'b']);
  });

  it('forgets the restored files of the previous import', async () => {
    const { tray, importer } = await setup([
      report({ added: [asset('a')] }),
      report({ restored: [{ path: '/p/a.jpg', assetId: 'a' }] }),
      report({ duplicates: [{ path: '/p/a.jpg', assetId: 'a' }] }),
    ]);
    await importer.importPaths(['/p/a.jpg']);
    await importer.importPaths(['/p/a.jpg']);
    expect(tray.getState().restored).toEqual(['a.jpg']);
    await importer.importPaths(['/p/a.jpg']);
    expect(tray.getState().restored).toEqual([]);
  });

  it('clears the failures of the previous import', async () => {
    const { tray, importer } = await setup([
      report({ failed: [{ path: '/p/x.txt', reason: 'Unsupported file type: .txt' }] }),
      report({ added: [asset('a')] }),
    ]);
    await importer.importPaths(['x']);
    expect(tray.getState().failures).toHaveLength(1);
    await importer.importPaths(['y']);
    expect(tray.getState().failures).toEqual([]);
  });

  it('returns the photos the album already had so that they can be placed', async () => {
    const { importer, editor } = await setup([
      report({ added: [asset('a')] }),
      report({ duplicates: [{ path: '/p/a.jpg', assetId: 'a' }] }),
    ]);
    await importer.importPaths(['/p/a.jpg']);
    const before = editor.getState().book;
    expect(await importer.importPaths(['/p/a.jpg'])).toEqual(['a']);
    expect(editor.getState().book).toBe(before); // nothing to add: no empty undo step
    expect(editor.getState().history.labels).toEqual(['Importer des photos']);
  });

  it('puts back a photo whose import was undone, from the record it kept', async () => {
    const { importer, editor } = await setup([
      report({ added: [asset('a')] }),
      report({ duplicates: [{ path: '/p/a.jpg', assetId: 'a' }] }),
    ]);
    await importer.importPaths(['/p/a.jpg']);
    editor.getState().undo();
    expect(editor.getState().book!.assets).toEqual({});
    expect(await importer.importPaths(['/p/a.jpg'])).toEqual(['a']);
    expect(editor.getState().book!.assets['a']).toEqual(asset('a'));
  });

  it('does not offer a duplicate it cannot find', async () => {
    const { importer } = await setup([
      report({ duplicates: [{ path: '/p/z.jpg', assetId: 'z' }] }),
    ]);
    expect(await importer.importPaths(['/p/z.jpg'])).toEqual([]);
  });

  it('reports progress while it runs and clears it after', async () => {
    let finish: (r: ImportReport) => void = () => undefined;
    const { importer, tray, progressListeners } = await setup(
      () => new Promise<ImportReport>((resolve) => (finish = resolve)),
    );
    const done = importer.importPaths(['x']);
    await vi.advanceTimersByTimeAsync(0);
    expect(tray.getState().progress).toEqual({ done: 0, total: 0 });
    progressListeners[0]?.(3, 10);
    expect(tray.getState().progress).toEqual({ done: 3, total: 10 });
    finish(report({ added: [asset('a')] }));
    await done;
    expect(tray.getState().progress).toBeNull();
    expect(progressListeners).toEqual([]); // unsubscribed
  });

  it('says so when the whole import fails, and leaves the book alone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { importer, tray, editor } = await setup(() => Promise.reject(new Error('no project')));
    const before = editor.getState().book;
    expect(await importer.importPaths(['x'])).toEqual([]);
    expect(tray.getState().failures).toEqual([
      { name: null, reason: "L'importation a échoué. Réessayez." },
    ]);
    expect(tray.getState().progress).toBeNull();
    expect(editor.getState().book).toBe(before);
  });

  it('drops the result when another album was opened meanwhile', async () => {
    let finish: (r: ImportReport) => void = () => undefined;
    const { importer, editor } = await setup(
      () => new Promise<ImportReport>((resolve) => (finish = resolve)),
    );
    const done = importer.importPaths(['x']);
    const other: Book = newBook({ title: 'Autre' });
    await editor.getState().openWith(() => Promise.resolve({ dir: '/y', book: other }));
    finish(report({ added: [asset('a')] }));
    expect(await done).toEqual([]);
    expect(editor.getState().book!.assets).toEqual({});
  });

  it('runs imports one after the other', async () => {
    const order: string[] = [];
    const resolvers: ((r: ImportReport) => void)[] = [];
    const { importer, calls } = await setup(() => {
      order.push('start');
      return new Promise<ImportReport>((resolve) => resolvers.push(resolve));
    });
    const first = importer.importPaths(['1']);
    const second = importer.importPaths(['2']);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([['1']]);
    resolvers[0]?.(report({ added: [asset('a')] }));
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([['1'], ['2']]);
    resolvers[1]?.(report({ added: [asset('b')] }));
    expect(await second).toEqual(['b']);
  });

  it('does nothing without an open album or without paths', async () => {
    const { importer, calls } = await setup([]);
    expect(await importer.importPaths([])).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('imports running', () => {
  it('counts an import from the request until its photos are in the book', async () => {
    let answer: (r: ImportReport) => void = () => undefined;
    const { editor, tray, importer } = await setup(
      () => new Promise<ImportReport>((resolve) => (answer = resolve)),
    );
    let settled = false;
    const first = importer.importPaths(['/p/a.jpg']);
    const second = importer.importPaths(['/p/b.jpg']); // queued behind the first
    void importsSettled(tray).then(() => (settled = true));
    expect(tray.getState().running).toBe(2);
    await vi.waitFor(() => expect(tray.getState().progress).not.toBeNull());
    answer(report({ added: [asset('a')] }));
    await first;
    expect(tray.getState().running).toBe(1);
    expect(settled).toBe(false);
    await vi.waitFor(() => expect(tray.getState().progress).not.toBeNull());
    answer(report({ added: [asset('b')] }));
    await second;
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(tray.getState().running).toBe(0);
    expect(Object.keys(editor.getState().book?.assets ?? {}).sort()).toEqual(['a', 'b']);
  });
});
