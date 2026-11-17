import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AFFICHES_LICENCE, readAffichesSet } from './affiches-set.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'affiches-'));
  await mkdir(join(dir, 'illustrations'));
  await writeFile(
    join(dir, 'destinations.json'),
    JSON.stringify([
      { id: 'japon', label: 'Japon' },
      { id: 'costa-rica', label: 'Costa Rica' },
    ]),
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const write = (name: string, svg: string) => writeFile(join(dir, 'illustrations', name), svg);

describe('readAffichesSet', () => {
  it('returns null for a folder without illustrations', async () => {
    await writeFile(join(dir, 'keywords.json'), '{}');
    expect(await readAffichesSet(dir)).toBeNull();
  });

  it('returns null when the folder does not exist', async () => {
    expect(await readAffichesSet(join(dir, 'nope'))).toBeNull();
  });

  it('packs each file as its inner body with its own viewBox', async () => {
    await write(
      'japon-torii.svg',
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60">\n  <path class="tb-main" fill="#c8423b" d="M0 60h80"/>\n</svg>\n',
    );
    await write(
      'costa-rica-toucan.svg',
      '<svg viewBox="0 0 40 90" xmlns="http://www.w3.org/2000/svg"><rect class="tb-main" fill="#111111" width="1" height="1"/></svg>',
    );
    await writeFile(
      join(dir, 'keywords.json'),
      JSON.stringify({ 'japon-torii': ['japon', 'torii', 'portail'] }),
    );
    const set = await readAffichesSet(dir);
    expect(set).not.toBeNull();
    expect(set!.pack.icons['japon-torii']).toBe(
      '<path class="tb-main" fill="#c8423b" d="M0 60h80"/>',
    );
    expect(set!.pack.views).toEqual({
      'japon-torii': '0 0 80 60',
      'costa-rica-toucan': '0 0 40 90',
    });
    const torii = set!.docs.find((d) => d.id === 'japon-torii')!;
    expect(torii.category).toBe('Japon');
    expect(torii.kw.split(' ')).toEqual(expect.arrayContaining(['japon', 'torii', 'portail']));
    expect(torii.title).toBe('Japon · torii');
    const toucan = set!.docs.find((d) => d.id === 'costa-rica-toucan')!;
    expect(toucan.category).toBe('Costa Rica');
    expect(toucan.title).toBe('Costa Rica · toucan');
  });

  it('refuses a file of an unknown destination', async () => {
    await write('narnia-lion.svg', '<svg viewBox="0 0 1 1"></svg>');
    await writeFile(join(dir, 'keywords.json'), '{}');
    await expect(readAffichesSet(dir)).rejects.toThrow(/narnia-lion/);
  });

  it('carries the repository licence, without attribution', () => {
    expect(AFFICHES_LICENCE).toEqual({
      source: 'travelbook',
      author: 'Corentin Ravoux',
      licence: 'MIT',
      url: 'https://github.com/corentinravoux-perso/travelbook',
      requiresAttribution: false,
    });
  });
});
