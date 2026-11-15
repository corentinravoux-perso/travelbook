import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExportOptions } from '../../shared/api';
import { setUserDataDir } from '../user-data';
import { exportOptions } from './options';
import { BUILTIN_PRESETS, deletePreset, listPresets, savePreset } from './presets';

let userData: string;

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'tb-presets-'));
  setUserDataDir(userData);
});

afterEach(async () => {
  setUserDataDir(null);
  await rm(userData, { recursive: true, force: true });
});

const mine: ExportOptions = {
  ...BUILTIN_PRESETS[0]!.options,
  route: 'images',
  dpi: 600,
  outDir: '/tmp/out',
};

describe('built-in presets', () => {
  it('are the three of the spec, with names and routes', () => {
    expect(BUILTIN_PRESETS.map((p) => [p.name, p.options.route])).toEqual([
      ['Impression sur mesure (PDF)', 'pdf'],
      ['Imprimeur en ligne (images)', 'images'],
      ["Lecture à l'écran", 'pdf'],
    ]);
  });

  it('keep the screen reading options of the PDF route', () => {
    const screen = BUILTIN_PRESETS[2]!.options;
    expect([screen.perSpread, screen.dpi, screen.bleed, screen.cropMarks]).toEqual([
      true,
      150,
      false,
      false,
    ]);
  });

  it('pass the export options schema once given a folder', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(exportOptions.safeParse({ ...p.options, outDir: '/tmp/x' }).success).toBe(true);
    }
  });
});

describe('user presets', () => {
  it('lists the built-in ones alone before anything is saved', async () => {
    expect((await listPresets()).map((p) => p.name)).toEqual(BUILTIN_PRESETS.map((p) => p.name));
  });

  it('saves, lists after the built-in ones, and survives a new read', async () => {
    await savePreset('  Mon livre  ', mine);
    const list = await listPresets();
    expect(list.slice(-1)).toEqual([{ name: 'Mon livre', options: mine }]);
    expect(list).toHaveLength(BUILTIN_PRESETS.length + 1);
  });

  it('keeps names unique, ignoring case: a second save replaces the first', async () => {
    await savePreset('Mon livre', mine);
    await savePreset('mon LIVRE', { ...mine, dpi: 150 });
    const user = (await listPresets()).filter((p) => !p.builtin);
    expect(user).toHaveLength(1);
    expect(user[0]!.options.dpi).toBe(150);
  });

  it('refuses the name of a built-in preset and an empty name', async () => {
    await expect(savePreset('impression sur mesure (pdf)', mine)).rejects.toThrow(/intégré/);
    await expect(savePreset('   ', mine)).rejects.toThrow(/vide/);
  });

  it('deletes a user preset, ignores an unknown one, and refuses a built-in one', async () => {
    await savePreset('A', mine);
    await savePreset('B', mine);
    await deletePreset('A');
    await deletePreset('nobody');
    expect((await listPresets()).filter((p) => !p.builtin).map((p) => p.name)).toEqual(['B']);
    await expect(deletePreset(BUILTIN_PRESETS[1]!.name)).rejects.toThrow(/intégré/);
    expect(await listPresets()).toHaveLength(BUILTIN_PRESETS.length + 1);
  });

  it('writes atomically, leaving one file and no temporary one', async () => {
    await savePreset('A', mine);
    expect(await readdir(userData)).toEqual(['export-presets.json']);
  });

  it('skips invalid entries and names that clash, and reads a corrupt file as empty', async () => {
    const path = join(userData, 'export-presets.json');
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        presets: [
          { name: 'Bon', options: mine },
          { name: 'Mauvais', options: { ...mine, dpi: 5 } },
          { name: 'Impression sur mesure (PDF)', options: mine },
          { name: 'Bon', options: mine },
          'junk',
        ],
      }),
    );
    expect((await listPresets()).filter((p) => !p.builtin).map((p) => p.name)).toEqual(['Bon']);
    await writeFile(path, '{ not json');
    expect(await listPresets()).toHaveLength(BUILTIN_PRESETS.length);
    await writeFile(path, JSON.stringify({ version: 9, presets: [] }));
    expect(await listPresets()).toHaveLength(BUILTIN_PRESETS.length);
    await savePreset('Après', mine);
    expect(JSON.parse(await readFile(path, 'utf8')).presets).toHaveLength(1);
  });
});
