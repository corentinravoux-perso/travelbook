import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { TemplateSchema, ThemeSchema, type Template, type Theme } from '@travelbook/core';
import { writeFileAtomic } from '../project/atomic-write';
import { libraryDir } from './userLibrary';

const FOLDER = 'templates';
const EXTENSION = '.json';

/**
 * Ids of the user's templates start with this and the bundled ones with `b-`, so a user template
 * can never take the place of a bundled one in a list or a lookup.
 */
export const USER_ID_PREFIX = 'user-';
const BUNDLED_ID_PREFIX = 'b-';

/** Same alphabet as every other id that becomes a file name (see `protocol.ts`): no dot, no separator. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

async function templatesDir(): Promise<string> {
  return join(await libraryDir(), FOLDER);
}

function checkId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid template id: ${JSON.stringify(id)}`);
}

/** A user template id is a plain file name that starts with `user-`. */
function checkUserId(id: string): void {
  checkId(id);
  if (!id.startsWith(USER_ID_PREFIX)) {
    throw new Error(`A user template id starts with "${USER_ID_PREFIX}": ${JSON.stringify(id)}`);
  }
}

/**
 * Keep a template of the user's in `<library>/templates/<id>.json`, replacing the one with the
 * same id. It must pass `TemplateSchema`, have `origin: 'user'` (the bundled templates are not
 * the user's to store) and an id that is safe as a file name and starts with `user-`. Only what the schema knows is
 * written. The file is replaced atomically.
 */
export async function saveUserTemplate(template: Template): Promise<void> {
  const parsed = TemplateSchema.safeParse(template);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new Error(`Not a valid template: ${where}${issue?.message ?? 'invalid'}`);
  }
  const valid = parsed.data;
  checkUserId(valid.id);
  if (valid.origin !== 'user') throw new Error("A user template has origin 'user'");
  const dir = await templatesDir();
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(
    join(dir, `${valid.id}${EXTENSION}`),
    JSON.stringify(valid, null, 2) + '\n',
  );
}

/** The template in one file, or `null` when the file is not a valid user template named for its id. */
async function readTemplate(file: string, id: string): Promise<Template | null> {
  try {
    const parsed = TemplateSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    if (!parsed.success || parsed.data.id !== id || parsed.data.origin !== 'user') return null;
    if (!id.startsWith(USER_ID_PREFIX)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * The user's templates, by name (French order, numbers as numbers), then by id. A file that is
 * not JSON, fails `TemplateSchema`, is not a user template or is named for another id is skipped:
 * one bad file must not hide the others.
 */
export async function listUserTemplates(): Promise<Template[]> {
  const dir = await templatesDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const templates: Template[] = [];
  for (const name of names) {
    if (!name.endsWith(EXTENSION)) continue;
    const id = name.slice(0, -EXTENSION.length);
    if (!ID_PATTERN.test(id)) continue;
    const template = await readTemplate(join(dir, name), id);
    if (template !== null) templates.push(template);
  }
  return templates.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'fr', { numeric: true }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Delete a user template; one that is not there is not an error. */
export async function deleteUserTemplate(id: string): Promise<void> {
  checkUserId(id);
  await rm(join(await templatesDir(), `${id}${EXTENSION}`), { force: true });
}

/** The bundled templates and themes, as the app ships them. */
export interface BundledTemplates {
  templates: Template[];
  themes: Theme[];
}

const THEMES_FILE = 'themes.json';

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The bundled templates: every `<resources>/templates/*.json` except `themes.json` holds a list of
 * templates, `themes.json` the themes. What does not belong is left out and the rest still loads:
 * a file that is not a list, an entry that fails `TemplateSchema`, is not `origin: 'bundled'`, has
 * no `b-` id or repeats an id, and a theme that fails `ThemeSchema` or whose cover is not a cover
 * template carrying the theme's id. A folder that is not there is an error. Files are read in
 * name order, so the order is the same on every machine.
 */
export async function loadBundledTemplates(resourcesDir: string): Promise<BundledTemplates> {
  const dir = join(resourcesDir, FOLDER);
  const names = (await readdir(dir)).filter((name) => name.endsWith(EXTENSION)).sort();
  const templates: Template[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (name === THEMES_FILE) continue;
    const list = await readJson(join(dir, name));
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const parsed = TemplateSchema.safeParse(entry);
      if (!parsed.success) continue;
      const template = parsed.data;
      if (template.origin !== 'bundled' || !template.id.startsWith(BUNDLED_ID_PREFIX)) continue;
      if (seen.has(template.id)) continue;
      seen.add(template.id);
      templates.push(template);
    }
  }
  const themes: Theme[] = [];
  const entries = await readJson(join(dir, THEMES_FILE));
  for (const entry of Array.isArray(entries) ? entries : []) {
    const parsed = ThemeSchema.safeParse(entry);
    if (!parsed.success) continue;
    const cover = templates.find((t) => t.id === parsed.data.coverTemplateId);
    if (cover?.category !== 'couverture' || cover.themeId !== parsed.data.id) continue;
    themes.push(parsed.data);
  }
  return { templates, themes };
}

let bundledDir: string | null = null;
let bundled: Promise<BundledTemplates> | null = null;

/** Tell the app where the bundled resources are (`null` forgets them). Call it once at start-up. */
export function setBundledResourcesDir(dir: string | null): void {
  bundledDir = dir;
  bundled = null;
}

/** The shipped templates, read once; a failed read is tried again at the next call. */
export function bundledTemplates(): Promise<BundledTemplates> {
  if (bundledDir === null) return Promise.reject(new Error('The bundled resources are not set'));
  if (bundled === null) {
    bundled = loadBundledTemplates(bundledDir);
    bundled.catch(() => {
      bundled = null;
    });
  }
  return bundled;
}
