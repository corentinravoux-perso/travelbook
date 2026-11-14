import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixturePath } from '../../../../../tests/fixtures/make-fixtures';
import { dominantColours } from './palette';

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-palette-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

type Rgb = [number, number, number];

/** A PNG made of horizontal runs of colour: `[colour, width in pixels]`. */
async function bands(name: string, runs: [Rgb, number][], height = 100): Promise<string> {
  const width = runs.reduce((sum, [, w]) => sum + w, 0);
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    let x = 0;
    for (const [colour, w] of runs) {
      for (let i = 0; i < w; i++, x++) Buffer.from(colour).copy(data, (y * width + x) * 3);
    }
  }
  const path = join(work, name);
  await sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(path);
  return path;
}

const rgb = (hex: string): Rgb => {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
};

const near = (hex: string, want: Rgb, tolerance = 3): boolean =>
  rgb(hex).every((c, i) => Math.abs(c - (want[i] as number)) <= tolerance);

const RED: Rgb = [230, 57, 70];
const GREEN: Rgb = [79, 157, 105];
const BLUE: Rgb = [43, 76, 126];

describe('dominantColours', () => {
  it('returns the colours of an image, the most present first', async () => {
    const file = await bands('three.png', [
      [RED, 300],
      [GREEN, 180],
      [BLUE, 120],
    ]);
    const colours = await dominantColours([file]);
    expect(colours).toHaveLength(3);
    expect(near(colours[0] as string, RED)).toBe(true);
    expect(near(colours[1] as string, GREEN)).toBe(true);
    expect(near(colours[2] as string, BLUE)).toBe(true);
  });

  it('returns one colour for a flat image, as lower-case #rrggbb', async () => {
    const colours = await dominantColours([await bands('flat.png', [[[18, 52, 86], 200]])]);
    expect(colours).toEqual(['#123456']);
  });

  it('returns at most 6 colours, by default and on request', async () => {
    const eight: [Rgb, number][] = [
      [[255, 0, 0], 100],
      [[0, 255, 0], 90],
      [[0, 0, 255], 80],
      [[255, 255, 0], 70],
      [[255, 0, 255], 60],
      [[0, 255, 255], 50],
      [[0, 0, 0], 40],
      [[255, 255, 255], 30],
    ];
    const file = await bands('eight.png', eight);
    expect(await dominantColours([file])).toHaveLength(6);
    expect(await dominantColours([file], 3)).toHaveLength(3);
  });

  it('merges shades of one colour instead of listing them all', async () => {
    const shades: [Rgb, number][] = [200, 210, 220, 230, 240, 250].map(
      (r) => [[r, 30, 30], 40] as [Rgb, number],
    );
    const colours = await dominantColours([await bands('shades.png', shades)]);
    expect(colours).toHaveLength(1);
  });

  it('pools several files', async () => {
    const red = await bands('red.png', [[[255, 0, 0], 100]]);
    const blue = await bands('blue.png', [[[0, 0, 255], 100]]);
    const colours = await dominantColours([red, blue]);
    expect(colours.sort()).toEqual(['#0000ff', '#ff0000']);
  });

  it('ignores transparent pixels', async () => {
    // alpha.png is a red ellipse on a transparent background.
    const colours = await dominantColours([fixturePath('alpha.png')]);
    expect(colours.length).toBeGreaterThan(0);
    expect(near(colours[0] as string, [230, 57, 70], 12)).toBe(true);
    expect(colours.every((c) => rgb(c).some((v) => v > 60))).toBe(true);
  });

  it('reads a JPEG photo', async () => {
    const colours = await dominantColours([fixturePath('small.jpg')]);
    expect(colours.length).toBeGreaterThan(1);
    expect(colours.length).toBeLessThanOrEqual(6);
  });

  it('returns nothing for no files', async () => {
    expect(await dominantColours([])).toEqual([]);
  });

  it('is deterministic', async () => {
    const file = fixturePath('landscape.jpg');
    expect(await dominantColours([file])).toEqual(await dominantColours([file]));
  });

  it('rejects a file that is not an image', async () => {
    await expect(dominantColours([fixturePath('truncated.jpg')])).rejects.toThrow();
  });
});
