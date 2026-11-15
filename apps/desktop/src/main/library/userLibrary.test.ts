import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook, type AssetRef, type Book, type Licence } from '@travelbook/core';
import { fixturePath } from '../../../../../tests/fixtures/make-fixtures';
import type { LibraryItem } from '../../shared/api';
import { importAssetFiles } from '../assets/import-files';
import { resolveTbUrl } from '../protocol';
import { setUserDataDir } from '../user-data';
import {
  addToLibrary,
  copyIntoProject,
  expandLibraryPaths,
  libraryFile,
  listLibrary,
  primeLibraryLookup,
  removeFromLibrary,
  setFavourite,
  touchUsed,
} from './userLibrary';

// Pass-through wrapper so a test can make `rename` fail (atomic-write tests).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const { rename: realRename } =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let work: string;
let userData: string;
let library: string;
let project: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-library-'));
  userData = join(work, 'user data');
  library = join(userData, 'library');
  // Spaces and accents in the project path, on purpose.
  project = join(work, 'Été 2026', 'mon livre.travelbook');
  await mkdir(join(project, 'assets'), { recursive: true });
  setUserDataDir(userData);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-06T07:08:09.000Z'));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.mocked(rename).mockImplementation(realRename);
  setUserDataDir(null);
  await rm(work, { recursive: true, force: true });
});

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const at = (iso: string): void => {
  vi.setSystemTime(new Date(iso));
};

const sticker = (name: string, extra: { tags?: string[]; licence?: Licence } = {}) =>
  addToLibrary(
    'sticker',
    { path: fixturePath('alpha.png'), ext: '.png' },
    { title: name, ...extra },
  );

/** A font-like file: fonts are not decoded, so any bytes do. */
const fontBytes = (label: string): Buffer => Buffer.from(`font bytes ${label}`);

const indexOnDisk = async (): Promise<unknown> =>
  JSON.parse(await readFile(join(library, 'index.json'), 'utf8'));

const licence: Licence = {
  source: 'Openclipart',
  author: 'Une auteure',
  licence: 'CC0 1.0',
  url: 'https://openclipart.org/detail/1',
  requiresAttribution: false,
};

