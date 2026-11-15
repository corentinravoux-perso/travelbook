import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import * as fontkit from 'fontkit';
import {
  LicenceSchema,
  fontFaceName,
  fontFamiliesUsed,
  parseFontFaceName,
  type AssetRef,
  type Book,
  type Licence,
} from '@travelbook/core';
import { z } from 'zod';
import type { CatalogueEntry, FontCategory, FontFamily, LibraryItem } from '../../shared/api';
import { userDataDir } from '../user-data';
import { addToLibrary, copyIntoProject, listLibrary } from './userLibrary';
import { DiskCache } from './stickers/cache';
import { SourceError, SourceHttp, assertPublicHttps, userAgent } from './stickers/source';

export type { CatalogueEntry, FontCategory, FontFamily };

const CATEGORIES = ['manuscrite', 'serif', 'sans', 'titre', 'machine'] as const;

/** The most a font file may weigh: no text face of ours comes near it. */
const MAX_FONT_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Bundled fonts: resources/fonts.json and the files next to it.
// ---------------------------------------------------------------------------------------------

const FontsFileSchema = z.object({
  version: z.literal(1),
  fonts: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      family: z.string().min(1),
      category: z.enum(CATEGORIES),
      css: z.string(),
      licence: LicenceSchema,
      faces: z.array(
        z.object({
          weight: z.number().int().min(100).max(900),
          style: z.enum(['normal', 'italic']),
          file: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_.-]+\.woff2$/),
        }),
      ),
    }),
  ),
});

let resourcesDir: string | null = null;
let bundled: FontFamily[] | null = null;

/** Tell the module where the bundled resources are (`null` forgets them). */
export function setFontsResourcesDir(dir: string | null): void {
  resourcesDir = dir;
  bundled = null;
}

/** The families that ship with the app, in `fonts.json` order, with `tb://resource` addresses. */
export function bundledFonts(): FontFamily[] {
  if (bundled !== null) return bundled;
  if (resourcesDir === null) throw new Error('The bundled fonts are not located');
  const list = FontsFileSchema.parse(
    JSON.parse(readFileSync(join(resourcesDir, 'fonts.json'), 'utf8')),
  );
  bundled = list.fonts.map((font) => ({
    family: font.family,
    category: font.category,
    origin: 'bundled' as const,
    faces: font.faces.map((face) => ({
      weight: face.weight,
      style: face.style,
      url: `tb://resource/fonts/${face.file}`,
    })),
    licence: font.licence,
  }));
  return bundled;
}

// ---------------------------------------------------------------------------------------------
// The user's fonts: library items of kind `font`, titled `Family|weight|style`.
// ---------------------------------------------------------------------------------------------

const UNKNOWN_LICENCE: Licence = {
  source: 'Fichier importé',
  licence: 'Inconnue',
  url: '',
  requiresAttribution: false,
};

const categoryOf = (item: LibraryItem): FontCategory => {
  const tag = item.tags.find((t) => t.startsWith('category:'))?.slice('category:'.length);
  return CATEGORIES.find((c) => c === tag) ?? 'sans';
};

/** The families of the user library, by name, each with one face per weight and style (the newest). */
async function libraryFonts(): Promise<FontFamily[]> {
  const items = await listLibrary('font');
  const families = new Map<string, FontFamily>();
  for (const item of items) {
    const face = parseFontFaceName(item.title);
    if (face === null) continue;
    let family = families.get(face.family);
    if (family === undefined) {
      family = {
        family: face.family,
        category: categoryOf(item),
        origin: 'library',
        faces: [],
        licence: item.licence ?? UNKNOWN_LICENCE,
      };
      families.set(face.family, family);
    }
    // Newest first: an older file of the same face is a duplicate.
    if (!family.faces.some((f) => f.weight === face.weight && f.style === face.style)) {
      family.faces.push({
        weight: face.weight,
        style: face.style,
        url: `tb://library/${item.id}`,
        itemId: item.id,
      });
    }
  }
  const sorted = [...families.values()].sort((a, b) => a.family.localeCompare(b.family, 'fr'));
  for (const family of sorted) {
    // Upright faces first, then italics, each by weight: the order of `fonts.json`.
    family.faces.sort(
      (a, b) => Number(a.style === 'italic') - Number(b.style === 'italic') || a.weight - b.weight,
    );
  }
  return sorted;
}

