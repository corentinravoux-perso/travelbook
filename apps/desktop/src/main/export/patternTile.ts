import { join } from 'node:path';
import sharp from 'sharp';

/** A tile is made at most at this resolution: a flat-colour motif needs no more. */
const TILE_DPI = 600;

/**
 * The tile of a pattern background painted with its foreground colour: the alpha of the stencil
 * under a flat `fg`, as a PNG of the tile's size in mm at 600 dpi at most. The editor paints a
 * pattern with CSS `mask-image`, which `printToPDF` rasterises at 300 dpi; a tiled image is kept
 * as an image at its own resolution.
 *
 * `stencil` is the file of the asset (PNG, JPEG, WebP or SVG); `tileMm` the width of a tile.
 * Returns the file name inside `dir`.
 */
export async function bakePatternTile(
  stencil: string,
  fg: string,
  tileMm: number,
  dir: string,
  name: string,
): Promise<string> {
  const wanted = Math.max(1, Math.round((tileMm * TILE_DPI) / 25.4));
  const meta = await sharp(stencil).metadata();
  const sourceW = meta.width ?? wanted;
  const vector = meta.format === 'svg';
  // A raster stencil keeps its own pixels unless it has more than the tile needs; a vector one is
  // drawn at the size wanted (`density` is relative to 72 dpi).
  const width = vector ? wanted : Math.min(sourceW, wanted);
  const input = vector
    ? sharp(stencil, { density: Math.min(2400, Math.max(1, (72 * wanted) / sourceW)) })
    : sharp(stencil);
  const alpha = await input
    .resize({ width, kernel: 'lanczos3' })
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = alpha.info;
  const file = join(dir, `${name}.png`);
  await sharp({ create: { width: w, height: h, channels: 3, background: fg } })
    .joinChannel(alpha.data, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 6 })
    .toFile(file);
  return `${name}.png`;
}
