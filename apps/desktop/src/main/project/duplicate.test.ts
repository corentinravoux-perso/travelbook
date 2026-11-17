import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@travelbook/core';
import { setUserDataDir } from '../user-data';
import { duplicateProject } from './duplicate';
import { recentProjects } from './recent';
import { createProject, openProject } from './store';
import { writeSnapshot } from './snapshots';

// Pass-through wrapper so a single test can make `rename` fail.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

let root: string;
let parentDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-dup-'));
  parentDir = join(root, 'albums');
  await mkdir(parentDir);
  setUserDataDir(join(root, 'userdata'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  setUserDataDir(null);
  await rm(root, { recursive: true, force: true });
});

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

describe('duplicateProject', () => {
  it('copies the whole folder with a new id and a "(copie)" title', async () => {
    const original = await createProject({ name: 'Islande', parentDir });
    await writeFile(join(original.dir, 'originals', 'a.jpg'), 'photo-bytes');
    await writeFile(join(original.dir, 'assets', 'b.svg'), '<svg/>');
    await writeSnapshot(original.dir, original.book, 'manual');

    const copy = await duplicateProject(original.dir);

    expect(copy.dir).toBe(join(parentDir, 'islande-copie.travelbook'));
    expect(copy.book.title).toBe('Islande (copie)');
    expect(copy.book.id).not.toBe(original.book.id);
    expect(await readFile(join(copy.dir, 'originals', 'a.jpg'), 'utf8')).toBe('photo-bytes');
    expect(await readFile(join(copy.dir, 'assets', 'b.svg'), 'utf8')).toBe('<svg/>');
    const onDisk = JSON.parse(await readFile(join(copy.dir, 'book.json'), 'utf8')) as Book;
    expect(onDisk.id).toBe(copy.book.id);
    expect(onDisk.title).toBe('Islande (copie)');

    // History snapshots follow: new id and title, so a restore never brings the original back.
    const [file] = await readdir(join(copy.dir, 'history'));
    const snap = JSON.parse(await readFile(join(copy.dir, 'history', file!), 'utf8')) as Book;
    expect(snap.id).toBe(copy.book.id);
    expect(snap.title).toBe('Islande (copie)');
  });

  it('leaves the original untouched', async () => {
    const original = await createProject({ name: 'Islande', parentDir });
    const before = await readFile(join(original.dir, 'book.json'), 'utf8');
    await duplicateProject(original.dir);
    expect(await readFile(join(original.dir, 'book.json'), 'utf8')).toBe(before);
    expect((await openProject(original.dir)).book.id).toBe(original.book.id);
  });

  it('numbers the copies: (copie 2), (copie 3)', async () => {
    const original = await createProject({ name: 'Islande', parentDir });
    const one = await duplicateProject(original.dir);
    const two = await duplicateProject(original.dir);
    const three = await duplicateProject(original.dir);
    expect(one.book.title).toBe('Islande (copie)');
    expect(two.book.title).toBe('Islande (copie 2)');
    expect(two.dir).toBe(join(parentDir, 'islande-copie-2.travelbook'));
    expect(three.book.title).toBe('Islande (copie 3)');
  });

  it('puts the copy in the recent list', async () => {
    const original = await createProject({ name: 'Islande', parentDir });
    const copy = await duplicateProject(original.dir);
    const dirs = (await recentProjects()).map((r) => r.dir);
    expect(dirs[0]).toBe(copy.dir);
    expect(dirs).toContain(original.dir);
  });

  it('leaves no folder behind when the copy fails', async () => {
    const original = await createProject({ name: 'Islande', parentDir });
    vi.mocked(rename).mockRejectedValueOnce(new Error('disk full'));
    await expect(duplicateProject(original.dir)).rejects.toThrow('disk full');
    expect(await readdir(parentDir)).toEqual(['islande.travelbook']);
  });

  it('rejects a folder that is not an album and leaves nothing', async () => {
    const empty = join(parentDir, 'vide.travelbook');
    await mkdir(empty);
    await expect(duplicateProject(empty)).rejects.toThrow(/book\.json/);
    expect(await exists(join(parentDir, 'vide-copie.travelbook'))).toBe(false);
    expect(await readdir(parentDir)).toEqual(['vide.travelbook']);
  });
});
