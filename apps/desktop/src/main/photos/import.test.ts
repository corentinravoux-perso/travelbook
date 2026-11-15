import { createHash } from 'node:crypto';
import { constants, createReadStream, type ReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRef, Book } from '@travelbook/core';
import {
  ensureFixtures,
  fixturePath,
  type FixtureName,
} from '../../../../../tests/fixtures/make-fixtures';
import { setUserDataDir } from '../user-data';
import { createProject } from '../project/store';
import { importPhotos, type ImportReport } from './import';

// Pass-through wrapper so a single test can slow down the reading of one file.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

// Pass-through wrapper so single tests can observe or corrupt `copyFile`.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, copyFile: vi.fn(actual.copyFile) };
});

let root: string;
let dir: string;
let book: Book;

beforeAll(async () => {
  await ensureFixtures();
});

beforeEach(async () => {
  vi.mocked(copyFile).mockClear();
  vi.mocked(createReadStream).mockClear();
  root = await mkdtemp(join(tmpdir(), 'tb-import-'));
  setUserDataDir(join(root, 'userdata'));
  const project = await createProject({ name: 'Test', parentDir: join(root, 'albums') });
  dir = project.dir;
  book = project.book;
});

afterEach(async () => {
  vi.restoreAllMocks();
  setUserDataDir(null);
  await rm(root, { recursive: true, force: true });
});

const sha256 = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const fx = (...names: FixtureName[]) => names.map((n) => fixturePath(n));
const listing = (sub: string) => readdir(join(dir, sub)).then((l) => l.sort());

/** The caller's job: fold `added` into the book. */
function withAssets(b: Book, assets: AssetRef[]): Book {
  return { ...b, assets: { ...b.assets, ...Object.fromEntries(assets.map((a) => [a.id, a])) } };
}

/** A scratch folder outside the project, filled with copies of fixtures under chosen names. */
async function folder(parts: string[], files: Record<string, FixtureName | 'text'>) {
  const base = join(root, ...parts);
  for (const [rel, source] of Object.entries(files)) {
    const target = join(base, rel);
    await mkdir(join(target, '..'), { recursive: true });
    if (source === 'text') await writeFile(target, 'not an image');
    else await copyFile(fixturePath(source), target);
  }
  return base;
}

async function sizeOf(path: string) {
  const m = await sharp(path).metadata();
  return [m.width, m.height];
}

const FIXTURE_PHOTOS: FixtureName[] = [
  'landscape.jpg',
  'portrait-o6.jpg',
  'pano.jpg',
  'small.jpg',
  'alpha.png',
  'opaque.png',
  'évasion n°1.jpg',
];

