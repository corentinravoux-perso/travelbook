import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook, pageCount, type Book } from '@travelbook/core';
import {
  listSnapshots,
  pruneSnapshots,
  readSnapshot,
  writeSnapshot,
  AUTO_SNAPSHOTS_KEPT,
} from './snapshots';

let dir: string;
let book: Book;

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(auto|manual)$/;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-snap-'));
  await mkdir(join(dir, 'history'));
  book = newBook({ title: 'Snap', innerSpreads: 3 });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-04T10:20:30.456Z'));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

/** Write `n` snapshots one minute apart starting at `start`. */
async function writeMany(label: 'auto' | 'manual', n: number, start: string): Promise<string[]> {
  const base = new Date(start).getTime();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    vi.setSystemTime(base + i * 60_000);
    ids.push((await writeSnapshot(dir, book, label)).id);
  }
  return ids;
}

describe('writeSnapshot', () => {
  it('writes history/<safe-iso>-<label>.json and describes it', async () => {
    const info = await writeSnapshot(dir, book, 'manual');
    expect(info).toEqual({
      id: '2026-03-04T10-20-30-456Z-manual',
      at: '2026-03-04T10:20:30.456Z',
      label: 'manual',
      pages: pageCount(book),
    });
    expect(await readdir(join(dir, 'history'))).toEqual(['2026-03-04T10-20-30-456Z-manual.json']);
  });

  it('creates history/ when it is missing', async () => {
    await rm(join(dir, 'history'), { recursive: true });
    const info = await writeSnapshot(dir, book, 'auto');
    expect(info.id).toMatch(ID_PATTERN);
    expect(await readdir(join(dir, 'history'))).toHaveLength(1);
  });

  it('never overwrites: two snapshots in the same millisecond get distinct ids', async () => {
    const a = await writeSnapshot(dir, book, 'auto');
    const b = await writeSnapshot(dir, { ...book, title: 'Other' }, 'auto');
    expect(a.id).not.toBe(b.id);
    expect(new Date(b.at).getTime()).toBeGreaterThan(new Date(a.at).getTime());
    expect((await readSnapshot(dir, a.id)).title).toBe('Snap');
    expect((await readSnapshot(dir, b.id)).title).toBe('Other');
  });
});

describe('listSnapshots', () => {
  it('returns [] when there is no history folder', async () => {
    await rm(join(dir, 'history'), { recursive: true });
    expect(await listSnapshots(dir)).toEqual([]);
  });

  it('lists most recent first with label, ISO date and page count', async () => {
    const ids = await writeMany('auto', 2, '2026-01-01T00:00:00.000Z');
    vi.setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    const manual = await writeSnapshot(dir, newBook({ title: 'Long', innerSpreads: 5 }), 'manual');
    const list = await listSnapshots(dir);
    expect(list.map((s) => s.id)).toEqual([manual.id, ids[1], ids[0]]);
    expect(list[0]).toMatchObject({ label: 'manual', pages: 2 * 5 + 2 });
    expect(list[1]).toMatchObject({
      label: 'auto',
      at: '2026-01-01T00:01:00.000Z',
      pages: pageCount(book),
    });
  });

  it('skips unrelated and corrupt files instead of failing', async () => {
    const [good] = await writeMany('auto', 1, '2026-01-01T00:00:00.000Z');
    await writeFile(join(dir, 'history', 'notes.txt'), 'hello');
    await writeFile(join(dir, 'history', '2026-01-02T00-00-00-000Z-auto.json'), '{"trunc');
    expect((await listSnapshots(dir)).map((s) => s.id)).toEqual([good]);
  });
});

describe('readSnapshot', () => {
  it('returns the book stored in the snapshot', async () => {
    const info = await writeSnapshot(dir, book, 'manual');
    expect(await readSnapshot(dir, info.id)).toEqual(book);
  });

  it('rejects ids that are not snapshot ids (no path traversal)', async () => {
    await expect(readSnapshot(dir, '../book')).rejects.toThrow(/snapshot id/i);
    await expect(readSnapshot(dir, '2026-03-04T10-20-30-456Z-other')).rejects.toThrow(
      /snapshot id/i,
    );
    await expect(readSnapshot(dir, '')).rejects.toThrow(/snapshot id/i);
  });

  it('rejects with the file error when the snapshot does not exist', async () => {
    await expect(readSnapshot(dir, '2026-03-04T10-20-30-456Z-auto')).rejects.toThrow(/ENOENT/);
  });
});

describe('pruneSnapshots', () => {
  it('keeps every manual snapshot and the most recent 50 auto ones', async () => {
    expect(AUTO_SNAPSHOTS_KEPT).toBe(50);
    const autoIds = await writeMany('auto', 60, '2026-01-01T00:00:00.000Z');
    const manualIds = await writeMany('manual', 3, '2025-06-01T00:00:00.000Z');

    await pruneSnapshots(dir);

    const left = await listSnapshots(dir);
    expect(left.filter((s) => s.label === 'auto')).toHaveLength(50);
    expect(left.filter((s) => s.label === 'manual')).toHaveLength(3);
    // The 10 oldest auto snapshots are the ones removed.
    const leftIds = new Set(left.map((s) => s.id));
    for (const id of autoIds.slice(0, 10)) expect(leftIds.has(id)).toBe(false);
    for (const id of autoIds.slice(10)) expect(leftIds.has(id)).toBe(true);
    for (const id of manualIds) expect(leftIds.has(id)).toBe(true);
  });

  it('removes nothing when under the limit, and tolerates a missing history folder', async () => {
    await writeMany('auto', 5, '2026-01-01T00:00:00.000Z');
    await pruneSnapshots(dir);
    expect(await listSnapshots(dir)).toHaveLength(5);
    await rm(join(dir, 'history'), { recursive: true });
    await expect(pruneSnapshots(dir)).resolves.toBeUndefined();
  });

  it('leaves unrelated files in history/ alone', async () => {
    await writeMany('auto', 52, '2026-01-01T00:00:00.000Z');
    await writeFile(join(dir, 'history', 'notes.txt'), 'keep me');
    await pruneSnapshots(dir);
    expect(await readdir(join(dir, 'history'))).toContain('notes.txt');
  });
});
