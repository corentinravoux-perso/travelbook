import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookFormatError, newBook, setIdSource, type AssetRef, type Book } from '@travelbook/core';
import { recentProjects, setUserDataDir } from './recent';
import { createProject, openProject, saveBook, slugify } from './store';

// Pass-through wrapper so a single test can make `rename` fail (atomic-save test).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

let root: string;
let parentDir: string;

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function photoAsset(id: string): AssetRef {
  return {
    id,
    kind: 'photo',
    file: `originals/${id}.jpg`,
    originalName: `${id}.jpg`,
    sha256: 'f'.repeat(64),
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-store-'));
  parentDir = join(root, 'albums');
  await mkdir(parentDir);
  setUserDataDir(join(root, 'userdata'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  setIdSource(null);
  setUserDataDir(null);
  await rm(root, { recursive: true, force: true });
});

describe('slugify', () => {
  it('lowercases, strips diacritics and turns other characters into dashes', () => {
    expect(slugify('Islande été 2026')).toBe('islande-ete-2026');
    expect(slugify('  Côte d’Azur — été !! ')).toBe('cote-d-azur-ete');
    expect(slugify('Ça va?  Œuvre n°1')).toBe('ca-va-oeuvre-n-1');
    expect(slugify('Cœur de Provence')).toBe('coeur-de-provence');
  });

  it('collapses and trims dashes', () => {
    expect(slugify('--a---b--')).toBe('a-b');
  });

  it('falls back to "album" when nothing alphanumeric is left', () => {
    expect(slugify('!!! ???')).toBe('album');
    expect(slugify('')).toBe('album');
  });
});

describe('createProject / openProject', () => {
  it('creates the folder layout and round-trips the book', async () => {
    const created = await createProject({ name: 'Islande été 2026', parentDir });
    expect(created.dir).toBe(join(parentDir, 'islande-ete-2026.travelbook'));
    expect(created.book.title).toBe('Islande été 2026');
    for (const sub of ['originals', 'assets', 'cache', 'history']) {
      expect((await stat(join(created.dir, sub))).isDirectory()).toBe(true);
    }

    const opened = await openProject(created.dir);
    expect(opened.dir).toBe(created.dir);
    expect(opened.book).toEqual(created.book);
    expect(opened.missing).toEqual([]);
  });

  it('honours a custom format', async () => {
    const { book } = await createProject({
      name: 'Carré',
      parentDir,
      format: { width: 200, height: 200 },
    });
    expect(book.format).toEqual({ width: 200, height: 200 });
  });

  it('suffixes an existing folder with -2, then -3', async () => {
    const first = await createProject({ name: 'Islande été 2026', parentDir });
    const second = await createProject({ name: 'Islande été 2026', parentDir });
    const third = await createProject({ name: 'Islande été 2026', parentDir });
    expect(first.dir.endsWith('islande-ete-2026.travelbook')).toBe(true);
    expect(second.dir.endsWith('islande-ete-2026-2.travelbook')).toBe(true);
    expect(third.dir.endsWith('islande-ete-2026-3.travelbook')).toBe(true);
    // Distinct books, each in its own folder.
    expect(second.book.id).not.toBe(first.book.id);
    expect((await openProject(second.dir)).book.id).toBe(second.book.id);
  });

  it('creates a missing parent directory', async () => {
    const nested = join(root, 'a', 'b');
    const { dir } = await createProject({ name: 'Nuit', parentDir: nested });
    expect(dir).toBe(join(nested, 'nuit.travelbook'));
  });

  it('rejects with book.json in the message when the folder has no book.json', async () => {
    const empty = join(root, 'empty.travelbook');
    await mkdir(empty);
    await expect(openProject(empty)).rejects.toThrow(/book\.json/);
    await expect(openProject(empty)).rejects.toBeInstanceOf(BookFormatError);
    await expect(openProject(join(root, 'does-not-exist'))).rejects.toThrow(/book\.json/);
  });

  it('rejects a book written by a newer schema version', async () => {
    const { dir, book } = await createProject({ name: 'Futur', parentDir });
    await writeFile(join(dir, 'book.json'), JSON.stringify({ ...book, schemaVersion: 2 }));
    await expect(openProject(dir)).rejects.toThrow(/version plus récente/);
  });

  it('rejects a book.json that is not valid JSON', async () => {
    const { dir } = await createProject({ name: 'Cassé', parentDir });
    await writeFile(join(dir, 'book.json'), '{"schemaVersion": 1, ');
    await expect(openProject(dir)).rejects.toThrow(/book\.json/);
    await expect(openProject(dir)).rejects.toBeInstanceOf(BookFormatError);
  });

  it('records the project in the recent list, most recent first', async () => {
    const a = await createProject({ name: 'Premier', parentDir });
    const b = await createProject({ name: 'Second', parentDir });
    expect((await recentProjects()).map((r) => r.dir)).toEqual([b.dir, a.dir]);
    await openProject(a.dir);
    const recent = await recentProjects();
    expect(recent.map((r) => r.dir)).toEqual([a.dir, b.dir]);
    expect(recent[0]?.title).toBe('Premier');
  });

  it('still opens and creates when the recent list cannot be written', async () => {
    // userData "directory" is a regular file: every write under it fails.
    const blocker = join(root, 'blocker');
    await writeFile(blocker, 'x');
    setUserDataDir(blocker);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dir } = await createProject({ name: 'Résilient', parentDir });
    await expect(openProject(dir)).resolves.toMatchObject({ dir });
    expect(warn).toHaveBeenCalled();
  });
});

describe('missing assets and cache (review focus 2)', () => {
  it('recreates cache/ and reports the asset whose original is gone', async () => {
    const { dir, book } = await createProject({ name: 'Voyage', parentDir });
    const withAssets: Book = {
      ...book,
      assets: { a1: photoAsset('a1'), a2: photoAsset('a2') },
    };
    await writeFile(join(dir, 'originals', 'a1.jpg'), 'one');
    await writeFile(join(dir, 'originals', 'a2.jpg'), 'two');
    await saveBook(dir, withAssets);

    await rm(join(dir, 'cache'), { recursive: true });
    await rm(join(dir, 'originals', 'a2.jpg'));

    const opened = await openProject(dir);
    expect(opened.missing).toEqual(['a2']);
    expect(opened.book.assets['a2']).toBeDefined();
    expect((await stat(join(dir, 'cache'))).isDirectory()).toBe(true);
  });

  it('treats an asset whose file escapes the project folder as missing', async () => {
    const { dir, book } = await createProject({ name: 'Piège', parentDir });
    const outside = join(root, 'secret.jpg');
    await writeFile(outside, 'secret');
    const escaping: AssetRef = { ...photoAsset('evil'), file: '../../secret.jpg' };
    await saveBook(dir, { ...book, assets: { evil: escaping } });
    expect((await openProject(dir)).missing).toEqual(['evil']);
  });

  it('does not mistake a file name starting with two dots for an escape', async () => {
    const { dir, book } = await createProject({ name: 'Points', parentDir });
    await writeFile(join(dir, '..odd.jpg'), 'x');
    await saveBook(dir, { ...book, assets: { odd: { ...photoAsset('odd'), file: '..odd.jpg' } } });
    expect((await openProject(dir)).missing).toEqual([]);
  });
});

describe('saveBook', () => {
  it('persists the new content', async () => {
    const { dir, book } = await createProject({ name: 'Avant', parentDir });
    await saveBook(dir, { ...book, title: 'Après' });
    expect((await openProject(dir)).book.title).toBe('Après');
    expect(await exists(join(dir, 'book.json.tmp'))).toBe(false);
  });

  it('keeps the previous book.json when the final rename fails (atomic save)', async () => {
    const { dir, book } = await createProject({ name: 'Stable', parentDir });
    const before = await readFile(join(dir, 'book.json'), 'utf8');

    vi.mocked(rename).mockRejectedValueOnce(new Error('simulated rename failure'));
    await expect(saveBook(dir, { ...book, title: 'Perdu' })).rejects.toThrow(
      'simulated rename failure',
    );

    expect(await readFile(join(dir, 'book.json'), 'utf8')).toBe(before);
    expect(await exists(join(dir, 'book.json.tmp'))).toBe(false);
    const opened = await openProject(dir);
    expect(opened.book.title).toBe('Stable');
  });

  it('fsyncs the temporary file before the rename', async () => {
    const { dir, book } = await createProject({ name: 'Durable', parentDir });
    const probe = await open(join(dir, 'probe'), 'w');
    const sync = vi.spyOn(Object.getPrototypeOf(probe) as typeof probe, 'sync');
    await probe.close();
    vi.mocked(rename).mockClear();

    await saveBook(dir, { ...book, title: 'Écrit' });

    expect(sync).toHaveBeenCalledTimes(1);
    const renameOrder = vi.mocked(rename).mock.invocationCallOrder[0] ?? 0;
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(renameOrder);
  });

  it('ignores and removes a leftover book.json.tmp at open', async () => {
    const { dir, book } = await createProject({ name: 'Reste', parentDir });
    await writeFile(join(dir, 'book.json.tmp'), '{"schemaVersion": 1, "trunc');
    const opened = await openProject(dir);
    expect(opened.book).toEqual(book);
    expect(await exists(join(dir, 'book.json.tmp'))).toBe(false);
  });

  it('serialises concurrent saves: the last call wins and the file stays valid', async () => {
    const { dir, book } = await createProject({ name: 'Course', parentDir });
    const saves = Array.from({ length: 8 }, (_, i) => saveBook(dir, { ...book, title: `T${i}` }));
    await Promise.all(saves);
    expect((await openProject(dir)).book.title).toBe('T7');
    expect((await readdir(dir)).sort()).toEqual([
      'assets',
      'book.json',
      'cache',
      'history',
      'originals',
    ]);
  });

  it('writes a book the core can read back identically', async () => {
    const book = newBook({ title: 'Identique', innerSpreads: 3 });
    const dir = join(parentDir, 'manual.travelbook');
    await mkdir(dir);
    await saveBook(dir, book);
    expect((await openProject(dir)).book).toEqual(book);
  });
});