describe('importPhotos: integrity', () => {
  it('stores byte-identical originals and describes every fixture', async () => {
    const report = await importPhotos(dir, book, fx(...FIXTURE_PHOTOS));
    expect(report.failed).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.added).toHaveLength(FIXTURE_PHOTOS.length);
    for (const [i, asset] of report.added.entries()) {
      const source = fixturePath(FIXTURE_PHOTOS[i] as FixtureName);
      const digest = await sha256(source);
      const ext = source.slice(source.lastIndexOf('.') + 1);
      expect(asset.sha256).toBe(digest);
      expect(asset.id).toBe(digest.slice(0, 16));
      expect(asset.kind).toBe('photo');
      expect(asset.file).toBe(`originals/${asset.id}.${ext}`);
      expect(await sha256(join(dir, asset.file))).toBe(digest);
      expect(asset.pixel).toBeDefined();
    }
    expect(await listing('originals')).toHaveLength(FIXTURE_PHOTOS.length);
  }, 60_000);

  it('does not touch the source file', async () => {
    const source = fixturePath('small.jpg');
    const before = await readFile(source);
    await importPhotos(dir, book, [source]);
    expect((await readFile(source)).equals(before)).toBe(true);
  });

  it('copies into originals/ even if that folder was deleted', async () => {
    await rm(join(dir, 'originals'), { recursive: true });
    const report = await importPhotos(dir, book, fx('small.jpg'));
    expect(report.added).toHaveLength(1);
    expect(await listing('originals')).toEqual([`${report.added[0]?.id}.jpg`]);
  });

  it('writes both proxies for every added asset', async () => {
    const report = await importPhotos(dir, book, fx('small.jpg', 'opaque.png'));
    const ids = report.added.map((a) => a.id);
    expect(await listing('cache')).toEqual(
      ids.flatMap((id) => [`${id}.preview.jpg`, `${id}.thumb.jpg`]).sort(),
    );
  });

  it('does not mutate the book and works on a frozen one', async () => {
    const frozen = structuredClone(book);
    const freeze = (o: object): void => {
      Object.values(o).forEach((v) => typeof v === 'object' && v !== null && freeze(v));
      Object.freeze(o);
    };
    freeze(frozen);
    const before = JSON.stringify(frozen);
    const report = await importPhotos(dir, frozen, fx('small.jpg'));
    expect(report.added).toHaveLength(1);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

describe('importPhotos: asset description', () => {
  it('Review Focus 1: portrait-o6.jpg is 4000 x 6000, its preview 1707 x 2560, its original untouched', async () => {
    const source = fixturePath('portrait-o6.jpg');
    const { added } = await importPhotos(dir, book, [source]);
    const asset = added[0] as AssetRef;
    expect(asset.pixel).toEqual({ w: 4000, h: 6000 });
    expect(asset.exif?.orientation).toBe(6);
    expect(await sizeOf(join(dir, 'cache', `${asset.id}.preview.jpg`))).toEqual([1707, 2560]);
    const stored = join(dir, asset.file);
    expect((await sharp(stored).metadata()).orientation).toBe(6);
    expect((await readFile(stored)).equals(await readFile(source))).toBe(true);
  }, 30_000);

  it('small.jpg gets an 800 x 600 preview, not an enlarged one', async () => {
    const { added } = await importPhotos(dir, book, fx('small.jpg'));
    const id = added[0]?.id;
    expect(await sizeOf(join(dir, 'cache', `${id}.preview.jpg`))).toEqual([800, 600]);
    expect(await sizeOf(join(dir, 'cache', `${id}.thumb.jpg`))).toEqual([320, 240]);
  });

  it('keeps accents and spaces in originalName', async () => {
    const { added } = await importPhotos(dir, book, fx('évasion n°1.jpg'));
    expect(added[0]?.originalName).toBe('évasion n°1.jpg'.normalize('NFC'));
    expect(added[0]?.file).toMatch(/^originals\/[0-9a-f]{16}\.jpg$/);
  });

  it('records EXIF capture data when the file has some', async () => {
    const path = join(root, 'shot.jpg');
    await sharp(fixturePath('small.jpg'))
      .withExif({
        IFD0: { Make: 'Fuji', Model: 'X100V' },
        IFD2: { DateTimeOriginal: '2024:05:01 18:45:00' },
      })
      .jpeg()
      .toFile(path);
    const { added } = await importPhotos(dir, book, [path]);
    expect(added[0]?.exif).toMatchObject({ camera: 'Fuji X100V', takenAt: '2024-05-01T18:45:00' });
  });

  it('lower-cases the stored extension', async () => {
    const base = await folder(['in'], {
      'A.JPG': 'small.jpg',
      'B.JpEg': 'landscape.jpg',
      'C.PNG': 'opaque.png',
    });
    const { added } = await importPhotos(dir, book, [base]);
    expect(added.map((a) => a.file.split('.').pop())).toEqual(['jpg', 'jpeg', 'png']);
    expect(added.map((a) => a.originalName)).toEqual(['A.JPG', 'B.JpEg', 'C.PNG']);
  });
});

describe('importPhotos: duplicates', () => {
  it('importing the same file twice gives one asset and one duplicates entry', async () => {
    const source = fixturePath('small.jpg');
    const first = await importPhotos(dir, book, [source]);
    expect(first.added).toHaveLength(1);
    const second = await importPhotos(dir, withAssets(book, first.added), [source]);
    expect(second.added).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(second.duplicates).toEqual([{ path: source, assetId: first.added[0]?.id }]);
    expect(await listing('originals')).toHaveLength(1);
  });

  it('detects the same bytes under another name, and inside one batch', async () => {
    const copy = join(root, 'copie de small.JPEG');
    await copyFile(fixturePath('small.jpg'), copy);
    const source = fixturePath('small.jpg');
    const { added, duplicates, failed } = await importPhotos(dir, book, [source, copy, source]);
    expect(failed).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]?.originalName).toBe('small.jpg');
    expect(duplicates).toEqual([
      { path: copy, assetId: added[0]?.id },
      { path: source, assetId: added[0]?.id },
    ]);
    expect(await listing('originals')).toEqual([`${added[0]?.id}.jpg`]);
  });

  it('keeps the first given of identical files even when it is the slowest to read', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    const first = join(root, 'first.jpg');
    const second = join(root, 'second.jpg');
    await copyFile(fixturePath('small.jpg'), first);
    await copyFile(fixturePath('small.jpg'), second);
    vi.mocked(createReadStream).mockImplementationOnce((path, options) => {
      const stream = actual.createReadStream(path, options);
      const late = async function* () {
        await new Promise((resolve) => setTimeout(resolve, 100));
        yield* stream;
      };
      return Readable.from(late()) as unknown as ReadStream;
    });
    const { added, duplicates } = await importPhotos(dir, book, [first, second]);
    expect(added.map((a) => a.originalName)).toEqual(['first.jpg']);
    expect(duplicates).toEqual([{ path: second, assetId: added[0]?.id }]);
  });

  it('does not re-copy or re-render a file that is already in the book', async () => {
    const first = await importPhotos(dir, book, fx('small.jpg'));
    const asset = first.added[0] as AssetRef;
    const before = await listing('cache');
    await rm(join(dir, 'cache'), { recursive: true });
    const second = await importPhotos(dir, withAssets(book, first.added), fx('small.jpg'));
    expect(second.duplicates).toHaveLength(1);
    expect(before).toEqual([`${asset.id}.preview.jpg`, `${asset.id}.thumb.jpg`]);
    await expect(readdir(join(dir, 'cache'))).rejects.toThrow();
  });

  it('reports identical broken files as failures, not as duplicates of nothing', async () => {
    const a = join(root, 'a-truncated.jpg');
    const b = join(root, 'b-truncated.jpg');
    await copyFile(fixturePath('truncated.jpg'), a);
    await copyFile(fixturePath('truncated.jpg'), b);
    const report = await importPhotos(dir, book, [a, b]);
    expect(report.added).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.failed.map((f) => f.path)).toEqual([a, b]);
  });
});