/**
 * Every family the editor can offer: the bundled ones first (in `fonts.json` order), then the
 * user's own, by name. A user font with the name of a bundled one is hidden by it: no duplicates.
 */
export async function listFonts(): Promise<FontFamily[]> {
  const base = bundledFonts();
  const names = new Set(base.map((f) => f.family.toLowerCase()));
  const own = (await libraryFonts()).filter((f) => !names.has(f.family.toLowerCase()));
  return [...base, ...own];
}

// ---------------------------------------------------------------------------------------------
// Importing a font file.
// ---------------------------------------------------------------------------------------------

const FONT_FILE_EXTENSIONS = new Set(['.ttf', '.otf', '.woff2']);

const clampWeight = (value: number): number =>
  Number.isFinite(value) ? Math.min(900, Math.max(100, Math.round(value / 100) * 100)) : 400;

/** Read the family, weight and style of a TTF, OTF or WOFF2 file; refuses anything else. */
function describeFont(
  bytes: Buffer,
  name: string,
): { family: string; weight: number; style: 'normal' | 'italic' } {
  let font: fontkit.Font | fontkit.FontCollection;
  try {
    font = fontkit.create(bytes);
  } catch (error) {
    throw new Error('Not a usable font file', { cause: error });
  }
  if (!('familyName' in font)) throw new Error('Unsupported file type: a font collection');
  const family = Array.from(font.familyName ?? '', (c) =>
    c === '|' || c.charCodeAt(0) < 32 ? ' ' : c,
  )
    .join('')
    .trim();
  const subfamily = font.subfamilyName ?? '';
  const weightClass = (font as unknown as { 'OS/2'?: { usWeightClass?: number } })['OS/2']
    ?.usWeightClass;
  return {
    family: family === '' ? name : family,
    weight: clampWeight(weightClass ?? (/bold/i.test(subfamily) ? 700 : 400)),
    style: font.italicAngle !== 0 || /italic|oblique/i.test(subfamily) ? 'italic' : 'normal',
  };
}

/** The family a library item belongs to, as the editor lists it. */
async function familyOfLibrary(name: string): Promise<FontFamily> {
  const found = (await libraryFonts()).find((f) => f.family === name);
  if (found === undefined) throw new Error(`The family ${name} is not in the library`);
  return found;
}

/**
 * Keep a TTF, OTF or WOFF2 file in the user library and give its family. The family, weight and
 * style come from the file itself (its name table and weight class); the file's own name is the
 * family when it states none. A WOFF, a font collection or anything unreadable is refused.
 */