describe('addToLibrary', () => {
  it('copies a file into library/files/<id>.<ext> and describes it', async () => {
    const src = fixturePath('alpha.png');
    const bytes = await readFile(src);
    const sha16 = sha256(bytes).slice(0, 16);
    const item = await addToLibrary(
      'sticker',
      { path: src, ext: '.png' },
      { title: 'Étoile', tags: ['ciel', 'nuit'] },
    );
    expect(item).toEqual({
      id: `sticker-${sha16}`,
      kind: 'sticker',
      file: `files/sticker-${sha16}.png`,
      title: 'Étoile',
      tags: ['ciel', 'nuit'],
      addedAt: '2026-05-06T07:08:09.000Z',
      favourite: false,
    });
    expect(await readFile(join(library, item.file))).toEqual(bytes);
    expect(await readdir(join(library, 'files'))).toEqual([`sticker-${sha16}.png`]);
    expect(await indexOnDisk()).toMatchObject({ items: [item] });
  });

  it('takes bytes as well as a path, with the same id for the same content', async () => {
    const src = fixturePath('alpha.png');
    const fromBytes = await addToLibrary(
      'sticker',
      { bytes: await readFile(src), ext: '.png' },
      { title: 'A' },
    );
    const fromPath = await addToLibrary('sticker', { path: src, ext: '.png' }, { title: 'B' });
    expect(fromPath).toEqual(fromBytes);
    expect(await readdir(join(library, 'files'))).toHaveLength(1);
  });

  it('works from a source path with spaces and accents', async () => {
    const item = await addToLibrary(
      'background',
      { path: fixturePath('évasion n°1.jpg'), ext: '.jpg' },
      { title: 'Évasion' },
    );
    expect(item.id).toMatch(/^background-[0-9a-f]{16}$/);
    expect(item.file).toBe(`files/${item.id}.jpg`);
  });

  it('returns the existing item when the same bytes are added twice', async () => {
    const first = await sticker('Premier', { tags: ['a'] });
    await setFavourite(first.id, true);
    at('2026-06-01T00:00:00.000Z');
    const again = await sticker('Second nom', { tags: ['b'] });
    expect(again).toEqual({ ...first, favourite: true });
    expect(await listLibrary('sticker')).toHaveLength(1);
    expect(await readdir(join(library, 'files'))).toHaveLength(1);
  });

  it('keeps one item per kind for the same bytes', async () => {
    const asSticker = await sticker('Image');
    const asBackground = await addToLibrary(
      'background',
      { path: fixturePath('alpha.png'), ext: '.png' },
      { title: 'Image' },
    );
    expect(asSticker.id).not.toBe(asBackground.id);
    expect(asSticker.id.split('-')[1]).toBe(asBackground.id.split('-')[1]);
    expect(await readdir(join(library, 'files'))).toHaveLength(2);
  });

  it('keeps the licence, and trims and de-duplicates the tags', async () => {
    const item = await sticker('Licenciée', { tags: [' ciel ', 'nuit', 'ciel', '  '], licence });
    expect(item.tags).toEqual(['ciel', 'nuit']);
    expect(item.licence).toEqual(licence);
    expect((await listLibrary('sticker'))[0]?.licence).toEqual(licence);
  });

  it('accepts an upper-case extension or one without a dot, and stores it lower-case', async () => {
    const a = await addToLibrary(
      'sticker',
      { path: fixturePath('alpha.png'), ext: 'PNG' },
      { title: 'A' },
    );
    expect(a.file).toBe(`files/${a.id}.png`);
  });

  it('takes an SVG sticker and a font', async () => {
    const svg = await addToLibrary(
      'sticker',
      { path: fixturePath('plain.svg'), ext: '.svg' },
      { title: 'Vecteur' },
    );
    const font = await addToLibrary(
      'font',
      { bytes: fontBytes('a'), ext: '.woff2' },
      { title: 'Inter' },
    );
    expect(svg.file).toMatch(/\.svg$/);
    expect(font.file).toBe(`files/${font.id}.woff2`);
    expect(await readFile(join(library, font.file))).toEqual(fontBytes('a'));
  });

  describe('refuses', () => {
    const png = { path: fixturePath('alpha.png'), ext: '.png' };

    it.each([
      ['a font with an image extension', 'font', png],
      ['a sticker with a font extension', 'sticker', { bytes: fontBytes('x'), ext: '.ttf' }],
      ['an extension that is not an extension', 'sticker', { ...png, ext: '.p/ng' }],
      ['no extension', 'sticker', { ...png, ext: '' }],
    ] as const)('%s', async (_label, kind, src) => {
      await expect(addToLibrary(kind, src, { title: 'T' })).rejects.toThrow();
      expect(await listLibrary(kind)).toEqual([]);
    });

    it('the template kind: templates are not library files', async () => {
      await expect(
        addToLibrary('template', { bytes: Buffer.from('{}'), ext: '.json' }, { title: 'T' }),
      ).rejects.toThrow(/template/i);
    });

    it('a source with both or neither of path and bytes', async () => {
      await expect(
        addToLibrary('sticker', { ...png, bytes: Buffer.from('x') }, { title: 'T' }),
      ).rejects.toThrow(/path or bytes/);
      await expect(addToLibrary('sticker', { ext: '.png' }, { title: 'T' })).rejects.toThrow(
        /path or bytes/,
      );
    });

    it('an empty title', async () => {
      await expect(addToLibrary('sticker', png, { title: '   ' })).rejects.toThrow(/title/);
    });

    it('a missing file, a folder, a truncated image and bytes that are not an image', async () => {
      await expect(
        addToLibrary('sticker', { path: join(work, 'absent.png'), ext: '.png' }, { title: 'T' }),
      ).rejects.toThrow();
      await expect(
        addToLibrary('sticker', { path: work, ext: '.png' }, { title: 'T' }),
      ).rejects.toThrow(/regular file/);
      await expect(
        addToLibrary(
          'sticker',
          { path: fixturePath('truncated.jpg'), ext: '.jpg' },
          { title: 'T' },
        ),
      ).rejects.toThrow();
      await expect(
        addToLibrary(
          'sticker',
          { bytes: Buffer.from('not an image'), ext: '.png' },
          { title: 'T' },
        ),
      ).rejects.toThrow();
      expect(await listLibrary('sticker')).toEqual([]);
      const files = join(library, 'files');
      expect((await exists(files)) ? await readdir(files) : []).toEqual([]);
    });
  });
});

