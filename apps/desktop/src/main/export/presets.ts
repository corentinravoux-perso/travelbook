import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ExportOptions, ExportPreset } from '../../shared/api';
import { serialize, writeFileAtomic } from '../project/atomic-write';
import { userDataDir } from '../user-data';
import { DEFAULT_JPEG_QUALITY } from './images';
import { exportOptions } from './options';
import { SCREEN_READING_OPTIONS } from './pdf';

const FILE_NAME = 'export-presets.json';
const FILE_VERSION = 1;
export const MAX_USER_PRESETS = 50;

/**
 * The options every preset starts from. `outDir` is empty in a built-in preset: it has no
 * destination of its own, the dialog keeps the folder the user chose.
 */
const BASE: ExportOptions = {
  route: 'pdf',
  pages: 'all',
  includeCover: true,
  dpi: 300,
  nativeResolution: false,
  bleed: true,
  cropMarks: false,
  imageFormat: 'jpeg',
  jpegQuality: DEFAULT_JPEG_QUALITY,
  perSpread: false,
  coverMode: 'flat',
  outDir: '',
};

/** The three presets of spec §10. They cannot be deleted and their names are taken. */
export const BUILTIN_PRESETS: readonly ExportPreset[] = [
  {
    name: 'Impression sur mesure (PDF)',
    builtin: true,
    options: { ...BASE, route: 'pdf', cropMarks: true },
  },
  {
    name: 'Imprimeur en ligne (images)',
    builtin: true,
    options: { ...BASE, route: 'images', imageFormat: 'jpeg', jpegQuality: 98 },
  },
  {
    name: "Lecture à l'écran",
    builtin: true,
    options: { ...BASE, ...SCREEN_READING_OPTIONS },
  },
];

const nameKey = (name: string): string => name.trim().normalize('NFC').toLocaleLowerCase('fr');

const StoredPreset = z.strictObject({
  name: z.string().trim().min(1).max(200),
  options: exportOptions,
});
const StoredFile = z.strictObject({
  version: z.literal(FILE_VERSION),
  presets: z.array(z.unknown()),
});

async function file(): Promise<string> {
  return join(await userDataDir(), FILE_NAME);
}

/** The user's presets as stored: an unreadable file is empty, an invalid entry is skipped. */
async function readUserPresets(path: string): Promise<ExportPreset[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // Missing or unreadable: presets are a convenience, start again from empty.
    return [];
  }
  const stored = StoredFile.safeParse(parsed);
  if (!stored.success) return [];
  const seen = new Set<string>(BUILTIN_PRESETS.map((p) => nameKey(p.name)));
  const presets: ExportPreset[] = [];
  for (const entry of stored.data.presets) {
    const preset = StoredPreset.safeParse(entry);
    if (!preset.success) continue;
    const key = nameKey(preset.data.name);
    if (seen.has(key)) continue;
    seen.add(key);
    presets.push({ name: preset.data.name, options: preset.data.options as ExportOptions });
  }
  return presets.slice(0, MAX_USER_PRESETS);
}

async function writeUserPresets(path: string, presets: ExportPreset[]): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  const body = {
    version: FILE_VERSION,
    presets: presets.map(({ name, options }) => ({ name, options })),
  };
  await writeFileAtomic(path, `${JSON.stringify(body, null, 2)}\n`);
}

/** The built-in presets, then the user's in the order they were first saved. */
export async function listPresets(): Promise<ExportPreset[]> {
  return [...BUILTIN_PRESETS, ...(await readUserPresets(await file()))];
}

/**
 * Save a user preset. Names are unique (ignoring case): saving an existing name replaces that
 * preset. A built-in name is refused.
 */
export async function savePreset(name: string, options: ExportOptions): Promise<void> {
  const clean = name.trim();
  if (clean === '') throw new Error('Le nom du préréglage est vide.');
  if (BUILTIN_PRESETS.some((p) => nameKey(p.name) === nameKey(clean))) {
    throw new Error('Ce nom est celui d’un préréglage intégré.');
  }
  const path = await file();
  await serialize(`presets:${path}`, async () => {
    const list = await readUserPresets(path);
    const at = list.findIndex((p) => nameKey(p.name) === nameKey(clean));
    const next: ExportPreset = { name: clean, options };
    if (at >= 0) list[at] = next;
    else if (list.length >= MAX_USER_PRESETS) throw new Error('Trop de préréglages enregistrés.');
    else list.push(next);
    await writeUserPresets(path, list);
  });
}

/** Delete a user preset. A built-in preset is refused; an unknown name is not an error. */
export async function deletePreset(name: string): Promise<void> {
  if (BUILTIN_PRESETS.some((p) => nameKey(p.name) === nameKey(name))) {
    throw new Error('Un préréglage intégré ne peut pas être supprimé.');
  }
  const path = await file();
  await serialize(`presets:${path}`, async () => {
    const list = await readUserPresets(path);
    const kept = list.filter((p) => nameKey(p.name) !== nameKey(name));
    if (kept.length !== list.length) await writeUserPresets(path, kept);
  });
}