describe('importPhotos: a photo of the book whose original is gone', () => {
  /** The book of an album that imported `name`, whose original was then lost from `originals/`. */
  async function lostOriginal(name: FixtureName) {
    const first = await importPhotos(dir, book, fx(name));
    const asset = first.added[0] as AssetRef;
    await rm(join(dir, asset.file));
    return { asset, lost: withAssets(book, first.added) };
  }

  it('puts the original back from the same file, checked by its hash, and reports it as restored', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    const source = fixturePath('small.jpg');
    const report = await importPhotos(dir, lost, [source]);
    expect(report).toEqual({
      added: [],
      duplicates: [],
      restored: [{ path: source, assetId: asset.id }],
      failed: [],
    } satisfies ImportReport);
    expect(await sha256(join(dir, asset.file))).toBe(asset.sha256);
    expect(await listing('originals')).toEqual([`${asset.id}.jpg`]);
  });

  it('puts the file where the book says, whatever the new name and extension', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    const renamed = join(root, 'copie de small.JPEG');
    await copyFile(fixturePath('small.jpg'), renamed);
    const report = await importPhotos(dir, lost, [renamed]);
    expect(report.restored).toEqual([{ path: renamed, assetId: asset.id }]);
    expect(await listing('originals')).toEqual([`${asset.id}.jpg`]);
  });

  it('renders the proxies again when the cache is gone too', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    await rm(join(dir, 'cache'), { recursive: true });
    await importPhotos(dir, lost, fx('small.jpg'));
    expect(await listing('cache')).toEqual([`${asset.id}.preview.jpg`, `${asset.id}.thumb.jpg`]);
  });

  it('restores once when the same file comes twice in a batch', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    const twin = join(root, 'jumeau.jpg');
    await copyFile(fixturePath('small.jpg'), twin);
    const report = await importPhotos(dir, lost, [fixturePath('small.jpg'), twin]);
    expect(report.restored).toEqual([{ path: fixturePath('small.jpg'), assetId: asset.id }]);
    expect(report.duplicates).toEqual([{ path: twin, assetId: asset.id }]);
    expect(await listing('originals')).toEqual([`${asset.id}.jpg`]);
  });

  it('leaves a present original alone: a plain duplicate, nothing written', async () => {
    const first = await importPhotos(dir, book, fx('small.jpg', 'opaque.png'));
    const [small, opaque] = first.added as [AssetRef, AssetRef];
    await rm(join(dir, opaque.file));
    const before = await readFile(join(dir, small.file));
    const report = await importPhotos(
      dir,
      withAssets(book, first.added),
      fx('small.jpg', 'opaque.png'),
    );
    expect(report.duplicates).toEqual([{ path: fixturePath('small.jpg'), assetId: small.id }]);
    expect(report.restored).toEqual([{ path: fixturePath('opaque.png'), assetId: opaque.id }]);
    expect((await readFile(join(dir, small.file))).equals(before)).toBe(true);
  });

  it('never overwrites a file that is there, even a damaged one', async () => {
    const first = await importPhotos(dir, book, fx('small.jpg'));
    const asset = first.added[0] as AssetRef;
    await writeFile(join(dir, asset.file), 'damaged');
    const report = await importPhotos(dir, withAssets(book, first.added), fx('small.jpg'));
    expect(report.duplicates).toHaveLength(1);
    expect(report.restored).toEqual([]);
    expect(await readFile(join(dir, asset.file), 'utf8')).toBe('damaged');
  });

  it('refuses a restore that does not match the source, and leaves nothing behind', async () => {
    const { lost } = await lostOriginal('small.jpg');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(copyFile).mockImplementation(async (src, dst, mode) => {
      await actual.copyFile(src, dst, mode);
      await actual.appendFile(dst, 'x');
    });
    try {
      const report = await importPhotos(dir, lost, fx('small.jpg'));
      expect(report.restored).toEqual([]);
      expect(report.failed.map((f) => f.path)).toEqual([fixturePath('small.jpg')]);
      expect(report.failed[0]?.reason).toMatch(/changed|differ|match/i);
      expect(await listing('originals')).toEqual([]);
    } finally {
      vi.mocked(copyFile).mockImplementation(actual.copyFile);
    }
  });

  it('does not write outside originals/ for a book that names another place', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    const hostile = withAssets(lost, [{ ...asset, file: '../escaped.jpg' }]);
    const report = await importPhotos(dir, hostile, fx('small.jpg'));
    expect(report.restored).toEqual([]);
    expect(report.duplicates).toHaveLength(1);
    expect(await readdir(root)).not.toContain('escaped.jpg');
    expect(await listing('originals')).toEqual([]);
  });

  it('does not trust the id a record gives itself for a place either', async () => {
    const { asset, lost } = await lostOriginal('small.jpg');
    const record: AssetRef = { ...asset, id: '../escaped', file: 'originals/../escaped.jpg' };
    const tricked: Book = { ...lost, assets: { [asset.id]: record } };
    const report = await importPhotos(dir, tricked, fx('small.jpg'));
    expect(report.restored).toEqual([]);
    expect(await readdir(root)).not.toContain('escaped.jpg');
  });
});

