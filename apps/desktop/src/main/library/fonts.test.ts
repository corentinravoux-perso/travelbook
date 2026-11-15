import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook, newElement, type AssetRef, type Book } from '@travelbook/core';
import { setUserDataDir } from '../user-data';
import {
  addFromCatalogue,
  bundledFonts,
  categoryFromFontsource,
  createFontCatalogue,
  ensureFontsInProject,
  fontAssetsFor,
  importFontFile,
  listFonts,
  setFontCatalogue,
  setFontsResourcesDir,
} from './fonts';
import { copyIntoProject } from './userLibrary';

const RESOURCES = join(import.meta.dirname, '../../../resources');
const FIXTURES = join(import.meta.dirname, 'fixtures');
/** Everything French text needs from a face: accents, the ligature, the guillemets. */
const FRENCH = [...'éèêçœŒ«»'].map((c) => c.codePointAt(0) as number);

let work: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-fonts-'));
  setUserDataDir(join(work, 'user data'));
  setFontsResourcesDir(RESOURCES);
});
afterEach(async () => {
  setUserDataDir(null);
  setFontsResourcesDir(null);
  setFontCatalogue(null);
  await rm(work, { recursive: true, force: true });
});

const read = async (name: string): Promise<string> => readFile(join(FIXTURES, name), 'utf8');

