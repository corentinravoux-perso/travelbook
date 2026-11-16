import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAP_LICENCE, type AssetRef } from '@travelbook/core';
import { ID_LENGTH } from '../photos/import';
import { writeFileAtomic } from '../project/atomic-write';

/**
 * Store the baked geometry of a map (what the map dialog computed from the subject's outline)
 * in the project's `assets/` as `assets/<sha16>.json`, with the id `map-<sha16>` (the
 * `<kind>-<sha16>` convention of every asset id). The same text gives the same asset, written
 * once. The text is kept exactly as given: its sha is the asset's. The asset carries
 * `MAP_LICENCE` (ODbL 1.0), which the album's credits list.
 *
 * Only a JSON object is accepted: the renderer decides what is inside, main only keeps it from
 * becoming a file the map cannot read at all.
 */
export async function saveGeometryAsset(
  dir: string,
  json: string,
  meta: { name: string },
): Promise<AssetRef> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error('The map geometry is not a JSON object', { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The map geometry is not a JSON object');
  }
  const bytes = Buffer.from(json, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const hash16 = sha256.slice(0, ID_LENGTH);
  const file = `assets/${hash16}.json`;
  const stored = join(dir, file);
  const there = await stat(stored).then(
    () => true,
    () => false,
  );
  if (!there) {
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFileAtomic(stored, bytes);
  }
  return {
    id: `map-${hash16}`,
    kind: 'map',
    file,
    originalName: `${meta.name}.json`,
    sha256,
    licence: { ...MAP_LICENCE },
  };
}