export async function importFontFile(path: string): Promise<FontFamily> {
  const ext = extname(path).toLowerCase();
  if (!FONT_FILE_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type for a font: ${ext || 'no extension'}`);
  }
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_FONT_BYTES) throw new Error('The font file is over the size limit');
  const face = describeFont(bytes, basename(path, extname(path)));
  await addToLibrary(
    'font',
    { path, ext },
    { title: fontFaceName(face), tags: [`family:${face.family}`, 'category:sans'] },
  );
  return familyOfLibrary(face.family);
}

// ---------------------------------------------------------------------------------------------
// The Fontsource catalogue (https://api.fontsource.org, checked 2026-11-15).
//   GET /v1/fonts            every family: { id, family, subsets, weights, styles, category, license }
//   GET /v1/fonts/<id>       one family, with variants[weight][style][subset].url.woff2 (jsDelivr)
// No key. Both answers are cached for 7 days; the files are downloaded from jsDelivr only.
// ---------------------------------------------------------------------------------------------

const API = 'https://api.fontsource.org/v1/fonts';
const FILE_HOST = 'cdn.jsdelivr.net';
const FILE_PATH = '/fontsource/fonts/';
/** The catalogue offers fonts under these licences only: the ones we may keep and embed. */
const ALLOWED_LICENCES = new Set(['OFL-1.1', 'Apache-2.0']);
/** Entries a search returns at most. */
export const CATALOGUE_LIMIT = 40;

const ListSchema = z.array(
  z.object({
    id: z.string(),
    family: z.string(),
    subsets: z.array(z.string()),
    weights: z.array(z.number()),
    styles: z.array(z.string()),
    category: z.string(),
    license: z.string(),
  }),
);

const DetailSchema = z.object({
  id: z.string(),
  family: z.string(),
  category: z.string(),
  license: z.string(),
  variants: z.record(
    z.string(),
    z.record(
      z.string(),
      z.record(z.string(), z.object({ url: z.object({ woff2: z.string().optional() }) })),
    ),
  ),
});

/** Fontsource categories as ours; `undefined` for icon fonts and the like. */
export function categoryFromFontsource(category: string): FontCategory | undefined {
  switch (category) {
    case 'handwriting':
      return 'manuscrite';
    case 'serif':
      return 'serif';
    case 'sans-serif':
      return 'sans';
    case 'display':
      return 'titre';
    case 'monospace':
      return 'machine';
    default:
      return undefined;
  }
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface FontCatalogue {
  search(q: string): Promise<CatalogueEntry[]>;
  /** Download the regular and bold latin files (with italics) of a family. */
  download(id: string): Promise<{
    family: string;
    category: FontCategory;
    licence: Licence;
    faces: { weight: number; style: 'normal' | 'italic'; bytes: Buffer }[];
  }>;
}

export function createFontCatalogue(options: {
  cacheDir: string;
  version: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): FontCatalogue {
  const http = new SourceHttp({
    userAgent: userAgent(options.version),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    cache: new DiskCache(options.cacheDir, options.now ? { now: options.now } : {}),
  });
  return {
    async search(q) {
      const words = fold(q)
        .split(/\s+/)
        .filter((w) => w !== '');
      if (words.length === 0) return [];
      const list = await http.json(API, ListSchema);
      const found: CatalogueEntry[] = [];
      for (const font of list) {
        const category = categoryFromFontsource(font.category);
        if (category === undefined || !ALLOWED_LICENCES.has(font.license)) continue;
        if (!font.subsets.includes('latin')) continue;
        const haystack = fold(`${font.family} ${font.id}`);
        if (!words.every((w) => haystack.includes(w))) continue;
        found.push({ id: font.id, family: font.family, category });
      }
      // A name that starts with the query first, then by name.
      const first = words[0] as string;
      found.sort(
        (a, b) =>
          Number(fold(b.family).startsWith(first)) - Number(fold(a.family).startsWith(first)) ||
          a.family.localeCompare(b.family),
      );
      return found.slice(0, CATALOGUE_LIMIT);
    },
    async download(id) {
      if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new SourceError('notFound', 'Not a font id');
      const detail = await http.json(`${API}/${id}`, DetailSchema);
      const category = categoryFromFontsource(detail.category);
      if (category === undefined || !ALLOWED_LICENCES.has(detail.license)) {
        throw new SourceError('badAnswer', 'This font cannot be added');
      }
      const wanted: { weight: number; style: 'normal' | 'italic'; url: string }[] = [];
      const weights = Object.keys(detail.variants)
        .map(Number)
        .sort((a, b) => a - b);
      const chosen = weights.filter((w) => w === 400 || w === 700);
      for (const weight of chosen.length > 0 ? chosen : weights.slice(0, 1)) {
        for (const style of ['normal', 'italic'] as const) {
          const url = detail.variants[String(weight)]?.[style]?.['latin']?.url.woff2;
          if (url !== undefined) wanted.push({ weight, style, url });
        }
      }
      if (wanted.length === 0) throw new SourceError('badAnswer', 'No latin file for this font');
      const faces: { weight: number; style: 'normal' | 'italic'; bytes: Buffer }[] = [];
      for (const { weight, style, url } of wanted) {
        const checked = assertPublicHttps(url);
        if (checked.hostname !== FILE_HOST || !checked.pathname.startsWith(FILE_PATH)) {
          throw new SourceError('badAnswer', `Refusing to download from ${checked.hostname}`);
        }
        const bytes = await http.bytes(checked.href, MAX_FONT_BYTES);
        try {
          fontkit.create(bytes);
        } catch (error) {
          throw new SourceError('badAnswer', 'The file is not a usable font', { cause: error });
        }
        faces.push({ weight, style, bytes });
      }
      return {
        family: detail.family,
        category,
        licence: {
          source: 'Fontsource',
          licence: detail.license,
          url: `https://fontsource.org/fonts/${detail.id}`,
          requiresAttribution: false,
        },
        faces,
      };
    },
  };
}

