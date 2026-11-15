import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../../project/atomic-write';
import { userDataDir } from '../../user-data';

/**
 * The optional keys of the online sources that ask for one (none of the built-in sources does,
 * so the file is usually absent). Kept in the user's data folder as `source-keys.json`; a key
 * never goes back to the renderer, which only learns whether one is stored.
 */
const FILE = 'source-keys.json';
const KeysSchema = z.record(z.string(), z.string());

const fileOf = async (): Promise<string> => join(await userDataDir(), FILE);

async function readKeys(): Promise<Record<string, string>> {
  try {
    return KeysSchema.parse(JSON.parse(await readFile(await fileOf(), 'utf8')));
  } catch {
    return {};
  }
}

export async function sourceKey(sourceId: string): Promise<string | undefined> {
  const key = (await readKeys())[sourceId];
  return key === undefined || key === '' ? undefined : key;
}

export async function hasSourceKey(sourceId: string): Promise<boolean> {
  return (await sourceKey(sourceId)) !== undefined;
}

/** Store the key of a source; an empty (or blank) key forgets it. */
export async function setSourceKey(sourceId: string, key: string): Promise<void> {
  const keys = await readKeys();
  const trimmed = key.trim();
  if (trimmed === '') delete keys[sourceId];
  else keys[sourceId] = trimmed;
  await writeFileAtomic(await fileOf(), JSON.stringify(keys, null, 2) + '\n');
}
