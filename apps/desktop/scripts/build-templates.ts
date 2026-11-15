/**
 * Builds the bundled templates: `resources/templates/<category>.json` and `themes.json`, from the
 * generators in `scripts/templates/`. The JSON files are committed; `build-templates.test.ts`
 * fails while they differ from what the generators produce, and runs `validateBundled` on them.
 *
 *   npm run templates -w @travelbook/desktop    write the files, then run the check
 *
 * Every layout is our own work (CLEANROOM.md). The generators do not import `@travelbook/core`
 * at run time, so writing the files needs Node alone; `validateBundled` loads it when it runs.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Template, Theme } from '@travelbook/core';
import { format, resolveConfig } from 'prettier';
import { covers } from './templates/covers.ts';
import { openings } from './templates/openings.ts';
import { photoPages } from './templates/photoPages.ts';
import { spreads } from './templates/spreads.ts';
import { textPages } from './templates/texts.ts';
import { themedTemplates, themes } from './templates/themes.ts';

export const TEMPLATES_DIR = join(import.meta.dirname, '../resources/templates');
export const THEMES_FILE = 'themes.json';

/** Which file holds which category, in the order the app lists them. */
export const CATEGORY_FILES: Record<Template['category'], string> = {
  photos: 'photos.json',
  couverture: 'covers.json',
  ouverture: 'openings.json',
  texte: 'texte.json',
  double: 'spreads.json',
};

export interface BundledSet {
  templates: Template[];
  themes: Theme[];
}

/** Every bundled template (the plain ones, then the themed ones) and every theme. */
export function generateTemplates(): BundledSet {
  return {
    templates: [
      ...photoPages(),
      ...covers(),
      ...openings(),
      ...textPages(),
      ...spreads(),
      ...themedTemplates(),
    ],
    themes: themes(),
  };
}

/** The text of every file, by file name, formatted as the repository's Prettier config wants. */
export async function templateFiles(
  set: BundledSet = generateTemplates(),
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const options = await resolveConfig(join(TEMPLATES_DIR, THEMES_FILE));
  const write = async (name: string, data: unknown) =>
    files.set(
      name,
      await format(JSON.stringify(data), { ...options, parser: 'json', filepath: name }),
    );
  for (const [category, file] of Object.entries(CATEGORY_FILES)) {
    await write(
      file,
      set.templates.filter((t) => t.category === category),
    );
  }
  await write(THEMES_FILE, set.themes);
  return files;
}

export async function writeTemplates(dir = TEMPLATES_DIR): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const files = await templateFiles();
  for (const [name, text] of files) await writeFile(join(dir, name), text);
  return [...files.keys()];
}

/** The committed files, read back as a set. */
export async function readTemplates(dir = TEMPLATES_DIR): Promise<BundledSet> {
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(join(dir, name), 'utf8'));
  const templates: Template[] = [];
  for (const file of Object.values(CATEGORY_FILES)) {
    templates.push(...((await read(file)) as Template[]));
  }
  return { templates, themes: (await read(THEMES_FILE)) as Theme[] };
}

// ---------------------------------------------------------------- validation

/** The least the set must hold (design §7.4). */
export const MINIMUMS = {
  photoPages: 75,
  /** Photo pages by photo count: 1, 2, 3, 4, 5 and 6, 7 and more. */
  byCount: [
    { from: 1, to: 1, min: 9 },
    { from: 2, to: 2, min: 9 },
    { from: 3, to: 3, min: 12 },
    { from: 4, to: 4, min: 15 },
    { from: 5, to: 6, min: 14 },
    { from: 7, to: 16, min: 16 },
  ],
  covers: 30,
  openings: 10,
  textOnly: 6,
  spreads: 8,
  total: 129,
  free: 15,
  themes: 3,
  /** Pages (not covers) a theme brings, each with the theme's id and a background. */
  themePages: 3,
} as const;

