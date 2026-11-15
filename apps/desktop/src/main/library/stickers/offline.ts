import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import { LicenceSchema, type Licence } from '@travelbook/core';
import { z } from 'zod';
import { INDEX_OPTIONS, fold, type StickerDoc } from './indexConfig';
import type { StickerHit } from './source';

export type { StickerHit };

/** Where the built packs are, below the resources folder. */
const PACKS_FOLDER = 'stickers/packs';

const ManifestSchema = z.object({
  version: z.literal(1),
  sets: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      count: z.number(),
      licence: LicenceSchema,
      mono: z.boolean(),
      pack: z.string().regex(/^[a-z0-9-]+\.pack\.json$/),
      index: z.string().regex(/^[a-z0-9-]+\.index\.json$/),
    }),
  ),
});
type SetEntry = z.infer<typeof ManifestSchema>['sets'][number];

interface Pack {
  width: number;
  height: number;
  icons: Record<string, string>;
  views?: Record<string, string>;
}

let resourcesDir: string | null = null;
let manifest: SetEntry[] | null = null;
const indexes = new Map<string, MiniSearch<StickerDoc>>();
/** Packs are big (up to a few MB each): only the last few used stay in memory. */
const packs = new Map<string, Pack>();
const MAX_PACKS = 4;

/** Tell the module where the bundled resources are (`null` forgets them). Call once at start-up. */
export function setStickersResourcesDir(dir: string | null): void {
  resourcesDir = dir;
  manifest = null;
  indexes.clear();
  packs.clear();
}

function packsDir(): string {
  if (resourcesDir === null) throw new Error('The offline sticker packs are not located');
  return join(resourcesDir, PACKS_FOLDER);
}

function sets(): SetEntry[] {
  if (manifest !== null) return manifest;
  try {
    manifest = ManifestSchema.parse(
      JSON.parse(readFileSync(join(packsDir(), 'manifest.json'), 'utf8')),
    ).sets;
  } catch (error) {
    throw new Error('The offline sticker packs are missing: run `npm run stickers`', {
      cause: error,
    });
  }
  return manifest;
}

/** The sets that are built, in display order. */
export function listOfflineSets(): {
  id: string;
  name: string;
  count: number;
  licence: Licence;
  mono: boolean;
}[] {
  return sets().map(({ id, name, count, licence, mono }) => ({ id, name, count, licence, mono }));
}

/** The index of a set, read the first time it is needed. */
function indexOf(set: SetEntry): MiniSearch<StickerDoc> {
  let index = indexes.get(set.id);
  if (index === undefined) {
    index = MiniSearch.loadJSON<StickerDoc>(
      readFileSync(join(packsDir(), set.index), 'utf8'),
      INDEX_OPTIONS,
    );
    indexes.set(set.id, index);
  }
  return index;
}

function packOf(set: SetEntry): Pack {
  let pack = packs.get(set.id);
  if (pack === undefined) {
    pack = JSON.parse(readFileSync(join(packsDir(), set.pack), 'utf8')) as Pack;
    if (packs.size >= MAX_PACKS) packs.delete(packs.keys().next().value as string);
    packs.set(set.id, pack);
  }
  return pack;
}

/** The licences that never ask for a credit line. */
const NO_ATTRIBUTION = new Set(['MIT', 'Apache-2.0', 'CC0-1.0']);

export interface OfflineQuery {
  set?: string;
  category?: string;
  mono?: boolean;
  /** Only MIT, Apache-2.0 and CC0 sets. */
  noAttribution?: boolean;
  offset: number;
  limit: number;
}

interface Found {
  score: number;
  order: number;
  set: SetEntry;
  id: string;
  title: string;
}

/** `tb://sticker/<set>/<name>.svg`: the file of an offline sticker, see `stickerSvg`. */
const stickerUrl = (set: string, id: string): string => `tb://sticker/${set}/${id}.svg`;

/**
 * Search the offline packs. Words are matched whatever their case or accents (`valise`, `VALISE`
 * and `valisé` find the same stickers), as prefixes, and all of them must match; the name, the
 * category and the French keywords of a sticker are searched. An empty query lists everything the
 * filters allow. The order is by score, then by set order, then by name, so the same query always
 * pages the same way. The index of a set is read the first time a search reaches it.
 */
export function searchOffline(
  q: string,
  opts: OfflineQuery,
): { items: StickerHit[]; total: number } {
  const chosen = sets().filter(
    (set) =>
      (opts.set === undefined || set.id === opts.set) &&
      (opts.mono === undefined || set.mono === opts.mono) &&
      (opts.noAttribution !== true || NO_ATTRIBUTION.has(set.licence.licence)),
  );
  const category = opts.category === undefined ? undefined : fold(opts.category);
  const query = q.trim() === '' ? MiniSearch.wildcard : q;
  const found: Found[] = [];
  chosen.forEach((set, order) => {
    const results = indexOf(set).search(query, {
      filter: category === undefined ? undefined : (r) => fold(String(r.category)) === category,
    });
    for (const r of results) {
      found.push({ score: r.score, order, set, id: String(r.id), title: String(r.title) });
    }
  });
  found.sort(
    (a, b) => b.score - a.score || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const offset = Math.max(0, Math.floor(opts.offset));
  const limit = Math.max(0, Math.floor(opts.limit));
  return {
    total: found.length,
    items: found.slice(offset, offset + limit).map(({ set, id, title }) => ({
      source: set.id,
      id,
      title,
      thumbUrl: stickerUrl(set.id, id),
      fileUrl: stickerUrl(set.id, id),
      format: 'svg' as const,
      licence: set.licence,
      mono: set.mono,
    })),
  };
}

/** The whole SVG of an offline sticker, or undefined when the set or the icon is unknown. */
export function stickerSvg(setId: string, id: string): string | undefined {
  const set = sets().find((candidate) => candidate.id === setId);
  if (set === undefined) return undefined;
  const pack = packOf(set);
  const body = Object.hasOwn(pack.icons, id) ? pack.icons[id] : undefined;
  if (body === undefined) return undefined;
  const view = pack.views?.[id] ?? `0 0 ${pack.width} ${pack.height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${view}">${body}</svg>`;
}