let catalogue: Promise<FontCatalogue> | null = null;

function sharedCatalogue(version: () => string): Promise<FontCatalogue> {
  catalogue ??= userDataDir().then((dir) =>
    createFontCatalogue({ cacheDir: join(dir, 'online-cache', 'fontsource'), version: version() }),
  );
  return catalogue;
}

/** Use `value` (or, with `null`, a fresh default) as the catalogue from now on: tests. */
export function setFontCatalogue(value: FontCatalogue | null): void {
  catalogue = value === null ? null : Promise.resolve(value);
}

/** Search the Fontsource catalogue (OFL and Apache fonts with a latin subset). */
export async function searchCatalogue(q: string, version: () => string): Promise<CatalogueEntry[]> {
  return (await sharedCatalogue(version)).search(q);
}

/**
 * Download a family from Fontsource into the user library (its latin regular and bold files, and
 * italics where they exist) and give it as the editor lists it. The same family again changes
 * nothing: the files are the same bytes.
 */
export async function addFromCatalogue(id: string, version: () => string): Promise<FontFamily> {
  const downloaded = await (await sharedCatalogue(version)).download(id);
  for (const face of downloaded.faces) {
    await addToLibrary(
      'font',
      { bytes: face.bytes, ext: 'woff2' },
      {
        title: fontFaceName({ family: downloaded.family, weight: face.weight, style: face.style }),
        tags: [`family:${downloaded.family}`, `category:${downloaded.category}`],
        licence: downloaded.licence,
      },
    );
  }
  return familyOfLibrary(downloaded.family);
}

// ---------------------------------------------------------------------------------------------
// Fonts in an album.
// ---------------------------------------------------------------------------------------------

/**
 * Copy every face of the named user-library families into the album's `assets/` (once, whatever
 * the number of calls) and give the asset records. Families the library does not hold, and the
 * bundled ones (always available), are skipped.
 */
export async function fontAssetsFor(
  dir: string,
  book: Book,
  families: readonly string[],
): Promise<AssetRef[]> {
  // The bundled families are always there: only the others need the library.
  const bundledNames = new Set(bundledFonts().map((f) => f.family.toLowerCase()));
  const wanted = new Set(
    families.map((f) => f.toLowerCase()).filter((name) => !bundledNames.has(name)),
  );
  if (wanted.size === 0) return [];
  const refs: AssetRef[] = [];
  let known = book;
  for (const family of await libraryFonts()) {
    const name = family.family.toLowerCase();
    if (!wanted.has(name)) continue;
    for (const face of family.faces) {
      if (face.itemId === undefined) continue;
      const asset = await copyIntoProject(dir, known, face.itemId);
      refs.push(asset);
      known = { ...known, assets: { ...known.assets, [asset.id]: asset } };
    }
  }
  return refs;
}

/**
 * Run when the album is saved: put the files of the faces its text uses (families of the user
 * library) into `assets/`, so the album carries them. Nothing is copied twice; a family the
 * library does not have is left alone (the album falls back to another font).
 */
export async function ensureFontsInProject(dir: string, book: Book): Promise<void> {
  await fontAssetsFor(dir, book, fontFamiliesUsed(book));
}
