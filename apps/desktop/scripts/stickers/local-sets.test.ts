import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STICKERS_SRC_DIR, categoryOf, localSetFiles, localSetIds, readLocalSet, readLocalSets } from './local-sets.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'local-sets-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const svg = (view: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">\n<path d="M0 0h1"/>\n</svg>\n`;

async function makeSet(id: string, meta: object, files: Record<string, string>): Promise<void> {
  await mkdir(join(dir, id));
  await writeFile(join(dir, id, 'meta.json'), JSON.stringify(meta));
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, id, name), body);
}

describe('categoryOf', () => {
  it('takes the longest matching prefix', () => {
    const cats = { fleur: 'Fleurs', 'fleur-tropicale': 'Tropiques' };
    expect(categoryOf('fleur-rose', cats)).toBe('fleur');
    expect(categoryOf('fleur-tropicale-hibiscus', cats)).toBe('fleur-tropicale');
    expect(categoryOf('fleur', cats)).toBeUndefined();
    expect(categoryOf('brin-olivier', cats)).toBeUndefined();
  });
});

describe('readLocalSet', () => {
  it('packs each file with its viewBox, category label and keywords', async () => {
    await makeSet(
      'croquis',
      { name: 'Croquis', order: 2, categories: { objet: 'Objets', meteo: 'Météo' }, keywords: { 'objet-tasse': ['café'] } },
      { 'objet-tasse.svg': svg('0 0 40 30'), 'meteo-eclair.svg': svg('0 0 30 40'), 'notes.txt': 'x' },
    );
    const set = await readLocalSet('croquis', dir);
    expect(set).toMatchObject({ id: 'croquis', name: 'Croquis', order: 2, picks: [] });
    expect(set.pack.views).toEqual({ 'meteo-eclair': '0 0 30 40', 'objet-tasse': '0 0 40 30' });
    expect(set.pack.icons['objet-tasse']).toBe('<path d="M0 0h1"/>');
    const tasse = set.docs.find((d) => d.id === 'objet-tasse')!;
    expect(tasse).toMatchObject({ category: 'Objets', title: 'Objets · tasse' });
    expect(tasse.kw.split(' ')).toEqual(expect.arrayContaining(['café', 'objets']));
  });

  it('refuses a file whose id has no known category', async () => {
    await makeSet('s', { name: 'S', order: 1, categories: { objet: 'Objets' } }, { 'autre-chose.svg': svg('0 0 1 1') });
    await expect(readLocalSet('s', dir)).rejects.toThrow(/no known category/);
  });

  it('refuses a file without a viewBox', async () => {
    await makeSet('s', { name: 'S', order: 1, categories: { objet: 'Objets' } }, { 'objet-x.svg': '<svg></svg>' });
    await expect(readLocalSet('s', dir)).rejects.toThrow(/viewBox/);
  });
});

describe('readLocalSets', () => {
  it('lists the folders with a meta.json, by order', async () => {
    await makeSet('b', { name: 'B', order: 1, categories: { x: 'X' } }, { 'x-1.svg': svg('0 0 1 1') });
    await makeSet('a', { name: 'A', order: 5, categories: { x: 'X' } }, {});
    await mkdir(join(dir, 'not-a-set'));
    expect(await localSetIds(dir)).toEqual(['a', 'b']);
    expect((await readLocalSets(dir)).map((s) => s.id)).toEqual(['b', 'a']);
    expect((await localSetFiles(dir)).map((f) => f.slice(dir.length + 1))).toEqual([
      'a/meta.json',
      'b/meta.json',
      'b/x-1.svg',
    ]);
  });

  it('returns nothing for a missing folder', async () => {
    expect(await readLocalSets(join(dir, 'nope'))).toEqual([]);
  });
});

describe('the committed drawn sets', () => {
  it('all read, and every sticker is a self-contained SVG (no external reference, no script)', async () => {
    const sets = await readLocalSets();
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      for (const [id, body] of Object.entries(set.pack.icons)) {
        expect(body, `${set.id}/${id}`).not.toMatch(/<script|\son\w+=|href=|<image|<text/i);
      }
    }
  });

  it('match their generators (run `npm run draw-stickers` after editing a drawing)', async () => {
    const { DRAWN_SETS } = await import('./draw-stickers.ts');
    const { render } = await import('./draw/core.ts');
    for (const { SET, DRAWINGS } of DRAWN_SETS) {
      const files = (await readdir(join(STICKERS_SRC_DIR, SET.id))).filter((n) => n.endsWith('.svg'));
      expect(files.sort(), SET.id).toEqual(DRAWINGS.map((d) => `${d.id}.svg`).sort());
      for (const d of DRAWINGS) {
        expect(await readFile(join(STICKERS_SRC_DIR, SET.id, `${d.id}.svg`), 'utf8'), d.id).toBe(render(d));
      }
    }
  });
});