describe('listLibrary', () => {
  it('is empty before anything was added, and does not create the folder', async () => {
    expect(await listLibrary('sticker')).toEqual([]);
    expect(await exists(library)).toBe(false);
  });

  it('lists the newest first, one kind at a time', async () => {
    const png = fixturePath('alpha.png');
    const opaque = fixturePath('opaque.png');
    const a = await addToLibrary('sticker', { path: png, ext: '.png' }, { title: 'A' });
    at('2026-05-06T08:00:00.000Z');
    const b = await addToLibrary('sticker', { path: opaque, ext: '.png' }, { title: 'B' });
    at('2026-05-06T09:00:00.000Z');
    const bg = await addToLibrary('background', { path: png, ext: '.png' }, { title: 'Fond' });
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([b.id, a.id]);
    expect((await listLibrary('background')).map((i) => i.id)).toEqual([bg.id]);
    expect(await listLibrary('font')).toEqual([]);
  });

  it('puts an item added later first even within the same millisecond', async () => {
    const a = await sticker('A');
    const b = await addToLibrary(
      'sticker',
      { path: fixturePath('opaque.png'), ext: '.png' },
      { title: 'B' },
    );
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([b.id, a.id]);
  });

  describe('with a query', () => {
    let etoile: LibraryItem;
    let nuage: LibraryItem;
    let soleil: LibraryItem;

    beforeEach(async () => {
      etoile = await sticker('Étoile filante', { tags: ['Ciel', 'nuit'] });
      at('2026-05-06T08:00:00.000Z');
      nuage = await addToLibrary(
        'sticker',
        { path: fixturePath('opaque.png'), ext: '.png' },
        { title: 'Nuage', tags: ['ciel', 'jour'] },
      );
      at('2026-05-06T09:00:00.000Z');
      soleil = await addToLibrary(
        'sticker',
        { path: fixturePath('plain.svg'), ext: '.svg' },
        { title: 'Soleil', tags: ['jour', 'été'] },
      );
    });

    const ids = async (query: Parameters<typeof listLibrary>[1]): Promise<string[]> =>
      (await listLibrary('sticker', query)).map((i) => i.id);

    it('keeps the favourites', async () => {
      await setFavourite(nuage.id, true);
      await setFavourite(etoile.id, true);
      expect(await ids({ favourite: true })).toEqual([nuage.id, etoile.id]);
      expect(await ids({ favourite: false })).toEqual([soleil.id, nuage.id, etoile.id]);
      expect(await ids({})).toEqual([soleil.id, nuage.id, etoile.id]);
    });

    it('searches the title, ignoring case and accents', async () => {
      expect(await ids({ text: 'ETOILE' })).toEqual([etoile.id]);
      expect(await ids({ text: 'étoile' })).toEqual([etoile.id]);
      expect(await ids({ text: 'nuag' })).toEqual([nuage.id]);
    });

    it('searches the tags, ignoring case and accents', async () => {
      expect(await ids({ text: 'CIEL' })).toEqual([nuage.id, etoile.id]);
      expect(await ids({ text: 'ete' })).toEqual([soleil.id]);
      expect(await ids({ text: 'Été' })).toEqual([soleil.id]);
    });

    it('wants every word of the text somewhere in the title or the tags', async () => {
      expect(await ids({ text: 'etoile nuit' })).toEqual([etoile.id]);
      expect(await ids({ text: 'ciel jour' })).toEqual([nuage.id]);
      expect(await ids({ text: 'etoile jour' })).toEqual([]);
    });

    it('takes a blank text for no filter', async () => {
      expect(await ids({ text: '   ' })).toEqual([soleil.id, nuage.id, etoile.id]);
    });

    it('combines the text and the favourites', async () => {
      await setFavourite(etoile.id, true);
      expect(await ids({ text: 'ciel', favourite: true })).toEqual([etoile.id]);
    });

    describe('recent', () => {
      it('is empty while nothing was used', async () => {
        expect(await ids({ recent: 5 })).toEqual([]);
      });

      it('returns the n most recently used, most recent first, without the unused ones', async () => {
        at('2026-06-01T10:00:00.000Z');
        await touchUsed(etoile.id);
        at('2026-06-01T11:00:00.000Z');
        await touchUsed(soleil.id);
        at('2026-06-01T12:00:00.000Z');
        await touchUsed(etoile.id);
        expect(await ids({ recent: 5 })).toEqual([etoile.id, soleil.id]);
        expect(await ids({ recent: 1 })).toEqual([etoile.id]);
        expect(await ids({ recent: 0 })).toEqual([]);
      });

      it('applies the other filters first', async () => {
        at('2026-06-01T10:00:00.000Z');
        await touchUsed(etoile.id);
        at('2026-06-01T11:00:00.000Z');
        await touchUsed(soleil.id);
        await setFavourite(etoile.id, true);
        expect(await ids({ recent: 5, favourite: true })).toEqual([etoile.id]);
        expect(await ids({ recent: 5, text: 'jour' })).toEqual([soleil.id]);
      });

      it('does not mix kinds', async () => {
        const bg = await addToLibrary(
          'background',
          { path: fixturePath('alpha.png'), ext: '.png' },
          { title: 'Fond' },
        );
        await touchUsed(bg.id);
        expect(await ids({ recent: 5 })).toEqual([]);
        expect((await listLibrary('background', { recent: 5 })).map((i) => i.id)).toEqual([bg.id]);
      });
    });
  });
});

