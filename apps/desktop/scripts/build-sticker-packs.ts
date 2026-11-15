/**
 * Builds the offline sticker packs into `resources/stickers/packs/` (git-ignored: it is built in
 * CI, by `npm run build`, `npm run e2e` and before `dist`). Per set it writes `<set>.pack.json`
 * (the SVG bodies) and `<set>.index.json` (a minisearch index over name, category and French
 * keywords), and it writes `manifest.json` (the sets, their licences and the total).
 *
 *   npm run stickers -w @travelbook/desktop      build, or do nothing when it is up to date
 *   npm run stickers -w @travelbook/desktop -- --force
 *
 * Sources are the `@iconify-json/*` packages (devDependencies, pinned). A set whose licence in
 * its `info.json` is not MIT, Apache-2.0, CC0, CC-BY or CC-BY-SA is dropped and logged. French
 * keywords: for the emoji sets and the flags, the French CLDR annotations of `emojibase-data`,
 * joined through the set's code-point table (`chars.json`); for every set, the hand-written
 * `resources/stickers/fr-keywords.json` (French word to English icon words), used backwards: an
 * icon whose name contains `suitcase` gets `valise`.
 *
 * The drawn sets of `resources/stickers-src/` come first (our own drawings, MIT, see
 * `scripts/stickers/local-sets.ts`). Then comes `affiches`, the poster illustrations of `resources/posters/` (our own
 * drawings, see `scripts/posters/affiches-set.ts`). It is skipped while that folder is empty.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import MiniSearch from 'minisearch';
import {
  ALLOWED_LICENCE,
  isAllowedLicence,
  requiresAttribution,
} from '../src/main/library/stickers/licences.ts';
import { INDEX_OPTIONS, fold, type StickerDoc } from '../src/main/library/stickers/indexConfig.ts';
import {
  AFFICHES_LICENCE,
  AFFICHES_SET,
  POSTERS_DIR,
  illustrationFiles,
  readAffichesSet,
} from './posters/affiches-set.ts';
import { LOCAL_LICENCE, localSetFiles, readLocalSets } from './stickers/local-sets.ts';

const require = createRequire(import.meta.url);

export const STICKERS_DIR = join(import.meta.dirname, '../resources/stickers');
export const PACKS_DIR = join(STICKERS_DIR, 'packs');
export const KEYWORDS_FILE = join(STICKERS_DIR, 'fr-keywords.json');
/** The library's recommended stickers: `["<set>/<id>", …]`, from the open packs, in order. */
export const RECOMMENDED_FILE = join(STICKERS_DIR, 'recommended.json');
const MANIFEST_VERSION = 1;

/** The coloured sets: emoji (matched to CLDR) first, then flags, weather and pictogram packs. */
const COLOUR_SETS = [
  'fluent-emoji-flat',
  'noto',
  'openmoji',
  'twemoji',
  'flag',
  'circle-flags',
  'meteocons',
  'streamline-emojis',
  'streamline-plump-color',
  'streamline-kameleon-color',
  'streamline-ultimate-color',
  'streamline-stickies-color',
  'streamline-freehand-color',
];
/** Emoji sets: names are CLDR names, joined to the annotations by code point. */
const EMOJI_SETS = new Set(['fluent-emoji-flat', 'noto', 'openmoji', 'twemoji']);
/** Flag sets: names are ISO 3166 codes (`is-4x3`, `gb-eng`). */
const FLAG_SETS = new Set(['flag', 'circle-flags']);
/**
 * Ten monochrome sets of travel, weather, map and transport pictograms (plus a lot of general
 * ones), flagged `mono: true`: they draw in `currentColor`. Each is checked against the licence
 * rule like the others.
 */
const MONO_SETS = [
  'doodle-icons',
  'streamline-freehand',
  'pepicons-pencil',
  'tabler',
  'maki',
  'gis',
  'ph',
  'mdi',
  'carbon',
  'iconoir',
  'mingcute',
  'ion',
  'fa6-solid',
];

export { ALLOWED_LICENCE, isAllowedLicence };

