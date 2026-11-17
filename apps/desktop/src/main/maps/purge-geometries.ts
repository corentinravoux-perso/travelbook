import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Book } from '@travelbook/core';
import { serialize } from '../project/atomic-write';
import { SNAPSHOT_ID_PATTERN, readSnapshot } from '../project/snapshots';

/** A baked map geometry in `assets/`: `<sha16>.json`, the file of the asset `map-<sha16>`. */
const GEOMETRY_FILE = /^[0-9a-f]{16}\.json$/;

/**
 * Key that `saveGeometryAsset` and the purge share, so a geometry saved (or reused) while the
 * purge runs is never deleted under it.
 */
export const geometryLock = (dir: string): string => `geometry:${resolve(dir)}`;

/** Per project folder, the names written by each purge running there, since it started. */
const running = new Map<string, Set<Set<string>>>();

/**
 * Tell the purges running in `dir` that `name` (`<sha16>.json`) was written or reused: they keep
 * it. Called by `saveGeometryAsset` under `geometryLock`.
 */
export function noteGeometryWritten(dir: string, name: string): void {
  for (const written of running.get(resolve(dir)) ?? []) written.add(name);
}

/** Names of the geometry files (`<sha16>.json`) a book refers to, by asset or by map element. */
function referenced(book: Book, into: Set<string>): void {
  for (const asset of Object.values(book.assets)) {
    if (asset.kind === 'map') into.add(asset.file.replace(/^assets\//, ''));
  }
  for (const spread of [book.cover, ...book.spreads]) {
    for (const el of spread.elements) {
      if (el.type === 'map') into.add(`${el.geometryAssetId.replace(/^map-/, '')}.json`);
    }
  }
}

/**
 * Delete the geometry files of `assets/` (`<sha16>.json`) that neither `book` nor any snapshot
 * of `history/` refers to: maps baked again or deleted leave their old geometry behind. Other
 * files (fonts, stickers, anything not named like a geometry) are never touched, nor is a file
 * saved or reused while the purge runs (a map placed meanwhile). When one snapshot cannot be
 * read, nothing is deleted: restoring it could need any file. Snapshots are read only while a
 * file is still a candidate. Returns the deleted file names.
 */
export async function purgeGeometries(dir: string, book: Book): Promise<string[]> {
  const key = resolve(dir);
  const written = new Set<string>();
  const mine = running.get(key) ?? new Set<Set<string>>();
  mine.add(written);
  running.set(key, mine);
  try {
    return await purge(dir, book, written);
  } finally {
    mine.delete(written);
    if (mine.size === 0) running.delete(key);
  }
}

async function purge(dir: string, book: Book, written: Set<string>): Promise<string[]> {
  let names: string[];
  try {
    names = (await readdir(join(dir, 'assets'))).filter((n) => GEOMETRY_FILE.test(n));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const keep = new Set<string>();
  referenced(book, keep);
  const candidates = new Set(names.filter((n) => !keep.has(n)));
  if (candidates.size === 0) return [];

  let history: string[] = [];
  try {
    history = await readdir(join(dir, 'history'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of history) {
    if (candidates.size === 0) return [];
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    if (!SNAPSHOT_ID_PATTERN.test(id)) continue;
    const used = new Set<string>();
    try {
      referenced(await readSnapshot(dir, id), used);
    } catch {
      return [];
    }
    for (const n of used) candidates.delete(n);
  }

  const deleted: string[] = [];
  for (const name of [...candidates].sort()) {
    await serialize(geometryLock(dir), async () => {
      if (written.has(name)) return;
      await rm(join(dir, 'assets', name), { force: true });
      deleted.push(name);
    });
  }
  return deleted;
}
