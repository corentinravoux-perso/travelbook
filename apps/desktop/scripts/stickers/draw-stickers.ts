/**
 * Write the drawn sticker sets into `resources/stickers-src/<set>/` (SVG files and `meta.json`):
 *
 *   npm run draw-stickers -w @travelbook/desktop
 *
 * Every SVG of a generated set is rewritten; files whose id no drawing produces any more are
 * removed. The SVG files are committed, so the pack build does not need this script.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
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

export async function drawSet(
  { SET, DRAWINGS }: DrawnSet,
  root = STICKERS_SRC_DIR,
): Promise<number> {
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
  await writeJson(join(dir, 'meta.json'), meta);
  return ids.size;
}

/** Write a JSON file as the repository's Prettier check wants it. */
async function writeJson(file: string, value: unknown): Promise<void> {
  const options = (await resolveConfig(file)) ?? {};
  await writeFile(
    file,
    await format(JSON.stringify(value, null, 2), { ...options, parser: 'json' }),
  );
}

const LICENCES_FILE = join(STICKERS_SRC_DIR, '../LICENCES.json');

/**
 * List every file of `resources/stickers-src/` in `LICENCES.json` (one entry, our own work), as
 * `scripts/resources-licences.test.ts` requires an entry per bundled file.
 */
export async function recordLicences(): Promise<number> {
  const files: string[] = [];
  for (const set of (await readdir(STICKERS_SRC_DIR, { withFileTypes: true })).filter((e) =>
    e.isDirectory(),
  )) {
    for (const name of (await readdir(join(STICKERS_SRC_DIR, set.name))).sort()) {
      files.push(`stickers-src/${set.name}/${name}`);
    }
  }
  const doc = JSON.parse(await readFile(LICENCES_FILE, 'utf8')) as {
    entries: { files: string[]; source: string; author: string; licence: string; url: string }[];
  };
  doc.entries = doc.entries.filter((e) => !e.files.some((f) => f.startsWith('stickers-src/')));
  doc.entries.push({
    files: files.sort(),
    source: 'travelbook',
    author: 'Corentin Ravoux',
    licence: 'MIT',
    url: 'https://github.com/corentinravoux/travelbook',
  });
  await writeJson(LICENCES_FILE, doc);
  return files.length;
}

if (import.meta.main) {
  const only = process.argv[2];
  for (const set of DRAWN_SETS) {
    if (only !== undefined && set.SET.id !== only) continue;
    console.log(`draw-stickers: ${set.SET.id}: ${await drawSet(set)} drawings`);
  }
  console.log(`draw-stickers: LICENCES.json lists ${await recordLicences()} files`);
}