interface IconifyInfo {
  name: string;
  author: { name: string; url?: string };
  license: { title: string; spdx?: string; url?: string };
}
interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  hFlip?: boolean;
  vFlip?: boolean;
  rotate?: number;
}
interface IconifyCollection {
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

/** The licence block `StickerHit` and the library carry (Licence of `@travelbook/core`). */
export interface SetLicence {
  source: string;
  author: string;
  licence: string;
  url: string;
  requiresAttribution: boolean;
}

export interface ManifestSet {
  id: string;
  name: string;
  count: number;
  licence: SetLicence;
  mono: boolean;
  pack: string;
  index: string;
  /** The Stickers panel tab: our own drawings ("travelbook") or the open packs ("library"). */
  group: 'travelbook' | 'library';
}
export interface Manifest {
  version: number;
  inputs: string;
  total: number;
  sets: ManifestSet[];
  /** `<set>/<id>` of the library's recommended stickers, in display order. */
  recommended: string[];
  dropped: { id: string; licence: string }[];
}

/** One packed set: SVG bodies by icon name, in the set's own coordinate system. */
export interface Pack {
  width: number;
  height: number;
  icons: Record<string, string>;
  /** `viewBox` of the icons that do not use `0 0 width height`. */
  views?: Record<string, string>;
}

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));
const setFile = (id: string, name: string): string =>
  require.resolve(`@iconify-json/${id}/${name}`);

// ---- keywords -------------------------------------------------------------------------------

/** English icon word to the French words that name it, from the hand-written map. */
async function reverseKeywords(): Promise<Map<string, string[]>> {
  const map: Record<string, string> = await readJson(KEYWORDS_FILE);
  const reverse = new Map<string, Set<string>>();
  for (const [french, english] of Object.entries(map)) {
    for (const word of english.split(/\s+/)) {
      const key = fold(word);
      const known = reverse.get(key) ?? new Set<string>();
      known.add(french);
      reverse.set(key, known);
    }
  }
  return new Map([...reverse].map(([word, set]) => [word, [...set]]));
}

const tokens = (name: string): string[] =>
  name.split(/[^a-z0-9]+/i).filter((t) => t !== '' && !/^\d+$/.test(t));

function frenchFor(name: string, reverse: Map<string, string[]>): string[] {
  const out = new Set<string>();
  for (const token of tokens(name)) {
    const word = fold(token);
    for (const key of [word, word.replace(/(es|s)$/, '')]) {
      for (const french of reverse.get(key) ?? []) out.add(french);
    }
  }
  return [...out];
}

interface Cldr {
  label: string;
  tags: string[];
  category: string;
}

/** French annotations by code points: lower case, dash-joined, without the emoji selector. */
const cldrKey = (hexcode: string): string =>
  hexcode
    .toLowerCase()
    .split('-')
    .filter((part) => part !== 'fe0f')
    .join('-');

async function loadCldr(): Promise<Map<string, Cldr>> {
  interface Emoji {
    label: string;
    hexcode: string;
    tags?: string[];
    group?: number;
    skins?: Emoji[];
  }
  const data = await readJson<Emoji[]>(require.resolve('emojibase-data/fr/data.json'));
  const messages = await readJson<{ groups: { key: string; message: string; order: number }[] }>(
    require.resolve('emojibase-data/fr/messages.json'),
  );
  const groups = new Map(messages.groups.map((g) => [g.order, g.message]));
  const out = new Map<string, Cldr>();
  const add = (e: Emoji, group: number | undefined): void => {
    out.set(cldrKey(e.hexcode), {
      label: e.label,
      tags: e.tags ?? [],
      category: groups.get(group ?? e.group ?? -1) ?? 'divers',
    });
    for (const skin of e.skins ?? []) add(skin, group ?? e.group);
  };
  for (const e of data) add(e, undefined);
  return out;
}

/** The emoji of a flag code: `is` is two regional indicators, `gb-eng` a tag sequence. */
function flagHexcode(code: string): string {
  const letters = code.toLowerCase().split('-').join('');
  if (/^[a-z]{2}$/.test(letters)) {
    return [...letters].map((c) => (0x1f1e6 + c.charCodeAt(0) - 97).toString(16)).join('-');
  }
  const tags = [...letters].map((c) => (0xe0000 + c.charCodeAt(0)).toString(16));
  return ['1f3f4', ...tags, 'e007f'].join('-');
}

/** The name of a country in a language, or undefined when `code` is not a region code. */
function regionName(code: string, locale: string): string | undefined {
  if (!/^[a-z]{2}$/i.test(code)) return undefined;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase());
    return name !== undefined && name !== code.toUpperCase() ? name : undefined;
  } catch {
    return undefined;
  }
}