describe('importPhotos: failures', () => {
  it('Review Focus 4: truncated.jpg fails alone, pano.jpg imports, nothing partial is left', async () => {
    const report = await importPhotos(dir, book, fx('truncated.jpg', 'pano.jpg'));
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.path).toBe(fixturePath('truncated.jpg'));
    expect(report.failed[0]?.reason).toMatch(/\S/);
    expect(report.added).toHaveLength(1);
    expect(report.added[0]?.originalName).toBe('pano.jpg');
    const id = report.added[0]?.id;
    expect(await sizeOf(join(dir, 'cache', `${id}.preview.jpg`))).toEqual([2560, 640]);
    expect(await listing('originals')).toEqual([`${id}.jpg`]);
    expect(await listing('cache')).toEqual([`${id}.preview.jpg`, `${id}.thumb.jpg`]);
  }, 30_000);

  it('does not let one failure stop the files after it', async () => {
    const report = await importPhotos(dir, book, fx('truncated.jpg', 'small.jpg', 'opaque.png'));
    expect(report.added.map((a) => a.originalName)).toEqual(['small.jpg', 'opaque.png']);
    expect(report.failed).toHaveLength(1);
  });

  it('fails a file that is not an image although its name says so', async () => {
    const fake = await folder(['fake'], { 'notes.jpg': 'text', 'drawing.png': 'plain.svg' });
    const report = await importPhotos(dir, book, [
      join(fake, 'notes.jpg'),
      join(fake, 'drawing.png'),
    ]);
    expect(report.added).toEqual([]);
    expect(report.failed.map((f) => f.path)).toEqual([
      join(fake, 'notes.jpg'),
      join(fake, 'drawing.png'),
    ]);
    expect(await listing('originals')).toEqual([]);
    expect(await listing('cache')).toEqual([]);
  });

  it('fails a named file with an unsupported extension, and a missing file', async () => {
    const missing = join(root, 'nope.jpg');
    const report = await importPhotos(dir, book, [...fx('script.svg'), missing]);
    expect(report.added).toEqual([]);
    expect(report.failed.map((f) => f.path)).toEqual([fixturePath('script.svg'), missing]);
    expect(report.failed[0]?.reason).toMatch(/unsupported/i);
    expect(report.failed[1]?.reason).toMatch(/not found|no such/i);
    expect(await listing('originals')).toEqual([]);
  });

  it('removes the copy when a later step fails', async () => {
    // Make the proxies fail after the copy happened: a PNG cut in the middle of its data.
    const png = await readFile(fixturePath('opaque.png'));
    const cut = join(root, 'cut.png');
    await writeFile(cut, png.subarray(0, Math.floor(png.length / 2)));
    const report = await importPhotos(dir, book, [cut]);
    expect(report.failed.map((f) => f.path)).toEqual([cut]);
    expect(await listing('originals')).toEqual([]);
    expect(await listing('cache')).toEqual([]);
  });

  it('fails a file whose copy cannot be written, with the batch still going', async () => {
    // A directory squatting on the destination name makes the copy fail.
    const bytes = await readFile(fixturePath('small.jpg'));
    const id = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    await mkdir(join(dir, 'originals', `${id}.jpg`));
    const report = await importPhotos(dir, book, fx('small.jpg', 'opaque.png'));
    expect(report.failed.map((f) => f.path)).toEqual([fixturePath('small.jpg')]);
    expect(report.added.map((a) => a.originalName)).toEqual(['opaque.png']);
    // It was not ours: it stays.
    expect(await listing('originals')).toContain(`${id}.jpg`);
  });
});

