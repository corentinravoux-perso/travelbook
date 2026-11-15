import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { LicenceSchema, type AssetRef } from '@travelbook/core';
import { z } from 'zod';
import type { BundledBackground } from '../../shared/api';
import { importAssetFiles } from '../assets/import-files';

/** The list of the bundled patterns and textures, next to the folders it describes. */
export const BACKGROUNDS_LIST = 'backgrounds.json';

const entrySchema = z.object({
  /** `patterns/<name>.<ext>` or `textures/<name>.<ext>`, relative to the resources folder. */
  file: z.string().regex(/^(patterns|textures)\/[A-Za-z0-9_-]+\.(svg|webp|jpg|png)$/),
  kind: z.enum(['pattern', 'texture']),
  title: z.string().min(1),
  source: z.string().min(1),
  author: z.string().min(1),
  licence: z.string().min(1),
  url: z.string().min(1),
});

/**
 * The bundled patterns and textures that `backgrounds.json` lists, in the order of the list. An
 * entry that is malformed, that repeats a file, or whose folder does not match its kind is left
 * out, and so is one whose file is not there: the rest still loads. A list that cannot be read is
 * an error.
 */
export async function loadBundledBackgrounds(resourcesDir: string): Promise<BundledBackground[]> {
  const raw: unknown = JSON.parse(await readFile(join(resourcesDir, BACKGROUNDS_LIST), 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${BACKGROUNDS_LIST} is not a list`);
  const seen = new Set<string>();
  const out: BundledBackground[] = [];
  for (const item of raw) {
    const parsed = entrySchema.safeParse(item);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.file.split('/')[0] !== `${e.kind}s` || seen.has(e.file)) continue;
    const present = await stat(join(resourcesDir, e.file)).then(
      (info) => info.isFile(),
      () => false,
    );
    if (!present) continue;
    seen.add(e.file);
    const licence = LicenceSchema.parse({
      source: e.source,
      author: e.author,
      licence: e.licence,
      url: e.url,
      requiresAttribution: false,
    });
    out.push({ file: e.file, kind: e.kind, title: e.title, licence });
  }
  return out;
}

let bundledDir: string | null = null;
let bundled: Promise<BundledBackground[]> | null = null;

/** Tell the app where the bundled resources are (`null` forgets them). Call it once at start-up. */
export function setBackgroundsResourcesDir(dir: string | null): void {
  bundledDir = dir;
  bundled = null;
}

/** The shipped backgrounds, read once; a failed read is tried again at the next call. */
export function bundledBackgrounds(): Promise<BundledBackground[]> {
  if (bundledDir === null) return Promise.reject(new Error('The bundled resources are not set'));
  if (bundled === null) {
    bundled = loadBundledBackgrounds(bundledDir);
    bundled.catch(() => {
      bundled = null;
    });
  }
  return bundled;
}

/**
 * Copy a bundled pattern (an asset of kind `pattern`) or texture (kind `background`) into the
 * open project's `assets/`. Only a file the list names is taken. The asset carries the licence of
 * the list and the title as its name.
 */
export async function importBundledBackground(dir: string, file: string): Promise<AssetRef> {
  if (bundledDir === null) throw new Error('The bundled resources are not set');
  const entry = (await bundledBackgrounds()).find((b) => b.file === file);
  if (entry === undefined) throw new Error(`Not a bundled background: ${file}`);
  const [asset] = await importAssetFiles(dir, entry.kind === 'pattern' ? 'pattern' : 'background', [
    join(bundledDir, file),
  ]);
  if (asset === undefined) throw new Error(`${entry.title}: nothing was copied`);
  return {
    ...asset,
    originalName: `${entry.title}${extname(file)}`,
    licence: entry.licence,
  };
}