// ---- icons ----------------------------------------------------------------------------------

const SKIN_VARIANT = /-(light|medium|dark|medium-light|medium-dark)(-skin-tone)?$|-tone[1-5]$/;

/**
 * An icon with its flips and rotation applied to the body, so that the pack holds plain bodies.
 * Returns the body and, when the box is not `0 0 width height`, its `viewBox`.
 */
function bake(
  icon: IconifyIcon,
  setWidth: number,
  setHeight: number,
): { body: string; view?: string } {
  const w = icon.width ?? setWidth;
  const h = icon.height ?? setHeight;
  let body = icon.body;
  let outW = w;
  let outH = h;
  if (icon.hFlip) body = `<g transform="translate(${w} 0) scale(-1 1)">${body}</g>`;
  if (icon.vFlip) body = `<g transform="translate(0 ${h}) scale(1 -1)">${body}</g>`;
  const turns = (icon.rotate ?? 0) % 4;
  if (turns === 1) {
    body = `<g transform="translate(${h} 0) rotate(90)">${body}</g>`;
    [outW, outH] = [h, w];
  } else if (turns === 2) {
    body = `<g transform="translate(${w} ${h}) rotate(180)">${body}</g>`;
  } else if (turns === 3) {
    body = `<g transform="translate(0 ${w}) rotate(270)">${body}</g>`;
    [outW, outH] = [h, w];
  }
  const left = icon.left ?? 0;
  const top = icon.top ?? 0;
  const standard = left === 0 && top === 0 && outW === setWidth && outH === setHeight;
  return standard ? { body } : { body, view: `${left} ${top} ${outW} ${outH}` };
}

