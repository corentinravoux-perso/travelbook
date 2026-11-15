import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PhotoElement } from '@travelbook/core';
import { ensureFixtures, fixturePath } from '../../../../../tests/fixtures/make-fixtures';
import { makeDerivative, type DerivativeLook } from './derivatives';

const NEUTRAL: PhotoElement['adjust'] = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
};
const LOOK: DerivativeLook = { adjust: NEUTRAL, edge: null };
const CROP = { cx: 0.5, cy: 0.5, scale: 1 };
const NOFLIP = { h: false, v: false };
const OPTS = { dpi: 300, nativeResolution: false, quality: 95 };

let out: string;
beforeAll(async () => {
  await ensureFixtures();
  out = await mkdtemp(join(tmpdir(), 'travelbook-deriv-'));
});
afterAll(async () => {
  await rm(out, { recursive: true, force: true });
});

const sha = async (f: string) =>
  createHash('sha256')
    .update(await readFile(f))
    .digest('hex');

describe('makeDerivative', () => {
  it('sizes to the frame at the export dpi, or to the visible window when native', async () => {
    const px = { w: 6000, h: 4000 };
    const frame = { w: 100, h: 100 };
    const f = fixturePath('landscape.jpg');
    const d = await makeDerivative(f, px, frame, CROP, NOFLIP, LOOK, OPTS, out);
    expect([d.w, d.h]).toEqual([1181, 1181]);
    expect(d.file.endsWith('.jpg')).toBe(true);
    const meta = await sharp(d.file).metadata();
    expect([meta.width, meta.height]).toEqual([1181, 1181]);
    expect(meta.chromaSubsampling).toBe('4:4:4');
    const n = await makeDerivative(
      f,
      px,
      frame,
      CROP,
      NOFLIP,
      LOOK,
      { ...OPTS, nativeResolution: true },
      out,
    );
    expect([n.w, n.h]).toEqual([4000, 4000]);
  });

  it('never upscales', async () => {
    const d = await makeDerivative(
      fixturePath('small.jpg'),
      { w: 800, h: 600 },
      { w: 200, h: 150 },
      CROP,
      NOFLIP,
      LOOK,
      OPTS,
      out,
    );
    expect([d.w, d.h]).toEqual([800, 600]);
  });

  it('is upright: the red band on the true top of an Orientation 6 photo stays on top', async () => {
    // Stored 800 x 600, shown 600 x 800.
    const d = await makeDerivative(
      fixturePath('band-o6.jpg'),
      { w: 600, h: 800 },
      { w: 50, h: 66.667 },
      CROP,
      NOFLIP,
      LOOK,
      OPTS,
      out,
    );
    expect(d.h).toBeGreaterThan(d.w);
    const { data, info } = await sharp(d.file).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]] as number[];
    };
    const top = at(info.width >> 1, 5);
    const bottom = at(info.width >> 1, info.height - 6);
    expect(top[0]).toBeGreaterThan(200);
    expect(top[1]).toBeLessThan(60);
    expect(Math.abs((bottom[0] as number) - 128)).toBeLessThan(12);
  });

  it('leaves the original untouched and embeds an sRGB profile', async () => {
    const f = fixturePath('landscape.jpg');
    const before = await sha(f);
    const d = await makeDerivative(
      f,
      { w: 6000, h: 4000 },
      { w: 90, h: 60 },
      CROP,
      NOFLIP,
      LOOK,
      OPTS,
      out,
    );
    expect(await sha(f)).toBe(before);
    const meta = await sharp(d.file).metadata();
    expect(meta.icc).toBeDefined();
    expect(meta.orientation).toBeUndefined();
    // A display-class RGB profile (ICC header: class at byte 12, colour space at byte 16).
    expect(meta.icc?.subarray(12, 20).toString('latin1')).toBe('mntrRGB ');
    expect(meta.space).toBe('srgb');
  });

  it('crops to visibleRect and mirrors', async () => {
    const f = fixturePath('landscape.jpg');
    const px = { w: 6000, h: 4000 };
    const frame = { w: 60, h: 40 };
    const crop = { cx: 0.25, cy: 0.25, scale: 2 }; // top-left quarter: holds the red square
    const plain = await makeDerivative(
      f,
      px,
      frame,
      crop,
      NOFLIP,
      LOOK,
      { ...OPTS, dpi: 100 },
      out,
    );
    const red = async (file: string, x: number, y: number) => {
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      const i = (y * info.width + x) * info.channels;
      return (data[i] as number) > 200 && (data[i + 1] as number) < 90;
    };
    expect(await red(plain.file, 5, 5)).toBe(true);
    const flipped = await makeDerivative(
      f,
      px,
      frame,
      crop,
      { h: true, v: false },
      LOOK,
      { ...OPTS, dpi: 100 },
      out,
    );
    expect(await red(flipped.file, flipped.w - 6, 5)).toBe(true);
    expect(await red(flipped.file, 5, 5)).toBe(false);
  });

  it('writes a PNG with an almost transparent corner and an opaque centre for a feather', async () => {
    const d = await makeDerivative(
      fixturePath('landscape.jpg'),
      { w: 6000, h: 4000 },
      { w: 60, h: 40 },
      CROP,
      NOFLIP,
      { adjust: NEUTRAL, edge: { feather: 5 } },
      OPTS,
      out,
    );
    expect(d.file.endsWith('.png')).toBe(true);
    const { data, info } = await sharp(d.file).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    // The editor's own mask leaves about 5 % at the very corner pixel (erode + blur): the same here.
    expect(data[3]).toBeLessThan(20);
    expect(data[((info.height >> 1) * info.width + (info.width >> 1)) * 4 + 3]).toBe(255);
  });

  it('keeps the alpha of a PNG original and writes PNG', async () => {
    const d = await makeDerivative(
      fixturePath('alpha.png'),
      { w: 400, h: 300 },
      { w: 40, h: 30 },
      CROP,
      NOFLIP,
      { adjust: { ...NEUTRAL, saturation: 1.3, vignette: 0.3 }, edge: null },
      OPTS,
      out,
    );
    expect(d.file.endsWith('.png')).toBe(true);
    const { data } = await sharp(d.file).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });

  it('bakes the adjustments: grayscale gives equal channels, brightness darkens', async () => {
    const f = fixturePath('landscape.jpg');
    const px = { w: 6000, h: 4000 };
    const run = (adjust: Partial<PhotoElement['adjust']>) =>
      makeDerivative(
        f,
        px,
        { w: 30, h: 20 },
        CROP,
        NOFLIP,
        { adjust: { ...NEUTRAL, ...adjust }, edge: null },
        OPTS,
        out,
      );
    const mean = async (file: string) => (await sharp(file).stats()).channels.map((c) => c.mean);
    const gray = await mean((await run({ grayscale: 1 })).file);
    expect(Math.abs((gray[0] as number) - (gray[1] as number))).toBeLessThan(1.5);
    const base = await mean((await run({})).file);
    const dark = await mean((await run({ brightness: 0.5 })).file);
    expect((dark[0] as number) / (base[0] as number)).toBeCloseTo(0.5, 1);
  });
});