describe('importPhotos: folders', () => {
  it('Review Focus 3: évasion n°1.jpg inside a folder Été 2026 imports with its accents', async () => {
    const base = await folder(['Été 2026'], { 'évasion n°1.jpg': 'évasion n°1.jpg' });
    const { added, failed } = await importPhotos(dir, book, [base]);
    expect(failed).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]?.originalName).toBe('évasion n°1.jpg'.normalize('NFC'));
    expect(await sha256(join(dir, added[0]?.file as string))).toBe(
      await sha256(join(base, 'évasion n°1.jpg')),
    );
  });

  it('expands a folder one level deep, matches extensions in any case, skips other files', async () => {
    const base = await folder(['Été 2026'], {
      'a.jpg': 'small.jpg',
      'b.JPEG': 'landscape.jpg',
      'c.Png': 'opaque.png',
      'd.webp': 'small.jpg',
      'notes.txt': 'text',
      'logo.svg': 'plain.svg',
      '.hidden.jpg': 'small.jpg',
      'sub/deep.jpg': 'pano.jpg',
    });
    await sharp(fixturePath('small.jpg')).webp().toFile(join(base, 'd.webp'));
    const report = await importPhotos(dir, book, [base]);
    expect(report.failed).toEqual([]);
    expect(report.added.map((a) => a.originalName)).toEqual(['a.jpg', 'b.JPEG', 'c.Png', 'd.webp']);
    // a.jpg and .hidden.jpg are the same bytes; the hidden one is skipped before it is read.
    expect(report.duplicates).toEqual([]);
  });

  it('goes into sub-folders on request, skipping hidden ones', async () => {
    const base = await folder(['trip'], {
      'a.jpg': 'small.jpg',
      'day 1/b.jpg': 'opaque.png',
      'day 1/c/deeper.jpg': 'landscape.jpg',
      '.cache/d.jpg': 'pano.jpg',
    });
    // Same bytes as a.jpg but not hidden, so it must show up as a duplicate.
    await copyFile(fixturePath('small.jpg'), join(base, 'day 1', 'again.jpg'));
    const flat = await importPhotos(dir, book, [base]);
    expect(flat.added.map((a) => a.originalName)).toEqual(['a.jpg']);

    const deep = await importPhotos(dir, withAssets(book, flat.added), [base], undefined, {
      recursive: true,
    });
    expect(deep.added.map((a) => a.originalName)).toEqual(['b.jpg', 'deeper.jpg']);
    expect(deep.duplicates.map((d) => basename(d.path))).toEqual(['a.jpg', 'again.jpg']);
  }, 30_000);

  it('does not walk into album folders when going recursive', async () => {
    const base = await folder(['library'], {
      'a.jpg': 'small.jpg',
      'Autre album.travelbook/originals/x.jpg': 'landscape.jpg',
      'Autre album.travelbook/cache/x.thumb.jpg': 'pano.jpg',
    });
    const { added } = await importPhotos(dir, book, [base], undefined, { recursive: true });
    expect(added.map((a) => a.originalName)).toEqual(['a.jpg']);
  });

  it('imports files in name order, numbers compared as numbers', async () => {
    const base = await folder(['order'], {
      'IMG_10.jpg': 'small.jpg',
      'IMG_2.jpg': 'opaque.png',
      'IMG_1.jpg': 'landscape.jpg',
    });
    const { added } = await importPhotos(dir, book, [base]);
    expect(added.map((a) => a.originalName)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });

  it('keeps the report in the order of the given paths, not of completion', async () => {
    // The panorama is by far the slowest and is first.
    const report = await importPhotos(
      dir,
      book,
      fx('pano.jpg', 'small.jpg', 'opaque.png', 'alpha.png'),
    );
    expect(report.added.map((a) => a.originalName)).toEqual([
      'pano.jpg',
      'small.jpg',
      'opaque.png',
      'alpha.png',
    ]);
  }, 30_000);

  it('accepts files and folders mixed', async () => {
    const base = await folder(['mix'], { 'one.jpg': 'small.jpg' });
    const { added } = await importPhotos(dir, book, [fixturePath('opaque.png'), base]);
    expect(added.map((a) => a.originalName)).toEqual(['opaque.png', 'one.jpg']);
  });

  it('reports a dangling symbolic link as a failure and imports the rest', async () => {
    const base = await folder(['locked'], { 'a.jpg': 'small.jpg' });
    await symlink(join(root, 'does-not-exist'), join(base, 'dangling.jpg'));
    const report = await importPhotos(dir, book, [base]);
    expect(report.added.map((a) => a.originalName)).toEqual(['a.jpg']);
    expect(report.failed.map((f) => f.path)).toEqual([join(base, 'dangling.jpg')]);
  });
});

