import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, normalizeStyle, type MapStyle } from '@travelbook/core';
import { setUserDataDir } from '../user-data';
import {
  USER_STYLE_ID,
  deleteUserStyle,
  listUserStyles,
  renameUserStyle,
  saveUserStyle,
} from './user-styles';

let work: string;
let file: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-styles-'));
  setUserDataDir(join(work, 'user data'));
  file = join(work, 'user data', 'map-styles.json');
});
afterEach(async () => {
  setUserDataDir(null);
  await rm(work, { recursive: true, force: true });
});

const withLand = (fill: string): MapStyle => ({
  ...DEFAULT_MAP_STYLE,
  land: { ...DEFAULT_MAP_STYLE.land, fill },
});

describe('user styles', () => {
  it('lists nothing before the first one is saved, and writes no file for that', async () => {
    expect(await listUserStyles()).toEqual([]);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('round-trips a style: id, name, every token', async () => {
    const saved = await saveUserStyle('Mon style', withLand('#112233'));
    expect(saved.id).toMatch(USER_STYLE_ID);
    expect(saved.id.startsWith('user-')).toBe(true);
    expect(saved.name).toBe('Mon style');
    expect(saved.style.land.fill).toBe('#112233');
    expect(await listUserStyles()).toEqual([saved]);
    // A new process reads the same file.
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      version: 1,
      styles: [{ id: saved.id, name: 'Mon style' }],
    });
  });

  it('gives every saved style its own id, whatever the name', async () => {
    const a = await saveUserStyle('Même nom', DEFAULT_MAP_STYLE);
    const b = await saveUserStyle('Même nom', DEFAULT_MAP_STYLE);
    expect(b.id).not.toBe(a.id);
    expect(await listUserStyles()).toHaveLength(2);
  });

  it('lists by name, in French order', async () => {
    await saveUserStyle('Zèbre', DEFAULT_MAP_STYLE);
    await saveUserStyle('Étoile', DEFAULT_MAP_STYLE);
    await saveUserStyle('Arbre', DEFAULT_MAP_STYLE);
    expect((await listUserStyles()).map((s) => s.name)).toEqual(['Arbre', 'Étoile', 'Zèbre']);
  });

  it('trims the name and refuses an empty or very long one', async () => {
    expect((await saveUserStyle('  Carnet 2  ', DEFAULT_MAP_STYLE)).name).toBe('Carnet 2');
    await expect(saveUserStyle('   ', DEFAULT_MAP_STYLE)).rejects.toThrow(/name/i);
    await expect(saveUserStyle('x'.repeat(101), DEFAULT_MAP_STYLE)).rejects.toThrow(/name/i);
  });

  it('fills a stored style that lacks a token and drops an unknown one (spec 7.9)', async () => {
    const saved = await saveUserStyle('Ancien', DEFAULT_MAP_STYLE);
    const stored = JSON.parse(await readFile(file, 'utf8')) as {
      styles: { style: Record<string, unknown> }[];
    };
    const old = stored.styles[0]!.style;
    delete old['lakes'];
    delete (old['land'] as Record<string, unknown>)['width'];
    old['futureToken'] = { a: 1 };
    await writeFile(file, JSON.stringify(stored));

    const [listed] = await listUserStyles();
    expect(listed!.id).toBe(saved.id);
    expect(listed!.style.lakes).toEqual(DEFAULT_MAP_STYLE.lakes);
    expect(listed!.style.land.width).toBe(DEFAULT_MAP_STYLE.land.width);
    expect(listed!.style).not.toHaveProperty('futureToken');
    expect(listed!.style).toEqual(normalizeStyle(old));
  });

  it('stores a complete style even when given a partial one', async () => {
    const partial = { styleVersion: 1, land: { fill: '#abcdef' } } as unknown as MapStyle;
    const saved = await saveUserStyle('Partiel', partial);
    expect(saved.style.land).toEqual({ ...DEFAULT_MAP_STYLE.land, fill: '#abcdef' });
    expect(saved.style.label).toEqual(DEFAULT_MAP_STYLE.label);
  });

  it('renames, keeping the id and the style', async () => {
    const saved = await saveUserStyle('Avant', withLand('#010203'));
    await renameUserStyle(saved.id, ' Après ');
    expect(await listUserStyles()).toEqual([{ ...saved, name: 'Après' }]);
  });

  it('rejects renaming a style that is not there', async () => {
    await expect(renameUserStyle('user-nope', 'x')).rejects.toThrow(/Unknown style/);
  });

  it('deletes; deleting one that is not there is not an error', async () => {
    const a = await saveUserStyle('A', DEFAULT_MAP_STYLE);
    const b = await saveUserStyle('B', DEFAULT_MAP_STYLE);
    await deleteUserStyle(a.id);
    await deleteUserStyle(a.id);
    expect((await listUserStyles()).map((s) => s.id)).toEqual([b.id]);
  });

  it('refuses an id that is not a user style id', async () => {
    await expect(renameUserStyle('carnet', 'x')).rejects.toThrow(/style id/);
    await expect(deleteUserStyle('../x')).rejects.toThrow(/style id/);
  });

  it('keeps every style when saves come at once', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => saveUserStyle(`Style ${i}`, DEFAULT_MAP_STYLE)),
    );
    expect(await listUserStyles()).toHaveLength(12);
  });

  it('skips an entry that is not a style and keeps the others', async () => {
    const good = await saveUserStyle('Bon', DEFAULT_MAP_STYLE);
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        styles: [
          { id: 'carnet', name: 'Prend la place du préréglage', style: {} },
          { id: 'user-noname', name: '', style: {} },
          'junk',
          { id: good.id, name: 'Bon', style: DEFAULT_MAP_STYLE },
          { id: good.id, name: 'Doublon', style: DEFAULT_MAP_STYLE },
        ],
      }),
    );
    expect((await listUserStyles()).map((s) => s.name)).toEqual(['Bon']);
  });

  it('sets a file that is not a styles file aside instead of overwriting it', async () => {
    await saveUserStyle('Un', DEFAULT_MAP_STYLE);
    await writeFile(file, '{ not json');
    expect(await listUserStyles()).toEqual([]);
    expect(await readFile(`${file}.corrupt`, 'utf8')).toBe('{ not json');
    const next = await saveUserStyle('Deux', DEFAULT_MAP_STYLE);
    expect(await listUserStyles()).toEqual([next]);
  });

  it('writes atomically: no temporary file is left', async () => {
    await saveUserStyle('Un', DEFAULT_MAP_STYLE);
    expect(await readdir(join(work, 'user data'))).toEqual(['map-styles.json']);
  });
});