/** Where a template is laid out to judge its frames: an A4 page (or spread) with a margin and a gap. */
const REFERENCE = {
  page: { w: 210, h: 297 },
  spread: { w: 420, h: 297 },
  margin: 10,
  gap: 4,
  bleed: 3,
};
/** A photo frame this small or this thin cannot be used; a text frame needs a line of text. */
const MIN_PHOTO_SIDE_MM = 15;
const MIN_TEXT_SIDE_MM = 8;
const MAX_ASPECT = 5;

/** The modes the app shows a count in; `validateBundled` wants these where the count allows it. */
function modesOf(t: Template): string[] {
  const roles = new Set<string>();
  const texts = (t.grid ? [] : (t.free?.slots ?? [])).filter((s) => s.kind === 'text');
  for (const slot of texts) roles.add(slot.textRole ?? 'none');
  const walk = (node: NonNullable<Template['grid']>['root']): void => {
    if ('slot' in node) {
      if (node.slot === 'text') roles.add(node.textRole ?? 'none');
      return;
    }
    node.children.forEach(walk);
  };
  if (t.grid) walk(t.grid.root);
  const modes: string[] = [];
  if (t.grid?.fullBleed) modes.push('bleed');
  if (t.grid && !t.grid.fullBleed && roles.size === 0) modes.push('margins');
  if (roles.has('caption')) modes.push('caption');
  if (roles.has('title')) modes.push('title');
  if (roles.has('body') && t.photoCount > 0) modes.push('text');
  return modes;
}

/**
 * Everything that is wrong with `set`, as sentences; empty when it is good to ship. Checks every
 * template with `TemplateSchema` and every theme with `ThemeSchema`, unique `b-` ids, a photo
 * count that matches the photo frames and is at most 16, that every `coverTemplateId` and
 * `themeId` resolves, that frames are usable, and the minimum counts of `MINIMUMS`.
 */
