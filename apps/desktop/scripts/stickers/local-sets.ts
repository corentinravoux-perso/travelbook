/**
 * The local sticker sets drawn for travelbook: `resources/stickers-src/<set>/`, one folder per
 * set, built into packs before the Iconify sets (see `build-sticker-packs.ts`). A set folder
 * holds:
 *
 * - `meta.json`: `{ "name", "order", "categories": { "<prefix>": "<label>" },
 *   "keywords": { "<id>": ["mot", …] } }`;
 * - `<category>-<object>.svg`: one sticker per file, our own drawings (MIT). The category is the
 *   longest prefix of `categories` the id starts with. The body of the root `<svg>` becomes the
 *   icon and its `viewBox` the icon's view, as for the `affiches` set.
 *
 * Most files are written by the generators of `scripts/stickers/` (`npm run draw-stickers`); the
 * SVG files are committed so a build needs no generator.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { StickerDoc } from '../../src/main/library/stickers/indexConfig.ts';

export const STICKERS_SRC_DIR = join(import.meta.dirname, '../../resources/stickers-src');
export const LOCAL_LICENCE = {
  source: 'travelbook',
  author: 'Corentin Ravoux',
  licence: 'MIT',
  url: 'https://github.com/corentinravoux/travelbook',
  requiresAttribution: false,
};

export interface LocalSetMeta {
  name: string;
  /** Sets are listed by increasing order. */
  order: number;
  categories: Record<string, string>;
  keywords?: Record<string, string[]>;
  /** Ids from any set, in the form `<set>/<id>`; used by the `recommandes` set only. */
  picks?: string[];
}

export interface LocalSet {
  id: string;
  name: string;
  order: number;
  /** `<set>/<id>` picks copied into this set by the pack builder (the "Recommandés" set). */
  picks: string[];
  pack: {
    width: number;
    height: number;
    icons: Record<string, string>;
    views: Record<string, string>;
  };
  docs: StickerDoc[];
}

const ROOT = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;
const VIEWBOX = /\sviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/;

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));

/** The set folders of `dir` that hold a `meta.json`, sorted by name. */
export async function localSetIds(dir = STICKERS_SRC_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const ok = await readFile(join(dir, e.name, 'meta.json')).then(
      () => true,
      () => false,
    );
    if (ok) ids.push(e.name);
  }
  return ids.sort();
}

/** Every file a local set is made from (for the inputs hash). */
export async function localSetFiles(dir = STICKERS_SRC_DIR): Promise<string[]> {
  const files: string[] = [];
  for (const id of await localSetIds(dir)) {
    const names = (await readdir(join(dir, id))).filter(
      (n) => n === 'meta.json' || n.endsWith('.svg'),
    );
    files.push(...names.sort().map((n) => join(dir, id, n)));
  }
  return files;
}

/** Split an SVG file into its body and its viewBox. Throws when there is no root with a viewBox. */
export function splitSvg(svg: string, where: string): { body: string; view: string } {
  const root = ROOT.exec(svg);
  const view = root ? VIEWBOX.exec(root[1]!) : null;
  if (!root || !view) throw new Error(`stickers: ${where}: no root <svg> with a viewBox`);
  return { body: root[2]!.trim(), view: view[1] ?? view[2]! };
}

/** The category prefix an id belongs to (longest match), or undefined. */
export function categoryOf(id: string, categories: Record<string, string>): string | undefined {
  return Object.keys(categories)
    .filter((p) => id.startsWith(`${p}-`) && id.length > p.length + 1)
    .sort((a, b) => b.length - a.length)[0];
}

/** Read one drawn set. Throws on a malformed file or an id with no category. */
export async function readLocalSet(id: string, dir = STICKERS_SRC_DIR): Promise<LocalSet> {
  const meta = await readJson<LocalSetMeta>(join(dir, id, 'meta.json'));
  const files = (await readdir(join(dir, id))).filter((n) => n.endsWith('.svg')).sort();
  const pack: LocalSet['pack'] = { width: 100, height: 100, icons: {}, views: {} };
  const docs: StickerDoc[] = [];
  for (const file of files) {
    const name = file.slice(0, -'.svg'.length);
    const prefix = categoryOf(name, meta.categories);
    if (prefix === undefined) throw new Error(`stickers: ${id}/${file}: no known category prefix`);
    const label = meta.categories[prefix]!;
    const { body, view } = splitSvg(await readFile(join(dir, id, file), 'utf8'), `${id}/${file}`);
    pack.icons[name] = body;
    pack.views[name] = view;
    const object = name.slice(prefix.length + 1).replace(/-/g, ' ');
    const kw = new Set([...(meta.keywords?.[name] ?? []), ...label.toLowerCase().split(/[\s/,]+/)]);
    kw.delete('');
    docs.push({
      id: name,
      name,
      category: label,
      kw: [...kw].join(' '),
      title: `${label} · ${object}`,
    });
  }
  return { id, name: meta.name, order: meta.order, picks: meta.picks ?? [], pack, docs };
}

/** Every drawn set, by `order`. */
export async function readLocalSets(dir = STICKERS_SRC_DIR): Promise<LocalSet[]> {
  const sets = await Promise.all((await localSetIds(dir)).map((id) => readLocalSet(id, dir)));
  return sets.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}