describe('setFavourite and touchUsed', () => {
  it('sets and clears the favourite flag, and keeps it', async () => {
    const item = await sticker('A');
    await setFavourite(item.id, true);
    expect((await listLibrary('sticker'))[0]?.favourite).toBe(true);
    await setFavourite(item.id, false);
    expect((await listLibrary('sticker'))[0]?.favourite).toBe(false);
  });

  it('records when an item was last used', async () => {
    const item = await sticker('A');
    expect(item).not.toHaveProperty('lastUsedAt');
    at('2026-07-01T00:00:00.000Z');
    await touchUsed(item.id);
    expect((await listLibrary('sticker'))[0]?.lastUsedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rejects an item the library does not hold', async () => {
    await expect(setFavourite('sticker-0000000000000000', true)).rejects.toThrow(
      /Unknown library item/,
    );
    await expect(touchUsed('sticker-0000000000000000')).rejects.toThrow(/Unknown library item/);
  });
});

describe('removeFromLibrary', () => {
  it('forgets the item and deletes its file, and leaves the others alone', async () => {
    const a = await sticker('A');
    const b = await addToLibrary(
      'sticker',
      { path: fixturePath('opaque.png'), ext: '.png' },
      { title: 'B' },
    );
    await removeFromLibrary(a.id);
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([b.id]);
    expect(await exists(join(library, a.file))).toBe(false);
    expect(await exists(join(library, b.file))).toBe(true);
    expect(libraryFile(a.id)).toBeUndefined();
  });

  it('does nothing for an item that is already gone', async () => {
    const a = await sticker('A');
    await removeFromLibrary('sticker-0000000000000000');
    await removeFromLibrary(a.id);
    await removeFromLibrary(a.id);
    expect(await listLibrary('sticker')).toEqual([]);
  });

  it('lets the same bytes be added again afterwards', async () => {
    const a = await sticker('A');
    await removeFromLibrary(a.id);
    const again = await sticker('A again');
    expect(again.id).toBe(a.id);
    expect(await exists(join(library, again.file))).toBe(true);
  });
});

describe('the index on disk', () => {
  it('is replaced atomically: a failed rename keeps the previous index and leaves no temp file', async () => {
    const a = await sticker('A');
    const before = await readFile(join(library, 'index.json'), 'utf8');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to).endsWith('index.json')) throw new Error('simulated crash');
      return realRename(from, to);
    });
    await expect(
      addToLibrary('sticker', { path: fixturePath('opaque.png'), ext: '.png' }, { title: 'B' }),
    ).rejects.toThrow('simulated crash');
    expect(await readFile(join(library, 'index.json'), 'utf8')).toBe(before);
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([a.id]);
    expect(await exists(join(library, 'index.json.tmp'))).toBe(false);
    // The file of the item that never made it into the index is not left behind either.
    expect(await readdir(join(library, 'files'))).toEqual([`${a.id}.png`]);
  });

  it('ignores a half-written index.json.tmp left by a crash, and writes on', async () => {
    const a = await sticker('A');
    await writeFile(join(library, 'index.json.tmp'), '{"version": 1, "items": [{"id": "trunc');
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([a.id]);
    const b = await addToLibrary(
      'sticker',
      { path: fixturePath('opaque.png'), ext: '.png' },
      { title: 'B' },
    );
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([b.id, a.id]);
    expect(await exists(join(library, 'index.json.tmp'))).toBe(false);
  });

  it('ignores a file that no index entry names (crash between the copy and the index)', async () => {
    const orphan = join(library, 'files', 'sticker-aaaaaaaaaaaaaaaa.png');
    await mkdir(join(library, 'files'), { recursive: true });
    await writeFile(orphan, 'orphan');
    expect(await listLibrary('sticker')).toEqual([]);
    const a = await sticker('A');
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([a.id]);
  });

  it('skips entries that are malformed, or that name a file outside files/', async () => {
    const good = await sticker('Bonne');
    const index = (await indexOnDisk()) as { version: number; items: unknown[] };
    const clone = (patch: object): object => ({ ...(index.items[0] as object), ...patch });
    await writeFile(
      join(library, 'index.json'),
      JSON.stringify({
        ...index,
        items: [
          ...index.items,
          clone({ id: 'sticker-1111111111111111', file: '../../outside.png' }),
          clone({ id: 'sticker-2222222222222222', file: '/etc/passwd' }),
          clone({ id: 'sticker-3333333333333333', favourite: 'yes' }),
          clone({ id: 'not an id', file: 'files/not an id.png' }),
          clone({ id: 'sticker-4444444444444444', kind: 'video' }),
          'garbage',
          null,
        ],
      }),
    );
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([good.id]);
  });

  it('is set aside and read as empty when it is not an index, and the library works again', async () => {
    await mkdir(library, { recursive: true });
    const garbage = '{"version": 1, "items": [';
    await writeFile(join(library, 'index.json'), garbage);
    expect(await listLibrary('sticker')).toEqual([]);
    expect(await readFile(join(library, 'index.json.corrupt'), 'utf8')).toBe(garbage);
    const a = await sticker('A');
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([a.id]);
    expect(await readFile(join(library, 'index.json.corrupt'), 'utf8')).toBe(garbage);
  });

  it('is set aside when it is JSON but not an index', async () => {
    await mkdir(library, { recursive: true });
    await writeFile(join(library, 'index.json'), '["not", "an", "index"]');
    expect(await listLibrary('sticker')).toEqual([]);
    expect(await exists(join(library, 'index.json.corrupt'))).toBe(true);
  });

  it('is never replaced after a read failure that is not "no such file"', async () => {
    const a = await sticker('A');
    const before = await readFile(join(library, 'index.json'), 'utf8');
    // A directory where the index should be: reading it fails with EISDIR, not ENOENT.
    await rm(join(library, 'index.json'));
    await mkdir(join(library, 'index.json'));
    await expect(listLibrary('sticker')).rejects.toThrow(/EISDIR/);
    await expect(sticker('B')).rejects.toThrow(/EISDIR/);
    await expect(setFavourite(a.id, true)).rejects.toThrow(/EISDIR/);
    await rm(join(library, 'index.json'), { recursive: true });
    await writeFile(join(library, 'index.json'), before);
    expect((await listLibrary('sticker')).map((i) => i.id)).toEqual([a.id]);
  });

  it('keeps every item when several are added at once, and one when the bytes are the same', async () => {
    const paths = (['alpha.png', 'opaque.png', 'small.jpg', 'plain.svg'] as const).map((name) =>
      fixturePath(name),
    );
    const added = await Promise.all(
      paths.map((path, i) =>
        addToLibrary(
          'sticker',
          { path, ext: path.slice(path.lastIndexOf('.')) },
          { title: `Image ${i}` },
        ),
      ),
    );
    expect(new Set(added.map((i) => i.id)).size).toBe(4);
    expect(await listLibrary('sticker')).toHaveLength(4);

    const same = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        addToLibrary('font', { bytes: fontBytes('same'), ext: '.ttf' }, { title: `F${i}` }),
      ),
    );
    expect(new Set(same.map((i) => i.id)).size).toBe(1);
    expect(await listLibrary('font')).toHaveLength(1);
  });

  it('keeps every change when favourites and additions overlap', async () => {
    const a = await sticker('A');
    const [, b] = await Promise.all([
      setFavourite(a.id, true),
      addToLibrary('sticker', { path: fixturePath('opaque.png'), ext: '.png' }, { title: 'B' }),
      touchUsed(a.id),
    ]);
    const items = await listLibrary('sticker');
    expect(items.map((i) => i.id).sort()).toEqual([a.id, b?.id].sort());
    expect(items.find((i) => i.id === a.id)).toMatchObject({ favourite: true });
    expect(items.find((i) => i.id === a.id)?.lastUsedAt).toBeDefined();
  });
});

