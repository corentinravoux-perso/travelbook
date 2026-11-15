/**
 * Write the drawn sticker sets into `resources/stickers-src/<set>/` (SVG files and `meta.json`):
 *
 *   npm run draw-stickers -w @travelbook/desktop
 *
 * Every SVG of a generated set is rewritten; files whose id no drawing produces any more are
 * removed. The SVG files are committed, so the pack build does not need this script.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Drawing, render } from './draw/core.ts';
import * as boheme from './draw/boheme.ts';
import * as croquis from './draw/croquis.ts';
import * as deco from './draw/deco.ts';
import { STICKERS_SRC_DIR, categoryOf } from './local-sets.ts';

export interface DrawnSet {
  SET: { id: string; name: string; order: number; categories: Record<string, string> };
  DRAWINGS: Drawing[];
}

export const DRAWN_SETS: DrawnSet[] = [croquis, boheme, deco];

export async function drawSet({ SET, DRAWINGS }: DrawnSet, root = STICKERS_SRC_DIR): Promise<number> {
  const dir = join(root, SET.id);
  await mkdir(dir, { recursive: true });
  const ids = new Set<string>();
  const keywords: Record<string, string[]> = {};
  for (const d of DRAWINGS) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(d.id)) throw new Error(`${SET.id}: bad id ${d.id}`);
    if (ids.has(d.id)) throw new Error(`${SET.id}: duplicate id ${d.id}`);
    if (categoryOf(d.id, SET.categories) === undefined) {
      throw new Error(`${SET.id}: ${d.id}: no category prefix`);
    }
    ids.add(d.id);
    if (d.kw?.length) keywords[d.id] = d.kw;
    await writeFile(join(dir, `${d.id}.svg`), render(d));
  }
  for (const name of await readdir(dir)) {
    if (name.endsWith('.svg') && !ids.has(name.slice(0, -4))) await rm(join(dir, name));
  }
  const meta = { name: SET.name, order: SET.order, categories: SET.categories, keywords };
  await writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
  return ids.size;
}

if (import.meta.main) {
  const only = process.argv[2];
  for (const set of DRAWN_SETS) {
    if (only !== undefined && set.SET.id !== only) continue;
    console.log(`draw-stickers: ${set.SET.id}: ${await drawSet(set)} drawings`);
  }
}
