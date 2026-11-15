import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bakePatternTile } from './patternTile';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'travelbook-tile-test-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

/** Colour and alpha of the pixel `(x, y)` of a PNG. */
async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.subarray(i, i + info.channels)];
}

describe('bakePatternTile', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="0" y="0" width="50" height="50"/></svg>';

  it('paints a vector stencil with the foreground colour at 600 dpi: alpha from the stencil', async () => {
    const stencil = join(dir, 'stencil.svg');
    await writeFile(stencil, svg);
    const name = await bakePatternTile(stencil, '#3366aa', 20, dir, 'tile');
    expect(name).toBe('tile.png');
    const meta = await sharp(join(dir, name)).metadata();
    expect([meta.width, meta.height, meta.channels]).toEqual([472, 236, 4]);
    // Left half is the motif, right half is empty.
    expect(await pixel(join(dir, name), 100, 100)).toEqual([0x33, 0x66, 0xaa, 255]);
    expect((await pixel(join(dir, name), 400, 100))[3]).toBe(0);
  });

  it('keeps a raster stencil at its own size when it is below 600 dpi', async () => {
    const stencil = join(dir, 'stencil.png');
    await sharp({ create: { width: 200, height: 100, channels: 4, background: '#00000080' } })
      .png()
      .toFile(stencil);
    const name = await bakePatternTile(stencil, 'rgb(255, 0, 0)', 20, dir, 'tile');
    const meta = await sharp(join(dir, name)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 100]);
    const [r, g, b, a] = await pixel(join(dir, name), 10, 10);
    expect([r, g, b]).toEqual([255, 0, 0]);
    expect(a).toBeGreaterThan(120);
    expect(a).toBeLessThan(136);
  });

  it('shrinks a raster stencil that has more than 600 dpi', async () => {
    const stencil = join(dir, 'big.png');
    await sharp({ create: { width: 2000, height: 1000, channels: 4, background: '#000000ff' } })
      .png()
      .toFile(stencil);
    const name = await bakePatternTile(stencil, '#000', 20, dir, 'tile');
    expect((await sharp(join(dir, name)).metadata()).width).toBe(472);
  });
});
