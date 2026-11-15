/**
 * Builds the bundled fonts: copies the latin woff2 files of the chosen `@fontsource/*` families
 * (regular and bold, with italics where the family has them) into `resources/fonts/<id>/` and
 * writes `resources/fonts.json`, which lists every family with its category, faces and licence.
 * Every family is OFL-1.1 or Apache-2.0, and its LICENSE text is copied next to its files. The files are committed; `fonts.test.ts` checks the list
 * against the files and that every face has the glyphs French needs.
 *
 *   npm run fonts -w @travelbook/desktop    write the files
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { format, resolveConfig } from 'prettier';

export const RESOURCES_DIR = join(import.meta.dirname, '../resources');
export const FONTS_DIR = join(RESOURCES_DIR, 'fonts');
export const LIST_FILE = join(RESOURCES_DIR, 'fonts.json');

export type FontCategory = 'manuscrite' | 'serif' | 'sans' | 'titre' | 'machine';

/** The generic family each category falls back to in CSS. */
export const GENERIC: Record<FontCategory, string> = {
  manuscrite: 'cursive',
  serif: 'serif',
  sans: 'sans-serif',
  titre: 'sans-serif',
  machine: 'monospace',
};

/** The families we ship, by Fontsource id. The first six are the ones the text editor started with. */
export const FAMILIES: [id: string, category: FontCategory][] = [
  ['caveat', 'manuscrite'],
  ['dancing-script', 'manuscrite'],
  ['pacifico', 'manuscrite'],
  ['shadows-into-light', 'manuscrite'],
  ['indie-flower', 'manuscrite'],
  ['kalam', 'manuscrite'],
  ['satisfy', 'manuscrite'],
  ['amatic-sc', 'manuscrite'],
  ['lora', 'serif'],
  ['playfair-display', 'serif'],
  ['cormorant-garamond', 'serif'],
  ['merriweather', 'serif'],
  ['libre-baskerville', 'serif'],
  ['eb-garamond', 'serif'],
  ['crimson-text', 'serif'],
  ['source-serif-4', 'serif'],
  ['pt-serif', 'serif'],
  ['inter', 'sans'],
  ['open-sans', 'sans'],
  ['roboto', 'sans'],
  ['lato', 'sans'],
  ['montserrat', 'sans'],
  ['poppins', 'sans'],
  ['nunito', 'sans'],
  ['work-sans', 'sans'],
  ['raleway', 'sans'],
  ['dm-sans', 'sans'],
  ['oswald', 'titre'],
  ['bebas-neue', 'titre'],
  ['abril-fatface', 'titre'],
  ['anton', 'titre'],
  ['lobster', 'titre'],
  ['cinzel', 'titre'],
  ['alfa-slab-one', 'titre'],
  ['yeseva-one', 'titre'],
  // The poster covers' title face (Affiches): chunky, rounded, slightly condensed.
  ['lilita-one', 'titre'],
  ['special-elite', 'machine'],
  ['courier-prime', 'machine'],
  ['ibm-plex-mono', 'machine'],
  ['space-mono', 'machine'],
  ['jetbrains-mono', 'machine'],
  ['roboto-mono', 'machine'],
];

/** Weights shipped: regular and bold. */
const WEIGHTS = [400, 700];
const ALLOWED_LICENCES = new Set(['OFL-1.1', 'Apache-2.0']);

export interface FontEntry {
  id: string;
  family: string;
  category: FontCategory;
  /** The CSS `font-family` value stored in a text: `'Lora', serif`. */
  css: string;
  licence: {
    source: string;
    author: string;
    licence: string;
    url: string;
    requiresAttribution: false;
  };
  /** `file` is relative to `resources/fonts/`. */
  faces: { weight: number; style: 'normal' | 'italic'; file: string }[];
}

interface Metadata {
  id: string;
  family: string;
  weights: number[];
  styles: string[];
  license: { type: string; attribution?: string };
}

const require = createRequire(import.meta.url);

async function buildFamily(id: string, category: FontCategory): Promise<FontEntry> {
  const root = dirname(require.resolve(`@fontsource/${id}/package.json`));
  const meta = JSON.parse(await readFile(join(root, 'metadata.json'), 'utf8')) as Metadata;
  if (!ALLOWED_LICENCES.has(meta.license.type)) {
    throw new Error(`${meta.family}: licence ${meta.license.type} is not OFL-1.1 or Apache-2.0`);
  }
  const faces: FontEntry['faces'] = [];
  await mkdir(join(FONTS_DIR, id), { recursive: true });
  // The licence text travels with the files (the OFL asks for it).
  await copyFile(join(root, 'LICENSE'), join(FONTS_DIR, id, 'LICENSE'));
  for (const style of ['normal', 'italic'] as const) {
    if (!meta.styles.includes(style)) continue;
    for (const weight of WEIGHTS) {
      if (!meta.weights.includes(weight)) continue;
      const name = `${id}-latin-${weight}-${style}.woff2`;
      await copyFile(join(root, 'files', name), join(FONTS_DIR, id, name));
      faces.push({ weight, style, file: `${id}/${name}` });
    }
  }
  if (faces.length === 0) throw new Error(`${meta.family}: no regular or bold face`);
  const attribution = (meta.license.attribution ?? '').replace(/\s+/g, ' ').trim();
  return {
    id,
    family: meta.family,
    category,
    css: `'${meta.family}', ${GENERIC[category]}`,
    licence: {
      source: 'Fontsource',
      author: attribution.length > 300 ? `${attribution.slice(0, 297)}...` : attribution,
      licence: meta.license.type,
      url: `https://fontsource.org/fonts/${id}`,
      requiresAttribution: false,
    },
    faces,
  };
}

export async function buildFonts(): Promise<FontEntry[]> {
  await rm(FONTS_DIR, { recursive: true, force: true });
  const fonts: FontEntry[] = [];
  for (const [id, category] of FAMILIES) fonts.push(await buildFamily(id, category));
  const text = JSON.stringify({ version: 1, fonts });
  const options = (await resolveConfig(LIST_FILE)) ?? {};
  await writeFile(LIST_FILE, await format(text, { ...options, filepath: LIST_FILE }));
  return fonts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fonts = await buildFonts();
  const files = fonts.reduce((n, f) => n + f.faces.length, 0);
  console.log(`${fonts.length} families, ${files} files written to resources/fonts`);
}