describe('bundled fonts', () => {
  it('lists about forty families over the five categories, each with a regular face', () => {
    const fonts = bundledFonts();
    expect(fonts.length).toBeGreaterThanOrEqual(40);
    expect(fonts.length).toBeLessThanOrEqual(45);
    for (const category of ['manuscrite', 'serif', 'sans', 'titre', 'machine']) {
      expect(fonts.filter((f) => f.category === category).length).toBeGreaterThanOrEqual(5);
    }
    for (const font of fonts) {
      expect(font.origin).toBe('bundled');
      expect(font.faces.some((f) => f.weight === 400 && f.style === 'normal')).toBe(true);
    }
  });

  it('has no duplicate family, and keeps the six fonts the text editor started with', () => {
    const names = bundledFonts().map((f) => f.family);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    for (const name of [
      'Inter',
      'Lora',
      'Playfair Display',
      'Cormorant Garamond',
      'Oswald',
      'Caveat',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('is under OFL-1.1 or Apache-2.0, with its author and a page for the licence', () => {
    for (const font of bundledFonts()) {
      expect(['OFL-1.1', 'Apache-2.0']).toContain(font.licence.licence);
      expect(font.licence.author).toMatch(/\S/);
      expect(font.licence.url).toMatch(/^https:\/\//);
    }
  });

  it('is listed with a regular and a bold face wherever the family has both, and italics', () => {
    const lora = bundledFonts().find((f) => f.family === 'Lora')!;
    expect(lora.faces.map((f) => `${f.weight}${f.style}`)).toEqual([
      '400normal',
      '700normal',
      '400italic',
      '700italic',
    ]);
    expect(lora.faces[0]!.url).toBe('tb://resource/fonts/lora/lora-latin-400-normal.woff2');
  });

  it('has a file for every face, and no file that fonts.json does not list', async () => {
    const listed = new Set<string>();
    for (const font of bundledFonts()) {
      for (const face of font.faces) {
        const file = face.url.replace('tb://resource/fonts/', '');
        listed.add(file);
        expect((await stat(join(RESOURCES, 'fonts', file))).isFile()).toBe(true);
      }
    }
    const onDisk: string[] = [];
    for (const dir of await readdir(join(RESOURCES, 'fonts'))) {
      for (const file of await readdir(join(RESOURCES, 'fonts', dir))) {
        if (file !== 'LICENSE') onDisk.push(`${dir}/${file}`);
        // Each family also carries its licence text.
        else expect((await stat(join(RESOURCES, 'fonts', dir, file))).size).toBeGreaterThan(500);
      }
    }
    expect(onDisk.sort()).toEqual([...listed].sort());
  });

  it('covers é è ê ç œ Œ « » in every face (read from the font files)', async () => {
    const lacking: string[] = [];
    for (const font of bundledFonts()) {
      for (const face of font.faces) {
        const file = face.url.replace('tb://resource/fonts/', '');
        const parsed = fontkit.create(await readFile(join(RESOURCES, 'fonts', file)));
        if (!('hasGlyphForCodePoint' in parsed)) throw new Error(`${file} is a collection`);
        const missing = FRENCH.filter((cp) => !parsed.hasGlyphForCodePoint(cp));
        if (missing.length > 0) {
          lacking.push(`${file}: ${missing.map((cp) => String.fromCodePoint(cp)).join('')}`);
        }
      }
    }
    expect(lacking).toEqual([]);
  });

  it('listFonts returns the bundled count when the library is empty', async () => {
    const fonts = await listFonts();
    expect(fonts).toHaveLength(bundledFonts().length);
    expect(fonts.every((f) => f.origin === 'bundled')).toBe(true);
  });
});

describe('the Fontsource catalogue (recorded answers)', () => {
  const answer = (body: string): Response =>
    new Response(body, { headers: { 'content-type': 'application/json' } });

  async function make(fetchImpl: typeof fetch) {
    return createFontCatalogue({ cacheDir: join(work, 'cache'), version: '1.2.3', fetchImpl });
  }

  it('maps a search: our categories, OFL and Apache only, a latin subset, no icon font', async () => {
    const list = await read('fontsource-list.json');
    const fetchImpl = vi.fn(async () => answer(list));
    const catalogue = await make(fetchImpl as unknown as typeof fetch);
    expect(await catalogue.search('bitter')).toEqual([
      { id: 'bitter', family: 'Bitter', category: 'serif' },
    ]);
    // Accents and case do not matter; a query that matches several lists the name-first ones first.
    expect((await catalogue.search('SERIF')).map((e) => e.id)).toEqual(['source-serif-4']);
    const everything = (await catalogue.search('e')).map((e) => e.id);
    // Not UFL (ubuntu), not MIT, not icons, not "other", not without latin (chenla).
    for (const id of ['ubuntu', 'comic-mono', 'material-icons', 'dseg-weather', 'chenla']) {
      expect(everything).not.toContain(id);
    }
    const caveat = (await catalogue.search('caveat'))[0];
    expect(caveat).toEqual({ id: 'caveat', family: 'Caveat', category: 'manuscrite' });
    expect((await catalogue.search('roboto'))[0]?.category).toBe('machine');
    expect((await catalogue.search('anton'))[0]?.category).toBe('sans');
    // One request, then the cache.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when the query is empty', async () => {
    const fetchImpl = vi.fn();
    const catalogue = await make(fetchImpl as unknown as typeof fetch);
    expect(await catalogue.search('   ')).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a network failure as offline and a wrong shape as a bad answer', async () => {
    const down = await make((async () =>
      Promise.reject(new TypeError('fetch failed'))) as typeof fetch);
    await expect(down.search('x')).rejects.toMatchObject({ kind: 'offline' });
    const wrong = await make((async () => answer('{"not":"a list"}')) as unknown as typeof fetch);
    await expect(wrong.search('x')).rejects.toMatchObject({ kind: 'badAnswer' });
    const limited = await make((async () => new Response('', { status: 429 })) as typeof fetch);
    await expect(limited.search('x')).rejects.toMatchObject({ kind: 'rateLimited' });
  });

  /** Serves the recorded detail of Bitter and, for its files, the bundled Lora files (distinct bytes per face). */
  function bitterFetch(): { fetchImpl: typeof fetch; urls: string[] } {
    const urls: string[] = [];
    const bytesFor = (url: string): Promise<Buffer> => {
      const face = /latin-(\d+)-(normal|italic)\.woff2$/.exec(url)!;
      return readFile(join(RESOURCES, 'fonts/lora', `lora-latin-${face[1]}-${face[2]}.woff2`));
    };
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      if (url.endsWith('/v1/fonts/bitter')) return answer(await read('fontsource-bitter.json'));
      return new Response(new Uint8Array(await bytesFor(url)));
    }) as unknown as typeof fetch;
    return { fetchImpl, urls };
  }

  it('downloads regular and bold, with italics, of the latin subset from jsDelivr only', async () => {
    const { fetchImpl, urls } = bitterFetch();
    const downloaded = await (await make(fetchImpl)).download('bitter');
    expect(downloaded.family).toBe('Bitter');
    expect(downloaded.category).toBe('serif');
    expect(downloaded.licence).toMatchObject({
      licence: 'OFL-1.1',
      url: 'https://fontsource.org/fonts/bitter',
    });
    expect(downloaded.faces.map((f) => `${f.weight}${f.style}`)).toEqual([
      '400normal',
      '400italic',
      '700normal',
      '700italic',
    ]);
    const files = urls.filter((u) => !u.includes('api.fontsource.org'));
    expect(files).toHaveLength(4);
    for (const url of files)
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/fontsource\/fonts\/bitter@/);
  });

  it('refuses a file address that is not on jsDelivr, and a bad id, and a bad font file', async () => {
    const evil = JSON.parse(await read('fontsource-bitter.json')) as {
      variants: Record<string, Record<string, { latin: { url: { woff2: string } } }>>;
    };
    evil.variants['400']!['normal']!.latin.url.woff2 = 'https://evil.example.com/a.woff2';
    const evilFetch = (async () => answer(JSON.stringify(evil))) as unknown as typeof fetch;
    await expect((await make(evilFetch)).download('bitter')).rejects.toMatchObject({
      kind: 'badAnswer',
    });
    await expect((await make(evilFetch)).download('../etc')).rejects.toMatchObject({
      kind: 'notFound',
    });
    const junk = (async (url: string) =>
      url.endsWith('/bitter')
        ? answer(await read('fontsource-bitter.json'))
        : new Response('not a font')) as unknown as typeof fetch;
    await expect((await make(junk)).download('bitter')).rejects.toMatchObject({
      kind: 'badAnswer',
    });
  });

  it('maps Fontsource categories to ours', () => {
    expect(
      ['handwriting', 'serif', 'sans-serif', 'display', 'monospace', 'icons', 'other'].map(
        categoryFromFontsource,
      ),
    ).toEqual(['manuscrite', 'serif', 'sans', 'titre', 'machine', undefined, undefined]);
  });

  it('addFromCatalogue keeps the family in the user library, listed after the bundled ones', async () => {
    const { fetchImpl } = bitterFetch();
    setFontCatalogue(await make(fetchImpl));
    const family = await addFromCatalogue('bitter', () => '1.2.3');
    expect(family).toMatchObject({ family: 'Bitter', category: 'serif', origin: 'library' });
    expect(family.faces.map((f) => `${f.weight}${f.style}`)).toEqual([
      '400normal',
      '700normal',
      '400italic',
      '700italic',
    ]);
    expect(family.faces.every((f) => f.url.startsWith('tb://library/') && f.itemId)).toBe(true);
    expect(family.licence.licence).toBe('OFL-1.1');
    const all = await listFonts();
    expect(all.at(-1)?.family).toBe('Bitter');
    expect(all).toHaveLength(bundledFonts().length + 1);
    // The same family again changes nothing.
    await addFromCatalogue('bitter', () => '1.2.3');
    expect(await listFonts()).toHaveLength(bundledFonts().length + 1);
  });
});

describe('importFontFile', () => {
  it('keeps a TTF with the family, weight and style read from the file', async () => {
    const regular = await importFontFile(join(FIXTURES, 'fixture-sans-regular.ttf'));
    expect(regular).toMatchObject({ family: 'Fixture Sans', origin: 'library', category: 'sans' });
    expect(regular.faces.map((f) => `${f.weight}${f.style}`)).toEqual(['400normal']);
    const both = await importFontFile(join(FIXTURES, 'fixture-sans-bold-italic.ttf'));
    expect(both.faces.map((f) => `${f.weight}${f.style}`)).toEqual(['400normal', '700italic']);
    expect(both.licence.licence).toBe('Inconnue');
    expect((await listFonts()).filter((f) => f.family === 'Fixture Sans')).toHaveLength(1);
  });

  it('takes a WOFF2 file, and hides a user font that has the name of a bundled one', async () => {
    const family = await importFontFile(join(RESOURCES, 'fonts/lora/lora-latin-700-normal.woff2'));
    expect(family.family).toBe('Lora');
    expect(family.faces).toMatchObject([{ weight: 700, style: 'normal' }]);
    const lora = (await listFonts()).filter((f) => f.family === 'Lora');
    expect(lora).toHaveLength(1);
    expect(lora[0]!.origin).toBe('bundled');
  });

  it('refuses a WOFF, a text file and a missing file', async () => {
    const woff = join(work, 'a.woff');
    await writeFile(woff, 'x');
    await expect(importFontFile(woff)).rejects.toThrow(/Unsupported file type/);
    const fake = join(work, 'fake.ttf');
    await writeFile(fake, 'this is not a font');
    await expect(importFontFile(fake)).rejects.toThrow(/Not a usable font file/);
    await expect(importFontFile(join(work, 'missing.ttf'))).rejects.toThrow();
    expect(await listFonts()).toHaveLength(bundledFonts().length);
  });
});

describe('fonts in an album', () => {
  let project: string;
  let book: Book;
  beforeEach(async () => {
    project = join(work, 'Été 2026', 'mon livre.travelbook');
    await mkdir(join(project, 'assets'), { recursive: true });
    book = newBook({ title: 'T', innerSpreads: 2 });
    await importFontFile(join(FIXTURES, 'fixture-sans-regular.ttf'));
    await importFontFile(join(FIXTURES, 'fixture-sans-bold-italic.ttf'));
    const text = newElement('text', { x: 0, y: 0, w: 50, h: 10 });
    text.style.fontFamily = "'Fixture Sans', sans-serif";
    book.spreads[1]!.elements = [text];
  });

  it('copies the faces of a library family into assets/ and describes them as font assets', async () => {
    const refs = await fontAssetsFor(project, book, ['Fixture Sans', 'Lora', 'Absent']);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => [r.kind, r.originalName]).sort()).toEqual([
      ['font', 'Fixture Sans|400|normal.ttf'],
      ['font', 'Fixture Sans|700|italic.ttf'],
    ]);
    for (const ref of refs) {
      expect((await stat(join(project, ref.file))).isFile()).toBe(true);
      expect(ref.licence).toBeUndefined();
    }
    expect(await readdir(join(project, 'assets'))).toHaveLength(2);
  });

  it('copies nothing twice', async () => {
    const first = await fontAssetsFor(project, book, ['Fixture Sans']);
    const withRefs: Book = {
      ...book,
      assets: Object.fromEntries(first.map((r: AssetRef) => [r.id, r])),
    };
    const second = await fontAssetsFor(project, withRefs, ['Fixture Sans']);
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
    expect(await readdir(join(project, 'assets'))).toHaveLength(2);
  });

  it('ensureFontsInProject puts the used faces in assets/ on save, and only the used families', async () => {
    await ensureFontsInProject(project, book);
    expect(await readdir(join(project, 'assets'))).toHaveLength(2);

    const bare = newBook({ title: 'B', innerSpreads: 2 });
    const other = join(work, 'other.travelbook');
    await mkdir(join(other, 'assets'), { recursive: true });
    await ensureFontsInProject(other, bare);
    expect(await readdir(join(other, 'assets'))).toEqual([]);
  });

  it('puts back a face file that went missing from assets/', async () => {
    const refs = await fontAssetsFor(project, book, ['Fixture Sans']);
    await rm(join(project, refs[0]!.file));
    await ensureFontsInProject(project, {
      ...book,
      assets: Object.fromEntries(refs.map((r) => [r.id, r])),
    });
    expect((await stat(join(project, refs[0]!.file))).isFile()).toBe(true);
  });

  it('does not copy a bundled family: the app always has it', async () => {
    const text = newElement('text', { x: 0, y: 0, w: 50, h: 10 });
    text.style.fontFamily = "'Lora', serif";
    book.spreads[1]!.elements = [text];
    await importFontFile(join(RESOURCES, 'fonts/lora/lora-latin-700-normal.woff2'));
    await ensureFontsInProject(project, book);
    expect(await readdir(join(project, 'assets'))).toEqual([]);
  });

  it('copyIntoProject gives the same asset as fontAssetsFor (one id per face)', async () => {
    const [ref] = await fontAssetsFor(project, book, ['Fixture Sans']);
    expect(ref!.id).toMatch(/^font-[0-9a-f]{16}$/);
    const family = (await listFonts()).find((f) => f.family === 'Fixture Sans')!;
    const again = await copyIntoProject(project, book, family.faces[0]!.itemId!);
    expect(again.id).toBe(family.faces[0]!.itemId);
  });
});
