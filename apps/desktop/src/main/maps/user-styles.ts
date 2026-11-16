import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeStyle, type MapPreset, type MapStyle } from '@travelbook/core';
import { z } from 'zod';
import { serialize, writeFileAtomic } from '../project/atomic-write';
import { userDataDir } from '../user-data';

const FILE = 'map-styles.json';
const MAX_NAME = 100;

/**
 * The id of a user style: `user-` and a UUID. A built-in preset has a plain id (`carnet`), so a
 * user style can never take its place in a list or a lookup.
 */
export const USER_STYLE_ID = /^user-[A-Za-z0-9-]{1,64}$/;

const StoredSchema = z.object({
  id: z.string().regex(USER_STYLE_ID),
  name: z.string().trim().min(1).max(MAX_NAME),
  style: z.unknown(),
});

const FileSchema = z.object({ styles: z.array(z.unknown()) });

const checkId = (id: string): void => {
  if (!USER_STYLE_ID.test(id)) throw new Error(`Not a valid style id: ${JSON.stringify(id)}`);
};

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > MAX_NAME) {
    throw new Error(`A style name has 1 to ${MAX_NAME} characters`);
  }
  return trimmed;
}

/**
 * The styles in the file, each completed through `normalizeStyle` (spec 7.9: a style saved by
 * another release keeps its tokens, gets the missing ones and loses the unknown ones). No file
 * yet is no style. An entry that is not a style (bad id or name) or repeats an id is left out:
 * the file is a convenience and one bad entry must not hide the others. A file that is not a
 * styles file at all (hand-edited) is set aside as `map-styles.json.corrupt` and read as empty,
 * so that the next write does not destroy it; any other failure to read is an error, not an
 * empty list, because the next write would replace styles that are only unreadable for now.
 */
async function readStyles(file: string): Promise<MapPreset[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  let parsed: z.infer<typeof FileSchema>;
  try {
    parsed = FileSchema.parse(JSON.parse(text));
  } catch {
    await rename(file, `${file}.corrupt`).catch(() => undefined);
    return [];
  }
  const styles: MapPreset[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.styles) {
    const stored = StoredSchema.safeParse(entry);
    if (!stored.success || seen.has(stored.data.id)) continue;
    seen.add(stored.data.id);
    styles.push({
      id: stored.data.id,
      name: stored.data.name,
      style: normalizeStyle(stored.data.style),
    });
  }
  return styles;
}

/** Run `task` on the styles, one task at a time, and write them back when it returns some. */
async function withStyles<T>(
  task: (styles: MapPreset[]) => { styles?: MapPreset[]; result: T },
): Promise<T> {
  const dir = await userDataDir();
  const file = join(dir, FILE);
  return serialize(`map-styles:${file}`, async () => {
    const { styles, result } = task(await readStyles(file));
    if (styles !== undefined) {
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(file, JSON.stringify({ version: 1, styles }, null, 2) + '\n');
    }
    return result;
  });
}

const byName = (a: MapPreset, b: MapPreset): number =>
  a.name.localeCompare(b.name, 'fr', { numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The user's styles ("modèles"), by name (French order, numbers as numbers), then by id. */
export function listUserStyles(): Promise<MapPreset[]> {
  return withStyles((styles) => ({ result: [...styles].sort(byName) }));
}

/** Keep `style` under `name` as a new user style, and give it with its new id. */
export async function saveUserStyle(name: string, style: MapStyle): Promise<MapPreset> {
  const preset: MapPreset = {
    id: `user-${randomUUID()}`,
    name: checkName(name),
    style: normalizeStyle(style),
  };
  return withStyles((styles) => ({ styles: [...styles, preset], result: preset }));
}

/** Change the name of a user style. Rejects when there is no such style. */
export async function renameUserStyle(id: string, name: string): Promise<void> {
  checkId(id);
  const next = checkName(name);
  return withStyles((styles) => {
    if (!styles.some((s) => s.id === id)) throw new Error(`Unknown style: ${id}`);
    return {
      styles: styles.map((s) => (s.id === id ? { ...s, name: next } : s)),
      result: undefined,
    };
  });
}

/** Delete a user style; one that is not there is not an error. */
export async function deleteUserStyle(id: string): Promise<void> {
  checkId(id);
  return withStyles((styles) => ({
    styles: styles.filter((s) => s.id !== id),
    result: undefined,
  }));
}
