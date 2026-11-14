import { copyFile, mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AssetRef } from '@travelbook/core';
import {
  ensureFixtures,
  fixturePath,
  type FixtureName,
} from '../../../../../tests/fixtures/make-fixtures';
import { ensureProxies } from './proxies';

let root: string;
let dir: string;

beforeAll(async () => {
  await ensureFixtures();
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-proxies-'));
  dir = join(root, 'project');
  await mkdir(join(dir, 'originals'), { recursive: true });
  await mkdir(join(dir, 'cache'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Put a fixture (or any file) in `originals/` and describe it as an asset. */
async function stage(source: FixtureName | string, id: string, ext = 'jpg'): Promise<AssetRef> {
  const from = source.includes('/') ? source : fixturePath(source as FixtureName);
  await copyFile(from, join(dir, 'originals', `${id}.${ext}`));
  return {
    id,
    kind: 'photo',
    file: `originals/${id}.${ext}`,
    originalName: `${id}.${ext}`,
    sha256: 'f'.repeat(64),
  };
}

async function size(path: string): Promise<[number, number]> {
  const m = await sharp(path).metadata();
  return [m.width, m.height];
}

describe('ensureProxies', () => {
  it('writes cache/<id>.preview.jpg and cache/<id>.thumb.jpg and returns their paths', async () => {
    const asset = await stage('landscape.jpg', 'land');
    const { preview, thumb } = await ensureProxies(dir, asset);
    expect(preview).toBe(join(dir, 'cache', 'land.preview.jpg'));
    expect(thumb).toBe(join(dir, 'cache', 'land.thumb.jpg'));
    expect(await size(preview)).toEqual([2560, 1707]);
    expect(await size(thumb)).toEqual([320, 213]);
    expect((await sharp(preview).metadata()).format).toBe('jpeg');
    expect((await sharp(thumb).metadata()).format).toBe('jpeg');
  });

  it('leaves nothing but the two proxies in cache/', async () => {
    await ensureProxies(dir, await stage('small.jpg', 'a'));
    expect((await readdir(join(dir, 'cache'))).sort()).toEqual(['a.preview.jpg', 'a.thumb.jpg']);
  });

  it('applies the EXIF orientation: 6000 x 4000 stored with orientation 6 gives 1707 x 2560', async () => {
    const asset = await stage('portrait-o6.jpg', 'port');
    const { preview, thumb } = await ensureProxies(dir, asset);
    expect(await size(preview)).toEqual([1707, 2560]);
    expect(await size(thumb)).toEqual([213, 320]);
    // The pixels are already upright, so the tag must not be written again.
    expect((await sharp(preview).metadata()).orientation).toBeUndefined();
  });

  it('keeps the orientation visually right: red corner marker lands top-right after a 90 degree turn', async () => {
    // The fixture paints a red square in the stored top-left corner; orientation 6 turns the
    // image 90 degrees clockwise, so that corner ends up top-right.
    const { preview } = await ensureProxies(dir, await stage('portrait-o6.jpg', 'port'));
    const { data, info } = await sharp(preview).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]] as const;
    };
    const [r, g, b] = px(info.width - 20, 20);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(100);
    const [r2] = px(20, 20);
    expect(r2).toBeLessThan(180);
  });

  it('fits a panorama inside 2560 and keeps its ratio: 12000 x 3000 gives 2560 x 640', async () => {
    const { preview, thumb } = await ensureProxies(dir, await stage('pano.jpg', 'pano'));
    expect(await size(preview)).toEqual([2560, 640]);
    expect(await size(thumb)).toEqual([320, 80]);
  });

  it('never enlarges: 800 x 600 keeps 800 x 600 in the preview', async () => {
    const { preview, thumb } = await ensureProxies(dir, await stage('small.jpg', 'small'));
    expect(await size(preview)).toEqual([800, 600]);
    expect(await size(thumb)).toEqual([320, 240]);
    const tiny = join(dir, 'tiny.png');
    await sharp(fixturePath('small.jpg')).resize(100, 80).png().toFile(tiny);
    const out = await ensureProxies(dir, await stage(tiny, 'tiny', 'png'));
    expect(await size(out.preview)).toEqual([100, 80]);
    expect(await size(out.thumb)).toEqual([100, 80]);
  });

  it('uses quality 85 for the preview and 80 for the thumbnail', async () => {
    const { preview, thumb } = await ensureProxies(dir, await stage('landscape.jpg', 'q'));
    const reference = async (width: number, quality: number) =>
      (
        await sharp(fixturePath('landscape.jpg'))
          .rotate()
          .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .toColourspace('srgb')
          .jpeg({ quality })
          .toBuffer()
      ).length;
    const ratio = async (file: string, ref: number) => (await stat(file)).size / ref;
    // Within 5 % of a reference encode at the same quality, and clearly not the neighbouring one.
    expect(Math.abs((await ratio(preview, await reference(2560, 85))) - 1)).toBeLessThan(0.05);
    expect(Math.abs((await ratio(thumb, await reference(320, 80))) - 1)).toBeLessThan(0.05);
    expect(Math.abs((await ratio(preview, await reference(2560, 95))) - 1)).toBeGreaterThan(0.1);
  });

  it('flattens a PNG with alpha onto white for the JPEG proxies', async () => {
    const asset = await stage('alpha.png', 'alpha', 'png');
    const { preview, thumb } = await ensureProxies(dir, asset);
    for (const file of [preview, thumb]) {
      const m = await sharp(file).metadata();
      expect(m.hasAlpha).toBe(false);
      expect(m.channels).toBe(3);
      const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      // The top-left corner of alpha.png is fully transparent: it must come out white, not black.
      expect([...data.subarray(0, 3)].every((v) => v >= 250)).toBe(true);
    }
    expect(await size(preview)).toEqual([400, 300]);
  });

  it('handles an opaque PNG, a greyscale PNG, a CMYK JPEG and a WebP', async () => {
    const png = await ensureProxies(dir, await stage('opaque.png', 'opaque', 'png'));
    expect(await size(png.preview)).toEqual([400, 300]);

    const grey = join(dir, 'grey.png');
    await sharp(fixturePath('small.jpg')).greyscale().png().toFile(grey);
    const g = await ensureProxies(dir, await stage(grey, 'grey', 'png'));
    expect((await sharp(g.preview).metadata()).channels).toBe(3);

    const cmyk = join(dir, 'cmyk.jpg');
    await sharp(fixturePath('small.jpg')).toColourspace('cmyk').jpeg().toFile(cmyk);
    expect((await sharp(cmyk).metadata()).channels).toBe(4);
    const c = await ensureProxies(dir, await stage(cmyk, 'cmyk'));
    expect(await sharp(c.preview).metadata()).toMatchObject({ space: 'srgb', channels: 3 });

    const webp = join(dir, 'x.webp');
    await sharp(fixturePath('small.jpg')).webp().toFile(webp);
    const w = await ensureProxies(dir, await stage(webp, 'web', 'webp'));
    expect(await size(w.preview)).toEqual([800, 600]);
  });

  it('converts a wide-gamut profile to sRGB and drops the profile', async () => {
    const colour = { r: 255, g: 128, b: 0 };
    const p3 = join(dir, 'p3.jpg');
    await sharp({ create: { width: 64, height: 64, channels: 3, background: colour } })
      .withIccProfile('p3')
      .jpeg({ quality: 100 })
      .toFile(p3);
    expect((await sharp(p3).metadata()).icc).toBeDefined();
    const { preview } = await ensureProxies(dir, await stage(p3, 'p3'));
    const m = await sharp(preview).metadata();
    expect(m.space).toBe('srgb');
    expect(m.icc).toBeUndefined();
    // The P3 pixel values are mapped back to the colour they stand for: (255, 128, 0) in sRGB.
    const { data } = await sharp(preview).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs((data[0] ?? 0) - 255)).toBeLessThanOrEqual(2);
    expect(Math.abs((data[1] ?? 0) - 128)).toBeLessThanOrEqual(3);
    expect(data[2] ?? 255).toBeLessThanOrEqual(3);
  });

  it('is idempotent: existing proxies are neither rewritten nor regenerated', async () => {
    const asset = await stage('small.jpg', 'idem');
    const first = await ensureProxies(dir, asset);
    const old = new Date('2020-01-01T00:00:00Z');
    await utimes(first.preview, old, old);
    await utimes(first.thumb, old, old);
    const second = await ensureProxies(dir, asset);
    expect(second).toEqual(first);
    expect((await stat(first.preview)).mtime).toEqual(old);
    expect((await stat(first.thumb)).mtime).toEqual(old);
  });

  it('does not even open the original when both proxies exist', async () => {
    const asset = await stage('small.jpg', 'gone');
    await ensureProxies(dir, asset);
    await rm(join(dir, 'originals', 'gone.jpg'));
    await expect(ensureProxies(dir, asset)).resolves.toBeDefined();
  });

  it('regenerates only the proxy that is missing', async () => {
    const asset = await stage('small.jpg', 'half');
    const first = await ensureProxies(dir, asset);
    const old = new Date('2020-01-01T00:00:00Z');
    await utimes(first.preview, old, old);
    await rm(first.thumb);
    await ensureProxies(dir, asset);
    expect((await stat(first.preview)).mtime).toEqual(old);
    expect(await size(first.thumb)).toEqual([320, 240]);
  });

  it('recreates cache/ when it is gone', async () => {
    const asset = await stage('small.jpg', 'nocache');
    await rm(join(dir, 'cache'), { recursive: true });
    const { preview } = await ensureProxies(dir, asset);
    expect(await size(preview)).toEqual([800, 600]);
  });

  it('shares the work between concurrent calls for one asset', async () => {
    const asset = await stage('landscape.jpg', 'conc');
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => ensureProxies(dir, asset)));
    for (const r of results) expect(r).toEqual(results[0]);
    expect((await readdir(join(dir, 'cache'))).sort()).toEqual([
      'conc.preview.jpg',
      'conc.thumb.jpg',
    ]);
  });

  it('works in a project folder with spaces and accents in its path', async () => {
    const odd = join(dir, 'Été 2026', 'mon livre n°1.travelbook');
    await mkdir(join(odd, 'originals'), { recursive: true });
    await copyFile(fixturePath('évasion n°1.jpg'), join(odd, 'originals', 'x.jpg'));
    const { preview } = await ensureProxies(odd, {
      id: 'x',
      kind: 'photo',
      file: 'originals/x.jpg',
      originalName: 'évasion n°1.jpg',
      sha256: 'f'.repeat(64),
    });
    expect(preview).toBe(join(odd, 'cache', 'x.preview.jpg'));
    expect(await size(preview)).toEqual([1200, 800]);
  });

  describe('failures', () => {
    it('rejects a truncated JPEG and leaves no file in cache/', async () => {
      const asset = await stage('truncated.jpg', 'trunc');
      await expect(ensureProxies(dir, asset)).rejects.toThrow();
      expect(await readdir(join(dir, 'cache'))).toEqual([]);
    });

    it('rejects a missing original', async () => {
      const asset: AssetRef = {
        id: 'ghost',
        kind: 'photo',
        file: 'originals/ghost.jpg',
        originalName: 'ghost.jpg',
        sha256: 'f'.repeat(64),
      };
      await expect(ensureProxies(dir, asset)).rejects.toThrow();
      expect(await readdir(join(dir, 'cache'))).toEqual([]);
    });

    it('retries after a failure: a later call with a good file succeeds', async () => {
      const asset = await stage('truncated.jpg', 'retry');
      await expect(ensureProxies(dir, asset)).rejects.toThrow();
      await copyFile(fixturePath('small.jpg'), join(dir, 'originals', 'retry.jpg'));
      const { preview } = await ensureProxies(dir, asset);
      expect(await size(preview)).toEqual([800, 600]);
    });

    it('rejects an id or a file that would leave the project folder', async () => {
      const asset = await stage('small.jpg', 'ok');
      await expect(ensureProxies(dir, { ...asset, id: '../evil' })).rejects.toThrow(/asset id/i);
      await expect(ensureProxies(dir, { ...asset, id: 'a/b' })).rejects.toThrow(/asset id/i);
      await expect(ensureProxies(dir, { ...asset, id: '' })).rejects.toThrow(/asset id/i);
      await writeFile(join(root, 'outside.jpg'), 'x');
      await expect(ensureProxies(dir, { ...asset, file: '../outside.jpg' })).rejects.toThrow(
        /outside/i,
      );
    });
  });
});
