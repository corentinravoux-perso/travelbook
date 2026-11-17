import { createHash } from 'node:crypto';
import { mkdir, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { MAP_LICENCE, MapGeometrySchema, type AssetRef } from '@travelbook/core';
import { ID_LENGTH } from '../photos/import';
import { serialize, writeFileAtomic } from '../project/atomic-write';
import { geometryLock } from './purge-geometries';

/** Largest geometry text kept, in bytes (a whole country is a few hundred kB). */
export const MAX_GEOMETRY_BYTES = 20 * 1024 * 1024;

/**
 * Store the baked geometry of a map (what the map dialog computed from the subject's outline)
 * in the project's `assets/` as `assets/<sha16>.json`, with the id `map-<sha16>` (the
 * `<kind>-<sha16>` convention of every asset id). The same text gives the same asset, written
 * once. The text is kept exactly as given: its sha is the asset's. The asset carries
 * `MAP_LICENCE` (ODbL 1.0), which the album's credits list.
 *
 * Only a valid `MapGeometry` of at most `MAX_GEOMETRY_BYTES` bytes is accepted: main keeps the
 * album from holding a file the map cannot read, or one of any size.
 */
export async function saveGeometryAsset(
  dir: string,
  json: string,
  meta: { name: string },
): Promise<AssetRef> {
  const bytes = Buffer.from(json, 'utf8');
  if (bytes.byteLength > MAX_GEOMETRY_BYTES) {
    throw new Error(`The map geometry is too large (${bytes.byteLength} bytes)`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error('The map geometry is not a JSON object', { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The map geometry is not a JSON object');
  }
  if (!MapGeometrySchema.safeParse(parsed).success) {
    throw new Error('The map geometry is not a map geometry');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const hash16 = sha256.slice(0, ID_LENGTH);
  const file = `assets/${hash16}.json`;
  const stored = join(dir, file);
  // Under the purge's lock, and an existing file is touched: the purge keeps what was written
  // or reused after it started, so a geometry placed while it runs is never deleted.
  await serialize(geometryLock(dir), async () => {
    const there = await stat(stored).then(
      () => true,
      () => false,
    );
    if (there) {
      const now = new Date();
      await utimes(stored, now, now);
    } else {
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFileAtomic(stored, bytes);
    }
  });
  return {
    id: `map-${hash16}`,
    kind: 'map',
    file,
    originalName: `${meta.name}.json`,
    sha256,
    licence: { ...MAP_LICENCE },
  };
}