describe('importPhotos: progress', () => {
  it('calls onProgress once per file and ends at (n, n)', async () => {
    const calls: [number, number][] = [];
    await importPhotos(
      dir,
      book,
      fx('small.jpg', 'opaque.png', 'truncated.jpg', 'alpha.png'),
      (d, t) => calls.push([d, t]),
    );
    expect(calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('counts the files of an expanded folder and counts duplicates and failures', async () => {
    const base = await folder(['p'], {
      'a.jpg': 'small.jpg',
      'b.jpg': 'small.jpg',
      'c.jpg': 'truncated.jpg',
    });
    const calls: [number, number][] = [];
    await importPhotos(dir, book, [base, join(root, 'missing.jpg')], (d, t) => calls.push([d, t]));
    expect(calls.map(([, t]) => t)).toEqual([4, 4, 4, 4]);
    expect(calls.map(([d]) => d)).toEqual([1, 2, 3, 4]);
  });

  it('is never called for an empty import', async () => {
    const onProgress = vi.fn();
    const empty = await folder(['empty'], { 'notes.txt': 'text' });
    const report = await importPhotos(dir, book, [empty], onProgress);
    expect(report).toEqual({
      added: [],
      duplicates: [],
      restored: [],
      failed: [],
    } satisfies ImportReport);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('survives a callback that throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const report = await importPhotos(dir, book, fx('small.jpg', 'opaque.png'), () => {
      throw new Error('window destroyed');
    });
    expect(report.added).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe('importPhotos: project path with spaces and accents', () => {
  it('imports into <parentDir>/Été 2026/mon album n°1.travelbook', async () => {
    const project = await createProject({
      name: 'Mon album n°1',
      parentDir: join(root, 'Été 2026'),
    });
    expect(project.dir).toContain('Été 2026');
    const report = await importPhotos(
      project.dir,
      project.book,
      fx('small.jpg', 'évasion n°1.jpg'),
    );
    expect(report.failed).toEqual([]);
    expect(report.added).toHaveLength(2);
    for (const a of report.added) {
      expect((await readdir(join(project.dir, 'cache'))).includes(`${a.id}.thumb.jpg`)).toBe(true);
      expect(await sha256(join(project.dir, a.file))).toBe(a.sha256);
    }
  });
});

describe('importPhotos: copy verification', () => {
  it('rejects a stored copy that differs from the source and removes it', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(copyFile).mockImplementation(async (src, dst, mode) => {
      await actual.copyFile(src, dst, mode);
      if (src === fixturePath('small.jpg')) await actual.appendFile(dst, 'x');
    });
    try {
      const report = await importPhotos(dir, book, fx('small.jpg', 'opaque.png'));
      expect(report.failed.map((f) => f.path)).toEqual([fixturePath('small.jpg')]);
      expect(report.failed[0]?.reason).toMatch(/changed|differ|match/i);
      expect(report.added.map((a) => a.originalName)).toEqual(['opaque.png']);
      expect(await listing('originals')).toEqual([`${report.added[0]?.id}.png`]);
    } finally {
      vi.mocked(copyFile).mockImplementation(actual.copyFile);
    }
  });

  it('copies with a reflink when the file system has one, a plain copy otherwise', async () => {
    await importPhotos(dir, book, fx('small.jpg'));
    expect(vi.mocked(copyFile)).toHaveBeenCalledWith(
      fixturePath('small.jpg'),
      expect.stringMatching(/originals[\\/][0-9a-f]{16}\.jpg$/),
      constants.COPYFILE_FICLONE,
    );
  });
});
