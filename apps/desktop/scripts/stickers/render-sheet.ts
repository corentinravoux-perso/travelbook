/**
 * Contact sheet of a drawn sticker set, to review the drawings on a render:
 *
 *   node apps/desktop/scripts/stickers/render-sheet.ts <set> <outDir> [filter]
 *
 * writes `<outDir>/<set>.png`: a grid of every sticker (or those whose id contains `filter`), each
 * at 220 px on a white tile and at 70 px (about 18 mm printed) on a coloured tile, with its id.
 * Sheets are not committed.
 */
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { STICKERS_SRC_DIR } from './local-sets.ts';

const BIG = 220;
const SMALL = 70;
const COLS = 5;
const CELL_W = BIG + 30;
const CELL_H = BIG + SMALL + 56;

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function fit(svg: string, box: number): Promise<{ input: Buffer; w: number; h: number }> {
  const out = await sharp(Buffer.from(svg), { density: 200 })
    .resize({ width: box, height: box, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: out.data, w: out.info.width, h: out.info.height };
}

export async function renderSheet(set: string, outDir: string, filter = ''): Promise<string> {
  const dir = join(STICKERS_SRC_DIR, set);
  const ids = (await readdir(dir))
    .filter((n) => n.endsWith('.svg') && n.includes(filter))
    .sort()
    .map((n) => n.slice(0, -4));
  const rows = Math.ceil(ids.length / COLS);
  const width = COLS * CELL_W + 20;
  const height = rows * CELL_H + 20;
  const composites: OverlayOptions[] = [];
  const labels: string[] = [];
  for (const [i, id] of ids.entries()) {
    const svg = await readFile(join(dir, `${id}.svg`), 'utf8');
    const x = 20 + (i % COLS) * CELL_W;
    const y = 20 + Math.floor(i / COLS) * CELL_H;
    labels.push(
      `<rect x="${x}" y="${y + BIG + 6}" width="${SMALL + 20}" height="${SMALL + 10}" fill="#9fc9c4"/>`,
    );
    labels.push(
      `<text x="${x}" y="${y + CELL_H - 12}" font-family="sans-serif" font-size="13" fill="#333">${escape(id)}</text>`,
    );
    const big = await fit(svg, BIG);
    composites.push({
      input: big.input,
      left: x + Math.round((BIG - big.w) / 2),
      top: y + Math.round((BIG - big.h) / 2),
    });
    const small = await fit(svg, SMALL);
    composites.push({ input: small.input, left: x + 10, top: y + BIG + 11 });
  }
  const base = sharp({ create: { width, height, channels: 4, background: '#ffffff' } });
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`,
  );
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${set}${filter ? `-${filter}` : ''}.png`);
  await base
    .composite([{ input: bg, left: 0, top: 0 }, ...composites])
    .png()
    .toFile(file);
  return file;
}

if (import.meta.main) {
  const [set, outDir, filter] = process.argv.slice(2);
  if (!set || !outDir) throw new Error('usage: render-sheet.ts <set> <outDir> [filter]');
  console.log(await renderSheet(set, outDir, filter ?? ''));
}
