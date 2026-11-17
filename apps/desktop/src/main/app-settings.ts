import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { MenuLanguage } from '../shared/api';
import { serialize, writeFileAtomic } from './project/atomic-write';
import { userDataDir } from './user-data';

/** The app's own preferences, in the user's data folder as `app-settings.json`. */
const FILE = 'app-settings.json';
const MenuLanguageSchema = z.enum(['fr', 'en']);

const fileOf = async (): Promise<string> => join(await userDataDir(), FILE);

async function read(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(await fileOf(), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The language of the menu bar: French unless English was chosen (or the file is unreadable). */
export async function menuLanguage(): Promise<MenuLanguage> {
  const parsed = MenuLanguageSchema.safeParse((await read())['menuLanguage']);
  return parsed.success ? parsed.data : 'fr';
}

export async function setMenuLanguage(language: MenuLanguage): Promise<void> {
  const file = await fileOf();
  await serialize(`settings:${file}`, async () => {
    await mkdir(dirname(file), { recursive: true });
    await writeFileAtomic(
      file,
      JSON.stringify({ ...(await read()), menuLanguage: language }, null, 2) + '\n',
    );
  });
}
