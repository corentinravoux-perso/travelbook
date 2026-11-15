/**
 * Contact sheet of one destination's poster illustrations, to review the drawings on a render:
 *
 *   node apps/desktop/scripts/posters/render-sheet.ts <destination> <outDir>
 *
 * writes `<outDir>/<destination>.png`: per illustration, one row with its id, the drawing at
 * 400 px wide in its own colours, the same recoloured with a blue main colour, and a 100 px
 * render (about 25 mm on a printed page) to judge the silhouette. Sheets are not committed.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { shadeOf } from '../../../../packages/core/src/poster/color.ts';
import { recolorIllustration } from '../../../../packages/core/src/poster/recolor.ts';
import { POSTERS_DIR, destinationOf, illustrationFiles, type Destination } from './affiches-set.ts';

const WIDE = 400;
const SMALL = 100;
const PAD = 24;
const LABEL = 28;
const GROUND = '#f1ece4';
const RECOLOUR = { main: '#2b5876', shade: shadeOf('#2b5876') };

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function png(svg: string, width: number): Promise<{ input: Buffer; height: number }> {
  const out = await sharp(Buffer.from(svg), { density: 300 })
    .resize({ width })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: out.data, height: out.info.height };
}

/** Render the sheet of `destination` into `outDir`; returns the PNG path. */
export async function renderSheet(destination: string, outDir: string): Promise<string> {
  const destinations = JSON.parse(
    await readFile(join(POSTERS_DIR, 'destinations.json'), 'utf8'),
  ) as Destination[];
  const ids = (await illustrationFiles())
    .map((f) => f.slice(0, -4))
    .filter((id) => destinationOf(id, destinations)?.id === destination);
  if (ids.length === 0) throw new Error(`No illustration for destination "${destination}"`);

  const rows: { id: string; cells: { input: Buffer; height: number }[]; height: number }[] = [];
  for (const id of ids) {
    const svg = await readFile(join(POSTERS_DIR, 'illustrations', `${id}.svg`), 'utf8');
    const cells = [
      await png(svg, WIDE),
      await png(recolorIllustration(svg, RECOLOUR), WIDE),
      await png(svg, SMALL),
    ];
    rows.push({ id, cells, height: Math.max(...cells.map((c) => c.height)) });
  }
  const width = PAD * 4 + WIDE * 2 + SMALL;
  const height = rows.reduce((s, r) => s + LABEL + r.height + PAD, PAD);
  const composites: OverlayOptions[] = [];
  const labels: string[] = [];
  let y = PAD;
  for (const row of rows) {
    labels.push(
      `<text x="${PAD}" y="${y + 20}" font-family="sans-serif" font-size="18" fill="#333">${escape(row.id)}</text>`,
    );
    y += LABEL;
    let x = PAD;
    for (const [i, cell] of row.cells.entries()) {
      // Bases aligned on the row's bottom line, as on a poster.
      composites.push({ input: cell.input, left: x, top: y + row.height - cell.height });
      x += (i < 2 ? WIDE : SMALL) + PAD;
    }
    y += row.height + PAD;
  }
  composites.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`,
    ),
    left: 0,
    top: 0,
  });
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${destination}.png`);
  await sharp({ create: { width, height, channels: 4, background: GROUND } })
    .composite(composites)
    .png()
    .toFile(file);
  return file;
}

if (process.argv[1] === import.meta.filename) {
  const [destination, outDir] = process.argv.slice(2);
  if (!destination || !outDir) {
    console.error('usage: render-sheet.ts <destination> <outDir>');
    process.exit(2);
  }
  console.log(await renderSheet(destination, outDir));
}
