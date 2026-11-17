import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { MAP_LICENCE } from '@travelbook/core';
import { describe, expect, it } from 'vitest';

const RESOURCES_DIR = join(import.meta.dirname, '../resources');
const LICENCES_FILE = 'LICENCES.json';

interface Licence {
  source: string;
  author: string;
  licence: string;
  url: string;
}

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(RESOURCES_DIR, file), 'utf8')) as T;

/** Every file under `resources/`, as a `/`-separated path relative to it. */
async function resourceFiles(): Promise<string[]> {
  const entries = await readdir(RESOURCES_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(RESOURCES_DIR, join(entry.parentPath, entry.name)).split(sep).join('/'),
    )
    .sort();
}

const complete = (licence: Licence): boolean =>
  [licence.source, licence.author, licence.licence, licence.url].every(
    (field) => typeof field === 'string' && field.trim() !== '',
  );

/**
 * The licence of every file the app bundles, from the list that describes the file: the font list
 * (faces, and the licence text each family folder carries), the background list, the sticker
 * manifest (a build output: absent until `npm run stickers`) and `LICENCES.json` for the rest.
 */
function licenceOfEachFile(): Map<string, Licence> {
  const byFile = new Map<string, Licence>();

  const fonts = read<{ fonts: { id: string; licence: Licence; faces: { file: string }[] }[] }>(
    'fonts.json',
  );
  for (const font of fonts.fonts) {
    for (const face of font.faces) byFile.set(`fonts/${face.file}`, font.licence);
    byFile.set(`fonts/${font.id}/LICENSE`, font.licence);
  }

  for (const entry of read<({ file: string } & Licence)[]>('backgrounds.json')) {
    byFile.set(entry.file, entry);
  }

  if (existsSync(join(RESOURCES_DIR, 'stickers/packs/manifest.json'))) {
    const manifest = read<{ sets: { pack: string; index: string; licence: Licence }[] }>(
      'stickers/packs/manifest.json',
    );
    for (const set of manifest.sets) {
      byFile.set(`stickers/packs/${set.pack}`, set.licence);
      byFile.set(`stickers/packs/${set.index}`, set.licence);
    }
  }

  const own = read<{ entries: ({ files: string[] } & Licence)[] }>(LICENCES_FILE);
  for (const entry of own.entries) {
    for (const file of entry.files) {
      expect(byFile.has(file), `${file} has two licence entries`).toBe(false);
      byFile.set(file, entry);
    }
  }
  return byFile;
}

describe('the licences of resources/', () => {
  it('give every bundled file an entry with source, author, licence and url', async () => {
    const byFile = licenceOfEachFile();
    const files = (await resourceFiles()).filter((file) => file !== LICENCES_FILE);
    expect(files.filter((file) => !byFile.has(file))).toEqual([]);
    expect(files.filter((file) => !complete(byFile.get(file) as Licence))).toEqual([]);
  });

  it('name no file that is not there', async () => {
    const present = new Set(await resourceFiles());
    const listed = [...licenceOfEachFile().keys()];
    // The sticker packs are a build output (`npm run stickers`), absent from a fresh checkout.
    const missing = listed.filter(
      (file) => !present.has(file) && !file.startsWith('stickers/packs/'),
    );
    expect(missing).toEqual([]);
  });

  it('record our own files as the author and under the licence of the repository', () => {
    const own = read<{ entries: ({ files: string[] } & Licence)[] }>(LICENCES_FILE);
    expect(own.entries.length).toBeGreaterThan(0);
    // The map outlines are not our own work: Overture data, ODbL (checked in maps/geodata.test.ts).
    const ours = own.entries.filter((e) => !e.files.every((f) => f.startsWith('maps/')));
    for (const entry of ours) {
      expect(entry).toMatchObject({
        source: 'travelbook',
        author: 'Corentin Ravoux',
        licence: 'MIT',
        url: 'https://github.com/corentinravoux-perso/travelbook',
      });
    }
  });

  it('records the map outlines under the licence the app credits a map with', () => {
    const own = read<{ entries: ({ files: string[] } & Licence)[] }>(LICENCES_FILE);
    const outline = own.entries.find((e) => e.files.includes('maps/subjects/TH.topo.json'));
    expect(outline).toMatchObject({
      source: MAP_LICENCE.source,
      author: MAP_LICENCE.author,
      licence: MAP_LICENCE.licence,
      url: MAP_LICENCE.url,
    });
  });
});