const humanise = (name: string): string => {
  const text = name.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Category per icon from a set's `metadata.json` (`categories: { Name: [icons] }`), if it has one. */
async function metadataCategories(id: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const meta = await readJson<{ categories?: Record<string, string[]> }>(
    setFile(id, 'metadata.json'),
  ).catch(() => ({}) as { categories?: Record<string, string[]> });
  for (const [category, names] of Object.entries(meta.categories ?? {})) {
    for (const name of names) out.set(name, category.replace(/([a-z])([A-Z])/g, '$1 $2'));
  }
  return out;
}

interface BuiltSet {
  manifest: ManifestSet;
}

async function buildSet(
  id: string,
  mono: boolean,
  info: IconifyInfo,
  cldr: Map<string, Cldr>,
  reverse: Map<string, string[]>,
): Promise<BuiltSet> {
  const collection = await readJson<IconifyCollection>(setFile(id, 'icons.json'));
  const width = collection.width ?? 16;
  const height = collection.height ?? 16;
  const emoji = EMOJI_SETS.has(id);
  const flags = FLAG_SETS.has(id);

  // Name to code points, for the emoji sets.
  const hexByName = new Map<string, string>();
  if (emoji) {
    const chars = await readJson<Record<string, string>>(setFile(id, 'chars.json'));
    for (const [hex, name] of Object.entries(chars)) {
      if (!hexByName.has(name)) hexByName.set(name, cldrKey(hex));
    }
  }
  const categories = await metadataCategories(id);
  const aliases = new Map<string, string[]>();
  for (const [alias, { parent }] of Object.entries(collection.aliases ?? {})) {
    aliases.set(parent, [...(aliases.get(parent) ?? []), alias]);
  }

  const pack: Pack = { width, height, icons: {} };
  const docs: StickerDoc[] = [];
  const names = Object.keys(collection.icons).sort();
  for (const name of names) {
    if (emoji && SKIN_VARIANT.test(name)) continue;
    const icon = collection.icons[name] as IconifyIcon;
    const baked = bake(icon, width, height);
    pack.icons[name] = baked.body;
    if (baked.view !== undefined) (pack.views ??= {})[name] = baked.view;

    let title = humanise(name);
    let category = categories.get(name) ?? 'Divers';
    const keywords = new Set<string>(aliases.get(name)?.map((a) => a.replace(/-/g, ' ')));
    let annotation: Cldr | undefined;
    if (emoji) {
      const hex = hexByName.get(name);
      annotation = hex === undefined ? undefined : cldr.get(hex);
    } else if (flags) {
      const code = name.replace(/-(1x1|4x3)$/, '');
      annotation = cldr.get(flagHexcode(code));
      if (annotation === undefined) {
        const french = regionName(code, 'fr');
        if (french !== undefined) {
          annotation = {
            label: `drapeau : ${french}`,
            tags: ['drapeau', french],
            category: 'drapeaux',
          };
        }
      }
      const english = regionName(code, 'en');
      if (english !== undefined) keywords.add(english);
      keywords.add('flag drapeau pays');
    }
    if (annotation !== undefined) {
      title = capitalise(annotation.label);
      category = annotation.category;
      keywords.add(annotation.label);
      for (const tag of annotation.tags) keywords.add(tag);
    }
    for (const french of frenchFor(name, reverse)) keywords.add(french);
    docs.push({
      id: name,
      name,
      category,
      kw: [...keywords].join(' '),
      title: flags && name.endsWith('-1x1') ? `${title} (carré)` : title,
    });
  }

  const index = new MiniSearch<StickerDoc>(INDEX_OPTIONS);
  index.addAll(docs);
  await writeFile(join(PACKS_DIR, `${id}.pack.json`), JSON.stringify(pack));
  await writeFile(join(PACKS_DIR, `${id}.index.json`), JSON.stringify(index));

  const spdx = info.license.spdx as string;
  return {
    manifest: {
      id,
      name: info.name,
      count: docs.length,
      licence: {
        source: `Iconify: ${info.name}`,
        author: info.author.name,
        licence: spdx,
        url: info.author.url ?? info.license.url ?? '',
        requiresAttribution: requiresAttribution(spdx),
      },
      mono,
      pack: `${id}.pack.json`,
      index: `${id}.index.json`,
      group: 'library',
    },
  };
}

/** The local `affiches` set, or null while it has no illustration. */
async function buildAffiches(): Promise<ManifestSet | null> {
  const set = await readAffichesSet();
  if (set === null) return null;
  const { id, name } = AFFICHES_SET;
  const index = new MiniSearch<StickerDoc>(INDEX_OPTIONS);
  index.addAll(set.docs);
  await writeFile(join(PACKS_DIR, `${id}.pack.json`), JSON.stringify(set.pack));
  await writeFile(join(PACKS_DIR, `${id}.index.json`), JSON.stringify(index));
  return {
    id,
    name,
    count: set.docs.length,
    licence: AFFICHES_LICENCE,
    mono: false,
    pack: `${id}.pack.json`,
    index: `${id}.index.json`,
    group: 'travelbook',
  };
}

/** The drawn sets of `resources/stickers-src/`. */
async function buildLocalSets(): Promise<ManifestSet[]> {
  const sets = await readLocalSets();
  const out: ManifestSet[] = [];
  for (const set of sets) {
    if (set.docs.length === 0) continue;
    const index = new MiniSearch<StickerDoc>(INDEX_OPTIONS);
    index.addAll(set.docs);
    await writeFile(join(PACKS_DIR, `${set.id}.pack.json`), JSON.stringify(set.pack));
    await writeFile(join(PACKS_DIR, `${set.id}.index.json`), JSON.stringify(index));
    out.push({
      id: set.id,
      name: set.name,
      count: set.docs.length,
      licence: LOCAL_LICENCE,
      mono: false,
      pack: `${set.id}.pack.json`,
      index: `${set.id}.index.json`,
      group: 'travelbook',
    });
  }
  return out;
}

/**
 * The recommended stickers, checked: each one must be in a built "library" set (our own drawings
 * have their own tab), and none twice.
 */
async function readRecommended(sets: ManifestSet[]): Promise<string[]> {
  const list = await readJson<string[]>(RECOMMENDED_FILE).catch(() => [] as string[]);
  const icons = new Map<string, Set<string>>();
  const seen = new Set<string>();
  for (const key of list) {
    const [setId, id] = key.split('/') as [string, string | undefined];
    const set = sets.find((s) => s.id === setId);
    if (set === undefined || set.group !== 'library' || id === undefined) {
      throw new Error(`stickers: recommended.json: ${key} is not in a library set`);
    }
    if (!icons.has(setId)) {
      const pack = await readJson<Pack>(join(PACKS_DIR, set.pack));
      icons.set(setId, new Set(Object.keys(pack.icons)));
    }
    if (!icons.get(setId)!.has(id)) throw new Error(`stickers: recommended.json: no ${key}`);
    if (seen.has(key)) throw new Error(`stickers: recommended.json: ${key} twice`);
    seen.add(key);
  }
  return list;
}

/** Hash of everything the packs are made from; a matching manifest means nothing to rebuild. */
async function inputsHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [
    import.meta.filename,
    join(import.meta.dirname, '../src/main/library/stickers/indexConfig.ts'),
    KEYWORDS_FILE,
    RECOMMENDED_FILE,
    join(import.meta.dirname, 'posters/affiches-set.ts'),
    join(import.meta.dirname, 'stickers/local-sets.ts'),
    ...(await localSetFiles()),
    join(POSTERS_DIR, 'keywords.json'),
    join(POSTERS_DIR, 'destinations.json'),
    ...(await illustrationFiles()).map((name) => join(POSTERS_DIR, 'illustrations', name)),
  ]) {
    hash.update(relative(import.meta.dirname, file));
    hash.update(await readFile(file));
  }
  for (const id of [...COLOUR_SETS, ...MONO_SETS]) {
    const pkg = await readJson<{ version: string }>(setFile(id, 'package.json')).catch(() => null);
    hash.update(`${id}@${pkg?.version ?? 'missing'}`);
  }
  const emojibase = await readJson<{ version: string }>(
    require.resolve('emojibase-data/package.json'),
  );
  hash.update(`emojibase-data@${emojibase.version}`);
  return hash.digest('hex');
}

