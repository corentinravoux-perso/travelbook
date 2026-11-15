import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook } from '@travelbook/core';
import { fixturePath } from '../../../../../tests/fixtures/make-fixtures';
import { sanitizeSvg } from '../library/stickers/sanitizeSvg';
import { importPhotos } from '../photos/import';
import { importAssetFiles } from './import-files';

let work: string;
let project: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-assets-'));
  // Spaces and accents in the project path, on purpose.
  project = join(work, 'Été 2026', 'mon livre.travelbook');
  await mkdir(join(project, 'assets'), { recursive: true });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const sha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const listAssets = async (): Promise<string[]> => (await readdir(join(project, 'assets'))).sort();

describe('importAssetFiles', () => {
  it('copies a sticker to assets/<sha16>.<ext> byte for byte and measures it', async () => {
    const src = fixturePath('alpha.png');
    const [asset, ...rest] = await importAssetFiles(project, 'sticker', [src]);
    const sha = await sha256(src);
    expect(rest).toEqual([]);
    expect(asset).toEqual({
      id: `sticker-${sha.slice(0, 16)}`,
      kind: 'sticker',
      file: `assets/${sha.slice(0, 16)}.png`,
      originalName: 'alpha.png',
      sha256: sha,
      pixel: { w: 400, h: 300 },
    });
    expect(await sha256(join(project, 'assets', `${sha.slice(0, 16)}.png`))).toBe(sha);
    expect(await listAssets()).toEqual([`${sha.slice(0, 16)}.png`]);
  });

  it('names an asset <kind>-<sha16> and keeps the file name <sha16>.<ext>', async () => {
    const png = fixturePath('alpha.png');
    const sha16 = (await sha256(png)).slice(0, 16);
    for (const kind of ['sticker', 'background', 'pattern'] as const) {
      const [asset] = await importAssetFiles(project, kind, [png]);
      expect(asset?.id).toBe(`${kind}-${sha16}`);
      expect(asset?.file).toBe(`assets/${sha16}.png`);
    }
    const font = join(work, 'Inter.woff2');
    await writeFile(font, 'font bytes');
    const [asset] = await importAssetFiles(project, 'font', [font]);
    expect(asset?.id).toBe(`font-${(await sha256(font)).slice(0, 16)}`);
  });

  it('never gives an asset the id of a photo with the same bytes', async () => {
    const src = fixturePath('small.jpg');
    const report = await importPhotos(project, newBook({ title: 'A' }), [src]);
    const photo = report.added[0];
    const [background] = await importAssetFiles(project, 'background', [src]);
    // The photo keeps the bare sha16 (Task 3.2); the asset lives in its own id space.
    expect(photo?.id).toMatch(/^[0-9a-f]{16}$/);
    expect(background?.id).toBe(`background-${photo?.id}`);
    expect(background?.id).not.toBe(photo?.id);
    expect(background?.sha256).toBe(photo?.sha256);
    expect(background?.file).toBe(`assets/${photo?.id}.jpg`);
    expect(photo?.file).toBe(`originals/${photo?.id}.jpg`);
  });

  it('keeps one file and two assets when the same bytes come as two kinds', async () => {
    const src = fixturePath('alpha.png');
    const [sticker] = await importAssetFiles(project, 'sticker', [src]);
    const [pattern] = await importAssetFiles(project, 'pattern', [src]);
    expect(sticker?.id).not.toBe(pattern?.id);
    expect(sticker?.file).toBe(pattern?.file);
    expect(await listAssets()).toHaveLength(1);
  });

  it('measures the size after EXIF orientation', async () => {
    const [asset] = await importAssetFiles(project, 'background', [fixturePath('portrait-o6.jpg')]);
    expect(asset?.pixel).toEqual({ w: 4000, h: 6000 });
  });

  it('keeps an accented, spaced file name as the original name', async () => {
    const [asset] = await importAssetFiles(project, 'pattern', [fixturePath('évasion n°1.jpg')]);
    expect(asset?.originalName).toBe('évasion n°1.jpg'.normalize('NFC'));
    expect(asset?.file).toMatch(/^assets\/[0-9a-f]{16}\.jpg$/);
  });

  it('lower-cases the extension', async () => {
    const upper = join(work, 'STICKER.PNG');
    await writeFile(upper, await readFile(fixturePath('opaque.png')));
    const [asset] = await importAssetFiles(project, 'sticker', [upper]);
    expect(asset?.file).toMatch(/^assets\/[0-9a-f]{16}\.png$/);
    expect(asset?.originalName).toBe('STICKER.PNG');
  });

  it('stores an SVG sanitised and with no pixel size', async () => {
    const [asset] = await importAssetFiles(project, 'sticker', [fixturePath('script.svg')]);
    expect(asset).not.toHaveProperty('pixel');
    const stored = await readFile(join(project, asset?.file ?? ''), 'utf8');
    expect(stored).not.toMatch(/script|onload|onclick/i);
    expect(stored).toContain('<circle');
  });

  it('takes a font file without looking inside', async () => {
    const font = join(work, 'Inter.woff2');
    await writeFile(font, Buffer.from('wOF2 not really a font'));
    const [asset] = await importAssetFiles(project, 'font', [font]);
    expect(asset).toMatchObject({ kind: 'font', originalName: 'Inter.woff2' });
    expect(asset).not.toHaveProperty('pixel');
    expect(asset?.file).toMatch(/^assets\/[0-9a-f]{16}\.woff2$/);
  });

  it('returns one asset and keeps one file when the same bytes come twice', async () => {
    const src = fixturePath('alpha.png');
    const copy = join(work, 'copy of alpha.png');
    await writeFile(copy, await readFile(src));
    const first = await importAssetFiles(project, 'sticker', [src, copy]);
    const again = await importAssetFiles(project, 'sticker', [src]);
    expect(first).toHaveLength(1);
    expect(again).toEqual(first);
    expect(await listAssets()).toHaveLength(1);
  });

  it('returns the assets in the order of the given paths', async () => {
    const out = await importAssetFiles(project, 'background', [
      fixturePath('small.jpg'),
      fixturePath('opaque.png'),
      fixturePath('alpha.png'),
    ]);
    expect(out.map((a) => a.originalName)).toEqual(['small.jpg', 'opaque.png', 'alpha.png']);
  });

  it('never modifies the source', async () => {
    const src = join(work, 'sticker.png');
    await writeFile(src, await readFile(fixturePath('alpha.png')));
    const before = await sha256(src);
    await importAssetFiles(project, 'sticker', [src]);
    expect(await sha256(src)).toBe(before);
  });

  it('creates assets/ when the project folder lacks it', async () => {
    await rm(join(project, 'assets'), { recursive: true });
    await importAssetFiles(project, 'sticker', [fixturePath('alpha.png')]);
    expect(await listAssets()).toHaveLength(1);
  });

  describe('refusals', () => {
    it.each([
      ['a font as a sticker', 'sticker', 'Inter.woff2'],
      ['a font as a background', 'background', 'Inter.ttf'],
      ['an image as a font', 'font', 'alpha.png'],
      ['a text file', 'sticker', 'notes.txt'],
      ['a GIF', 'sticker', 'anim.gif'],
      ['a file with no extension', 'background', 'README'],
    ] as const)('rejects %s', async (_label, kind, name) => {
      const file = join(work, name);
      await writeFile(file, 'x');
      await expect(importAssetFiles(project, kind, [file])).rejects.toThrow(name);
      expect(await listAssets()).toEqual([]);
    });

    it('rejects a truncated image and leaves nothing behind', async () => {
      await expect(
        importAssetFiles(project, 'background', [fixturePath('truncated.jpg')]),
      ).rejects.toThrow(/truncated\.jpg/);
      expect(await listAssets()).toEqual([]);
    });

    it('rejects a text file that wears an image extension', async () => {
      const fake = join(work, 'fake.png');
      await writeFile(fake, 'this is not a PNG');
      await expect(importAssetFiles(project, 'sticker', [fake])).rejects.toThrow(/fake\.png/);
      expect(await listAssets()).toEqual([]);
    });

    it('rejects a JPEG named .svg', async () => {
      const fake = join(work, 'fake.svg');
      await writeFile(fake, await readFile(fixturePath('small.jpg')));
      await expect(importAssetFiles(project, 'sticker', [fake])).rejects.toThrow(/fake\.svg/);
      expect(await listAssets()).toEqual([]);
    });

    it('rejects a missing file and a folder', async () => {
      await expect(
        importAssetFiles(project, 'sticker', [join(work, 'missing.png')]),
      ).rejects.toThrow(/missing\.png/);
      await mkdir(join(work, 'folder.png'));
      await expect(
        importAssetFiles(project, 'sticker', [join(work, 'folder.png')]),
      ).rejects.toThrow(/folder\.png/);
    });

    it('rejects the photo kind: photos have their own import', async () => {
      await expect(
        importAssetFiles(project, 'photo' as never, [fixturePath('small.jpg')]),
      ).rejects.toThrow(/photo/);
      expect(await listAssets()).toEqual([]);
    });

    it('removes what the call copied when a later file fails, and keeps what was there before', async () => {
      const [before] = await importAssetFiles(project, 'sticker', [fixturePath('opaque.png')]);
      await expect(
        importAssetFiles(project, 'sticker', [
          fixturePath('opaque.png'),
          fixturePath('alpha.png'),
          fixturePath('truncated.jpg'),
        ]),
      ).rejects.toThrow(/truncated\.jpg/);
      expect(await listAssets()).toEqual([before?.file.replace('assets/', '')]);
    });

    describe('SVG files', () => {
      const dirty =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
        '<script>alert(1)</script><rect width="10" height="10"/></svg>';
      // The sanitiser's own output: sanitising it again changes nothing.
      const clean = sanitizeSvg(dirty);

      it('stores a sanitised copy and hashes what it stores', async () => {
        const src = join(work, 'dirty.svg');
        await writeFile(src, dirty);
        const [asset] = await importAssetFiles(project, 'sticker', [src]);
        const stored = await readFile(join(project, asset!.file), 'utf8');
        expect(stored).not.toMatch(/script|onload/i);
        expect(stored).toContain('<rect');
        expect(asset?.sha256).toBe(await sha256(join(project, asset!.file)));
        expect(asset?.originalName).toBe('dirty.svg');
        expect(await readFile(src, 'utf8')).toBe(dirty);
      });

      it('copies a clean SVG as it is', async () => {
        const src = join(work, 'clean.svg');
        await writeFile(src, clean);
        const [asset] = await importAssetFiles(project, 'background', [src]);
        expect(asset?.sha256).toBe(await sha256(src));
      });

      it('refuses a file that is not an SVG and leaves nothing behind', async () => {
        const src = join(work, 'fake.svg');
        await writeFile(src, '<html><body>no</body></html>');
        await expect(importAssetFiles(project, 'sticker', [src])).rejects.toThrow(/fake\.svg/);
        expect(await listAssets()).toEqual([]);
      });
    });
  });
});
