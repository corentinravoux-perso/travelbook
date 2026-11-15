/**
 * The local sticker set `affiches`: the poster illustrations of
 * `resources/posters/illustrations/<destination>-<object>.svg`, our own drawings. Each file
 * becomes one icon whose body is the file's inner SVG and whose `viewBox` is the file's own; its
 * category is the destination's label (`destinations.json`) and its French keywords come from
 * `keywords.json`.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { StickerDoc } from '../../src/main/library/stickers/indexConfig.ts';

export const POSTERS_DIR = join(import.meta.dirname, '../../resources/posters');
export const AFFICHES_SET = { id: 'affiches', name: 'Affiches' } as const;
export const AFFICHES_LICENCE = {
  source: 'travelbook',
  author: 'Corentin Ravoux',
  licence: 'MIT',
  url: 'https://github.com/corentinravoux/travelbook',
  requiresAttribution: false,
};

export interface Destination {
  id: string;
  label: string;
}

export interface AffichesSet {
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

/** The illustration files of `dir`, sorted, or none when the folder is missing. */
export async function illustrationFiles(dir = POSTERS_DIR): Promise<string[]> {
  const names = await readdir(join(dir, 'illustrations')).catch(() => [] as string[]);
  return names.filter((n) => n.endsWith('.svg')).sort();
}

/** The destination an illustration id belongs to (longest matching prefix), or undefined. */
export function destinationOf(id: string, destinations: Destination[]): Destination | undefined {
  return destinations
    .filter((d) => id.startsWith(`${d.id}-`) && id.length > d.id.length + 1)
    .sort((a, b) => b.id.length - a.id.length)[0];
}

/** Read the set from `dir`; `null` when there is no illustration. Throws on a malformed file. */
export async function readAffichesSet(dir = POSTERS_DIR): Promise<AffichesSet | null> {
  const files = await illustrationFiles(dir);
  if (files.length === 0) return null;
  const destinations = await readJson<Destination[]>(join(dir, 'destinations.json'));
  const keywords = await readJson<Record<string, string[]>>(join(dir, 'keywords.json'));
  const pack: AffichesSet['pack'] = { width: 100, height: 100, icons: {}, views: {} };
  const docs: StickerDoc[] = [];
  for (const file of files) {
    const id = file.slice(0, -'.svg'.length);
    const destination = destinationOf(id, destinations);
    if (destination === undefined) {
      throw new Error(`posters: ${file}: the id does not start with a known destination`);
    }
    const svg = await readFile(join(dir, 'illustrations', file), 'utf8');
    const root = ROOT.exec(svg);
    const view = root ? VIEWBOX.exec(root[1]!) : null;
    if (!root || !view) throw new Error(`posters: ${file}: no root <svg> with a viewBox`);
    pack.icons[id] = root[2]!.trim();
    pack.views[id] = view[1] ?? view[2]!;
    const object = id.slice(destination.id.length + 1).replace(/-/g, ' ');
    const kw = new Set([
      ...(keywords[id] ?? []),
      ...destination.label.toLowerCase().split(/[\s/]+/),
      'affiche',
    ]);
    kw.delete('');
    docs.push({
      id,
      name: id,
      category: destination.label,
      kw: [...kw].join(' '),
      title: `${destination.label} · ${object}`,
    });
  }
  return { pack, docs };
}
