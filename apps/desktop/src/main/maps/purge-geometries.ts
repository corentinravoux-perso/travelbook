import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Book } from '@travelbook/core';
import { serialize } from '../project/atomic-write';
import { SNAPSHOT_ID_PATTERN, readSnapshot } from '../project/snapshots';

/** A baked map geometry in `assets/`: `<sha16>.json`, the file of the asset `map-<sha16>`. */
const GEOMETRY_FILE = /^[0-9a-f]{16}\.json$/;

/**
 * Key that `saveGeometryAsset` and the purge share, so a geometry saved (or reused) while the
 * purge runs is never deleted under it.
 */
export const geometryLock = (dir: string): string => `geometry:${dir}`;

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
 * written after the purge started (a map placed meanwhile). When one snapshot cannot be read,
 * nothing is deleted: restoring it could need any file. Returns the deleted file names.
 */
export async function purgeGeometries(dir: string, book: Book): Promise<string[]> {
  const started = Date.now();
  let names: string[];
  try {
    names = (await readdir(join(dir, 'assets'))).filter((n) => GEOMETRY_FILE.test(n));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (names.length === 0) return [];

  const keep = new Set<string>();
  referenced(book, keep);
  let history: string[] = [];
  try {
    history = await readdir(join(dir, 'history'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of history) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    if (!SNAPSHOT_ID_PATTERN.test(id)) continue;
    try {
      referenced(await readSnapshot(dir, id), keep);
    } catch {
      return [];
    }
  }

  const deleted: string[] = [];
  for (const name of names.filter((n) => !keep.has(n)).sort()) {
    const path = join(dir, 'assets', name);
    await serialize(geometryLock(dir), async () => {
      const info = await stat(path).catch(() => null);
      if (info === null || info.mtimeMs >= started) return;
      await rm(path, { force: true });
      deleted.push(name);
    });
  }
  return deleted;
}
