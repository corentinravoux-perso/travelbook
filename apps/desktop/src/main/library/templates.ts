import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { TemplateSchema, type Template } from '@travelbook/core';
import { writeFileAtomic } from '../project/atomic-write';
import { libraryDir } from './userLibrary';

const FOLDER = 'templates';
const EXTENSION = '.json';

/** Same alphabet as every other id that becomes a file name (see `protocol.ts`): no dot, no separator. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

async function templatesDir(): Promise<string> {
  return join(await libraryDir(), FOLDER);
}

function checkId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid template id: ${JSON.stringify(id)}`);
}

/**
 * Keep a template of the user's in `<library>/templates/<id>.json`, replacing the one with the
 * same id. It must pass `TemplateSchema`, have `origin: 'user'` (the bundled templates are not
 * the user's to store) and an id that is safe as a file name. Only what the schema knows is
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
  checkId(valid.id);
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
  checkId(id);
  await rm(join(await templatesDir(), `${id}${EXTENSION}`), { force: true });
}
