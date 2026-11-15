import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newElement, type Book } from '@travelbook/core';
import { CHANNEL, type InvokeChannel } from '../shared/channels';
import type { ImportReport, ProjectInfo } from '../shared/api';
import { createHandlers, type HandlerContext, type Host, type IpcHandlers } from './ipc';
import { setFontsResourcesDir } from './library/fonts';
import { setUserDataDir } from './user-data';
import { closeSession } from './session';

/**
 * A photo import that lasts as long as the test wants: a stand-in for 400 photos of 24 MP
 * (57 s measured), run through the real `photos:import` handler and its real queue.
 */
const slow = vi.hoisted(() => {
  const state = {
    started: Promise.resolve(),
    release: () => {},
    notifyStarted: () => {},
  };
  return state;
});
vi.mock('./photos/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photos/import')>()),
  importPhotos: vi.fn(async (): Promise<ImportReport> => {
    slow.notifyStarted();
    await new Promise<void>((resolve) => {
      slow.release = resolve;
    });
    return { added: [], duplicates: [], failed: [] };
  }),
}));

const RESOURCES = join(import.meta.dirname, '../../resources');
const FIXTURE = join(import.meta.dirname, 'library/fixtures/fixture-sans-regular.ttf');

let root: string;
let h: IpcHandlers;
const ctx: HandlerContext = { progress: () => undefined, exportProgress: () => undefined };
const call = <T>(channel: InvokeChannel, ...args: unknown[]): Promise<T> =>
  (h[channel] as IpcHandlers[InvokeChannel])(ctx, ...args) as Promise<T>;

/** Start an import that stays running until `slow.release()`; `done` settles when it ends. */
async function startImport(): Promise<{ done: Promise<ImportReport> }> {
  slow.started = new Promise<void>((resolve) => {
    slow.notifyStarted = resolve;
  });
  const running = call<ImportReport>(CHANNEL.photosImport, [join(root, 'a.jpg')]);
  await slow.started;
  return { done: running };
}

/** The outcome of `promise` if it settles within `ms`, else `'pending'`. */
const settledWithin = (promise: Promise<unknown>, ms: number): Promise<'settled' | 'pending'> =>
  Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);

let created: ProjectInfo;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-save-import-'));
  setUserDataDir(join(root, 'userdata'));
  h = createHandlers({
    pickFolder: async () => null,
    version: () => '1.2.3',
  } as unknown as Host);
  created = await call<ProjectInfo>(CHANNEL.projectCreate, { name: 'Livre', parentDir: root });
});

afterEach(async () => {
  slow.release();
  closeSession();
  setFontsResourcesDir(null);
  setUserDataDir(null);
  await rm(root, { recursive: true, force: true });
});

describe('project:save during a photo import', () => {
  it('is written at once: it does not wait for the import to end', async () => {
    const importing = (await startImport()).done;
    const book: Book = { ...created.book, title: 'Titre pendant import' };

    const save = call(CHANNEL.projectSave, book);
    expect(await settledWithin(save, 1000)).toBe('settled');
    await save;
    expect(JSON.parse(await readFile(join(created.dir, 'book.json'), 'utf8')).title).toBe(
      'Titre pendant import',
    );

    slow.release();
    await importing;
  });

  it('keeps answering while the import runs: every save lands, the last one stays', async () => {
    const importing = (await startImport()).done;
    for (let i = 1; i <= 5; i++) {
      await call(CHANNEL.projectSave, { ...created.book, title: `Version ${i}` });
    }
    expect(JSON.parse(await readFile(join(created.dir, 'book.json'), 'utf8')).title).toBe(
      'Version 5',
    );
    slow.release();
    await importing;
    expect(JSON.parse(await readFile(join(created.dir, 'book.json'), 'utf8')).title).toBe(
      'Version 5',
    );
  });

  it('copies the faces a text uses after the import, and the save does not wait for it', async () => {
    setFontsResourcesDir(RESOURCES);
    await call(CHANNEL.fontsImport, FIXTURE);
    const book: Book = structuredClone(created.book);
    const text = newElement('text', { x: 0, y: 0, w: 50, h: 10 });
    text.style.fontFamily = "'Fixture Sans', sans-serif";
    book.spreads[1]!.elements = [text];

    const importing = (await startImport()).done;
    await call(CHANNEL.projectSave, book);
    expect(await readdir(join(created.dir, 'assets'))).toEqual([]);

    slow.release();
    await importing;
    await vi.waitFor(async () =>
      expect(await readdir(join(created.dir, 'assets'))).toHaveLength(1),
    );
  });
});