export async function validateBundled(set: BundledSet): Promise<string[]> {
  const { TemplateSchema, ThemeSchema, MAX_TEMPLATE_PHOTOS, layoutTemplate } =
    await import('@travelbook/core');
  const errors: string[] = [];
  const bad = (message: string) => errors.push(message);

  const ids = new Set<string>();
  for (const t of set.templates) {
    const where = `template ${t.id}`;
    const parsed = TemplateSchema.safeParse(t);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      bad(`${where}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid'}`);
      continue;
    }
    if (ids.has(t.id)) bad(`${where}: duplicate id`);
    ids.add(t.id);
    if (!t.id.startsWith('b-')) bad(`${where}: a bundled id starts with "b-"`);
    if (t.origin !== 'bundled') bad(`${where}: origin must be "bundled"`);
    if (t.photoCount > MAX_TEMPLATE_PHOTOS)
      bad(`${where}: more than ${MAX_TEMPLATE_PHOTOS} photos`);

    const isSpread = t.scope === 'spread';
    const box = { x: 0, y: 0, ...(isSpread ? REFERENCE.spread : REFERENCE.page) };
    const slots = layoutTemplate(t, box, REFERENCE.bleed, {
      margin: REFERENCE.margin,
      gap: REFERENCE.gap,
    });
    const photos = slots.filter((s) => s.kind === 'photo');
    if (photos.length !== t.photoCount) {
      bad(`${where}: photoCount is ${t.photoCount} but it has ${photos.length} photo frames`);
    }
    if ((t.category === 'double') !== isSpread)
      bad(`${where}: only "double" templates are spread scope`);
    const framesNote = new Set<string>();
    for (const s of slots) {
      const small = Math.min(s.w, s.h);
      const long = Math.max(s.w, s.h);
      if (s.kind === 'photo' && small < MIN_PHOTO_SIDE_MM)
        framesNote.add('a photo frame is too thin');
      if (s.kind === 'photo' && long / small > MAX_ASPECT) {
        framesNote.add(`a photo frame is more than ${MAX_ASPECT} times longer than wide`);
      }
      if (s.kind === 'text' && small < MIN_TEXT_SIDE_MM) framesNote.add('a text frame is too thin');
    }
    for (const note of framesNote) bad(`${where}: ${note}`);
    if (t.free) {
      for (const s of t.free.slots) {
        if (s.x < -0.03 || s.y < -0.03 || s.x + s.w > 1.03 || s.y + s.h > 1.03) {
          bad(`${where}: a free frame leaves the page`);
        }
      }
    }
    if (t.themeId !== undefined && t.background === undefined)
      bad(`${where}: a themed template needs a background`);
  }

  const byId = new Map(set.templates.map((t) => [t.id, t]));
  const themeIds = new Set<string>();
  for (const theme of set.themes) {
    const where = `theme ${theme.id}`;
    if (!ThemeSchema.safeParse(theme).success) {
      bad(`${where}: not a valid theme`);
      continue;
    }
    if (themeIds.has(theme.id)) bad(`${where}: duplicate id`);
    themeIds.add(theme.id);
    const cover = byId.get(theme.coverTemplateId);
    if (!cover) bad(`${where}: cover template ${theme.coverTemplateId} does not exist`);
    else {
      if (cover.category !== 'couverture') bad(`${where}: its cover is not a cover template`);
      if (cover.themeId !== theme.id) bad(`${where}: its cover does not carry the theme id`);
    }
    const pages = set.templates.filter(
      (t) => t.themeId === theme.id && t.category !== 'couverture' && t.background !== undefined,
    );
    if (pages.length < MINIMUMS.themePages) {
      bad(`${where}: ${pages.length} pages with a background, ${MINIMUMS.themePages} needed`);
    }
    if (theme.fonts.length === 0) bad(`${where}: no fonts`);
  }
  for (const t of set.templates) {
    if (t.themeId !== undefined && !themeIds.has(t.themeId)) {
      bad(`template ${t.id}: theme ${t.themeId} does not exist`);
    }
  }
  if (set.themes.length < MINIMUMS.themes)
    bad(`${set.themes.length} themes, ${MINIMUMS.themes} needed`);

  // Counts.
  const count = (test: (t: Template) => boolean): number => set.templates.filter(test).length;
  const photoPages = set.templates.filter((t) => t.category === 'photos' && t.scope === 'page');
  const atLeast = (what: string, n: number, min: number) => {
    if (n < min) bad(`${n} ${what}, ${min} needed`);
  };
  atLeast('photo pages', photoPages.length, MINIMUMS.photoPages);
  for (const { from, to, min } of MINIMUMS.byCount) {
    const label = from === to ? `${from} photo` : `${from} to ${to} photos`;
    atLeast(
      `photo pages with ${label}`,
      photoPages.filter((t) => t.photoCount >= from && t.photoCount <= to).length,
      min,
    );
  }
  atLeast(
    'covers',
    count((t) => t.category === 'couverture'),
    MINIMUMS.covers,
  );
  atLeast(
    'opening pages',
    count((t) => t.category === 'ouverture'),
    MINIMUMS.openings,
  );
  atLeast(
    'text-only pages',
    count((t) => t.category === 'texte'),
    MINIMUMS.textOnly,
  );
  atLeast(
    'spread templates',
    count((t) => t.category === 'double'),
    MINIMUMS.spreads,
  );
  atLeast('templates', set.templates.length, MINIMUMS.total);
  atLeast(
    'free templates',
    count((t) => t.free !== undefined),
    MINIMUMS.free,
  );

  // Every count from 1 to 16 has pages, in full bleed, with margins and with a caption; up to 6
  // photos there is room for a title and for text too.
  for (let n = 1; n <= MAX_TEMPLATE_PHOTOS; n++) {
    const modes = new Set(photoPages.filter((t) => t.photoCount === n).flatMap(modesOf));
    const wanted =
      n <= 6 ? ['bleed', 'margins', 'caption', 'title', 'text'] : ['bleed', 'margins', 'caption'];
    for (const mode of wanted) {
      if (!modes.has(mode)) bad(`no ${mode} page for ${n} photos`);
    }
  }
  return errors;
}

if (import.meta.main) {
  for (const name of await writeTemplates()) console.log(`Wrote ${join(TEMPLATES_DIR, name)}`);
}