/** Read the manifest of an existing build, or undefined when there is none. */
export async function readManifest(dir = PACKS_DIR): Promise<Manifest | undefined> {
  return readJson<Manifest>(join(dir, 'manifest.json')).catch(() => undefined);
}

/**
 * Build the packs. Does nothing when `manifest.json` already matches the inputs, unless `force`.
 * Returns the manifest.
 */
export async function buildStickerPacks(
  options: { force?: boolean; log?: (line: string) => void } = {},
): Promise<Manifest> {
  const log = options.log ?? ((line: string) => console.log(line));
  const inputs = await inputsHash();
  const existing = await readManifest();
  if (
    options.force !== true &&
    existing?.version === MANIFEST_VERSION &&
    existing.inputs === inputs &&
    (await Promise.all(existing.sets.map((s) => stat(join(PACKS_DIR, s.pack))))).length ===
      existing.sets.length
  ) {
    return existing;
  }

  await mkdir(PACKS_DIR, { recursive: true });
  await Promise.all(
    (await readdir(PACKS_DIR)).map((name) => rm(join(PACKS_DIR, name), { force: true })),
  );
  const cldr = await loadCldr();
  const reverse = await reverseKeywords();
  const sets: ManifestSet[] = [];
  const dropped: Manifest['dropped'] = [];
  for (const set of await buildLocalSets()) {
    log(`stickers: ${set.id}: ${set.count} drawings (MIT)`);
    sets.push(set);
  }
  const affiches = await buildAffiches();
  if (affiches === null) log('stickers: affiches: no illustration, skipped');
  else {
    log(`stickers: affiches: ${affiches.count} illustrations (MIT)`);
    sets.push(affiches);
  }
  const candidates = [
    ...COLOUR_SETS.map((id) => ({ id, mono: false })),
    ...MONO_SETS.map((id) => ({ id, mono: true })),
  ];
  for (const { id, mono } of candidates) {
    const info = await readJson<IconifyInfo>(setFile(id, 'info.json'));
    if (!isAllowedLicence(info.license.spdx)) {
      const licence = info.license.spdx ?? info.license.title;
      log(`stickers: dropped ${id}: licence ${licence} is not allowed`);
      dropped.push({ id, licence });
      continue;
    }
    const { manifest } = await buildSet(id, mono, info, cldr, reverse);
    log(`stickers: ${id}: ${manifest.count} icons (${manifest.licence.licence})`);
    sets.push(manifest);
  }
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    inputs,
    total: sets.reduce((sum, s) => sum + s.count, 0),
    sets,
    recommended: await readRecommended(sets),
    dropped,
  };
  await writeFile(join(PACKS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log(`stickers: ${manifest.total} icons in ${sets.length} sets`);
  return manifest;
}

if (process.argv[1] === import.meta.filename) {
  await buildStickerPacks({ force: process.argv.includes('--force') });
}