describe('copyIntoProject', () => {
  const book = (assets: Record<string, AssetRef> = {}): Book => ({
    ...newBook({ title: 'Mon livre' }),
    assets,
  });

  it('copies the file into assets/<sha16>.<ext> and gives the asset importFiles would give', async () => {
    const src = fixturePath('alpha.png');
    const item = await sticker('Étoile', { licence });
    const asset = await copyIntoProject(project, book(), item.id);
    const [viaImport] = await importAssetFiles(join(work, 'other.travelbook'), 'sticker', [src]);
    expect(asset).toEqual({
      ...viaImport,
      originalName: 'Étoile.png',
      licence,
    });
    expect(asset.id).toBe(item.id);
    expect(asset.file).toBe(`assets/${item.id.split('-')[1]}.png`);
    expect(await readFile(join(project, asset.file))).toEqual(await readFile(src));
  });

  it('gives no licence key when the item has none, and no pixel size to a font', async () => {
    const plain = await sticker('Nu');
    expect(await copyIntoProject(project, book(), plain.id)).not.toHaveProperty('licence');
    const font = await addToLibrary(
      'font',
      { bytes: fontBytes('f'), ext: '.otf' },
      { title: 'Inter' },
    );
    const asset = await copyIntoProject(project, book(), font.id);
    expect(asset).toMatchObject({ id: font.id, kind: 'font', originalName: 'Inter.otf' });
    expect(asset).not.toHaveProperty('pixel');
  });

  it('copies a background as a background asset', async () => {
    const item = await addToLibrary(
      'background',
      { path: fixturePath('opaque.png'), ext: '.png' },
      { title: 'Fond' },
    );
    expect(await copyIntoProject(project, book(), item.id)).toMatchObject({
      id: item.id,
      kind: 'background',
    });
  });

  it('twice gives one file and one asset', async () => {
    const item = await sticker('A', { licence });
    const first = await copyIntoProject(project, book(), item.id);
    // The renderer adds the asset to its book; the second copy sees it there.
    const second = await copyIntoProject(project, book({ [first.id]: first }), item.id);
    expect(second).toEqual(first);
    expect(await readdir(join(project, 'assets'))).toEqual([`${item.id.split('-')[1]}.png`]);
    expect(Object.keys({ [first.id]: first, [second.id]: second })).toHaveLength(1);
  });

  it('copies once even when the book does not hold the asset yet', async () => {
    const item = await sticker('A');
    const first = await copyIntoProject(project, book(), item.id);
    const second = await copyIntoProject(project, book(), item.id);
    expect(second).toEqual(first);
    expect(await readdir(join(project, 'assets'))).toHaveLength(1);
  });

  it('returns the asset the book already holds as it is, without touching the file', async () => {
    const item = await sticker('A', { licence });
    const held: AssetRef = {
      ...(await copyIntoProject(project, book(), item.id)),
      originalName: 'renamed-by-user.png',
    };
    const file = join(project, held.file);
    const before = (await stat(file)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const again = await copyIntoProject(project, book({ [held.id]: held }), item.id);
    expect(again).toEqual(held);
    expect((await stat(file)).mtimeMs).toBe(before);
  });

  it('gives the licence of the item to a held asset that has none, and never replaces one it has', async () => {
    const item = await sticker('A', { licence });
    const bare: AssetRef = { ...(await copyIntoProject(project, book(), item.id)) };
    delete bare.licence;
    expect(await copyIntoProject(project, book({ [bare.id]: bare }), item.id)).toEqual({
      ...bare,
      licence,
    });
    const own: AssetRef = { ...bare, licence: { ...licence, source: 'Autre source' } };
    expect(await copyIntoProject(project, book({ [own.id]: own }), item.id)).toEqual(own);
  });

  it('puts back a file that the book holds but the folder lost', async () => {
    const item = await sticker('A');
    const held = await copyIntoProject(project, book(), item.id);
    await rm(join(project, held.file));
    const again = await copyIntoProject(project, book({ [held.id]: held }), item.id);
    expect(again.id).toBe(held.id);
    expect(await exists(join(project, again.file))).toBe(true);
  });

  it('does not copy again a file that the project already holds from importFiles', async () => {
    const src = fixturePath('alpha.png');
    const [imported] = await importAssetFiles(project, 'sticker', [src]);
    const item = await sticker('A');
    const file = join(project, imported?.file ?? '');
    const before = (await stat(file)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const asset = await copyIntoProject(project, book(), item.id);
    expect(asset.id).toBe(imported?.id);
    expect(asset.file).toBe(imported?.file);
    expect(await readdir(join(project, 'assets'))).toHaveLength(1);
    expect((await stat(file)).mtimeMs).toBe(before);
  });

  it('rejects an unknown item and a template, and copies nothing', async () => {
    await expect(copyIntoProject(project, book(), 'sticker-0000000000000000')).rejects.toThrow(
      /Unknown library item/,
    );
    const item = await sticker('A');
    const index = (await indexOnDisk()) as { items: LibraryItem[] };
    await writeFile(
      join(library, 'index.json'),
      JSON.stringify({ ...index, items: [{ ...item, id: 'template-1', kind: 'template' }] }),
    );
    await expect(copyIntoProject(project, book(), 'template-1')).rejects.toThrow(/template/i);
    expect(await readdir(join(project, 'assets'))).toEqual([]);
  });

  it('refuses a library file that no longer has the bytes its id names, and copies nothing', async () => {
    const item = await sticker('A');
    await writeFile(join(library, item.file), await readFile(fixturePath('opaque.png')));
    await expect(copyIntoProject(project, book(), item.id)).rejects.toThrow(/changed/);
    expect(await readdir(join(project, 'assets'))).toEqual([]);
  });

  it('does not touch the library', async () => {
    const item = await sticker('A');
    const before = await readFile(join(library, 'index.json'), 'utf8');
    await copyIntoProject(project, book(), item.id);
    expect(await readFile(join(library, 'index.json'), 'utf8')).toBe(before);
  });
});

describe('the tb://library lookup', () => {
  const roots = (libraryDir: string) => ({
    projectDir: null,
    libraryDir,
    resourcesDir: join(work, 'resources'),
    asset: () => undefined,
    libraryFile,
    coverDir: () => undefined,
  });

  it('answers with the file of every listed or added item, in the shape tb://library needs', async () => {
    const item = await sticker('A');
    expect(libraryFile(item.id)).toBe(item.file);
    const resolved = resolveTbUrl(`tb://library/${item.id}`, roots(library));
    expect(resolved).toMatchObject({ ok: true, path: join(library, item.file), root: library });
  });

  it('knows the items of an existing library once primed, and none that were removed', async () => {
    const a = await sticker('A');
    const b = await addToLibrary(
      'sticker',
      { path: fixturePath('opaque.png'), ext: '.png' },
      { title: 'B' },
    );
    // A fresh start: a different folder first, so that nothing is remembered from `library`.
    setUserDataDir(join(work, 'elsewhere'));
    await listLibrary('sticker');
    expect(libraryFile(a.id)).toBeUndefined();
    setUserDataDir(userData);
    await primeLibraryLookup();
    expect(libraryFile(a.id)).toBe(a.file);
    expect(libraryFile(b.id)).toBe(b.file);
    await removeFromLibrary(a.id);
    expect(libraryFile(a.id)).toBeUndefined();
    expect(libraryFile(b.id)).toBe(b.file);
  });
});

describe('SVG files are sanitised (Task 6.2)', () => {
  const UNSAFE = /<script|onload|onclick|href="http|<foreignObject/;

  it('addToLibrary stores a sanitised SVG whose hash is its id', async () => {
    const item = await addToLibrary(
      'sticker',
      { path: fixturePath('script.svg'), ext: '.svg' },
      { title: 'Piégé' },
    );
    const stored = await readFile(join(library, item.file));
    expect(stored.toString()).not.toMatch(UNSAFE);
    expect(stored.toString()).toContain('<circle');
    expect(item.id).toBe(`sticker-${sha256(stored).slice(0, 16)}`);
    // The same file again, and the same bytes given directly, are the one item.
    const again = await addToLibrary(
      'sticker',
      { bytes: await readFile(fixturePath('script.svg')), ext: 'SVG' },
      { title: 'Piégé' },
    );
    expect(again.id).toBe(item.id);
  });

  it('keeps a plain SVG as it is drawn', async () => {
    const item = await addToLibrary(
      'sticker',
      { path: fixturePath('plain.svg'), ext: '.svg' },
      { title: 'Simple' },
    );
    const stored = await readFile(join(library, item.file), 'utf8');
    expect(stored).toContain('<rect');
    expect(stored).toContain('fill="#3366cc"');
  });

  it('refuses a file that is not an SVG, as a sticker or a background', async () => {
    await expect(
      addToLibrary('sticker', { path: fixturePath('alpha.png'), ext: '.svg' }, { title: 'Faux' }),
    ).rejects.toThrow(/Not an SVG/);
    await expect(
      addToLibrary('background', { bytes: Buffer.from('<html/>'), ext: '.svg' }, { title: 'Faux' }),
    ).rejects.toThrow();
    expect(await listLibrary('sticker')).toEqual([]);
    expect(await listLibrary('background')).toEqual([]);
  });

  it('copyIntoProject copies an SVG that is already clean byte for byte', async () => {
    const item = await addToLibrary(
      'sticker',
      { path: fixturePath('script.svg'), ext: '.svg' },
      { title: 'Piégé' },
    );
    const asset = await copyIntoProject(project, newBookWith(), item.id);
    expect(asset.id).toBe(item.id);
    expect(await readFile(join(project, asset.file))).toEqual(
      await readFile(join(library, item.file)),
    );
  });

  it('copyIntoProject sanitises a library SVG that was stored before sanitising existed', async () => {
    const raw = await readFile(fixturePath('script.svg'));
    const id = `sticker-${sha256(raw).slice(0, 16)}`;
    await mkdir(join(library, 'files'), { recursive: true });
    await writeFile(join(library, 'files', `${id}.svg`), raw);
    await writeFile(
      join(library, 'index.json'),
      JSON.stringify({
        version: 1,
        items: [
          {
            id,
            kind: 'sticker',
            file: `files/${id}.svg`,
            title: 'Ancien',
            tags: [],
            addedAt: '2026-01-01T00:00:00.000Z',
            favourite: false,
          },
        ],
      }),
    );
    const asset = await copyIntoProject(project, newBookWith(), id);
    const copied = await readFile(join(project, asset.file), 'utf8');
    expect(copied).not.toMatch(UNSAFE);
    expect(asset.originalName).toBe('Ancien.svg');
    expect(asset.file).toBe(`assets/${sha256(Buffer.from(copied)).slice(0, 16)}.svg`);
    // The library file itself is untouched, and no scratch file is left in assets/.
    expect(await readFile(join(library, 'files', `${id}.svg`))).toEqual(raw);
    expect(await readdir(join(project, 'assets'))).toEqual([asset.file.replace('assets/', '')]);
  });
});

describe('expandLibraryPaths', () => {
  it('gives the files of the kind in a dropped folder and its sub-folders, in name order', async () => {
    const drop = join(work, 'drop');
    await mkdir(join(drop, 'sub'), { recursive: true });
    await mkdir(join(drop, '.hidden'), { recursive: true });
    await mkdir(join(drop, 'mon.travelbook'), { recursive: true });
    for (const name of [
      'b10.png',
      'b2.png',
      'notes.txt',
      'sub/logo.svg',
      '.hidden/x.png',
      'mon.travelbook/y.png',
      '.dot.png',
    ]) {
      await writeFile(join(drop, name), 'x');
    }
    const single = join(work, 'single.png');
    await writeFile(single, 'x');
    expect(await expandLibraryPaths('sticker', [drop, single])).toEqual([
      join(drop, 'b2.png'),
      join(drop, 'b10.png'),
      join(drop, 'sub', 'logo.svg'),
      single,
    ]);
    // A font folder keeps fonts only.
    expect(await expandLibraryPaths('font', [drop])).toEqual([]);
  });

  it('leaves a file it cannot judge, or cannot find, to the add that follows', async () => {
    const odd = join(work, 'odd.txt');
    await writeFile(odd, 'x');
    const missing = join(work, 'missing.png');
    expect(await expandLibraryPaths('sticker', [odd, missing])).toEqual([odd, missing]);
  });
});

const newBookWith = (): Book => ({ ...newBook({ title: 'Mon livre' }), assets: {} });
