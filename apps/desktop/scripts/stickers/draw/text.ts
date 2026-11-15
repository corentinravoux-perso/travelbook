/**
 * Text as SVG paths, from the bundled OFL fonts (`resources/fonts/`), so a lettering sticker needs
 * no font at display time. Glyph outlines are read with fontkit; positions come from its layout
 * (kerning and ligatures included).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';

const FONTS_DIR = join(import.meta.dirname, '../../../resources/fonts');
const cache = new Map<string, fontkit.Font>();

/** A bundled font by family folder (`pacifico`) and weight. */
export function font(family: string, weight = 400): fontkit.Font {
  const key = `${family}-${weight}`;
  let f = cache.get(key);
  if (f === undefined) {
    f = fontkit.create(readFileSync(join(FONTS_DIR, family, `${family}-latin-${weight}-normal.woff2`))) as fontkit.Font;
    cache.set(key, f);
  }
  return f;
}

type Pt = (x: number, y: number) => [number, number];

const r1 = (n: number): string => String(Math.round(n * 10) / 10);

function pathOf(commands: { command: string; args: number[] }[], map: Pt): string {
  let d = '';
  for (const { command, args } of commands) {
    const pts: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const [x, y] = map(args[i]!, args[i + 1]!);
      pts.push(`${r1(x)} ${r1(y)}`);
    }
    const letter = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }[command];
    d += letter + pts.join(' ');
  }
  return d;
}

/** The width of `text` at `size`. */
export function textWidth(text: string, f: fontkit.Font, size: number): number {
  const run = f.layout(text);
  return run.positions.reduce((s, p) => s + p.xAdvance, 0) * (size / f.unitsPerEm);
}

/** `text` as one path, its baseline at `y`, centred on `x` (or starting at `x` when `align` is start). */
export function textPath(
  text: string,
  f: fontkit.Font,
  size: number,
  x: number,
  y: number,
  align: 'middle' | 'start' = 'middle',
  letterSpacing = 0,
): string {
  const run = f.layout(text);
  const s = size / f.unitsPerEm;
  const total = run.positions.reduce((t, p) => t + p.xAdvance * s + letterSpacing, -letterSpacing);
  let pen = align === 'middle' ? x - total / 2 : x;
  let d = '';
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i]!;
    const ox = pen + pos.xOffset * s;
    const oy = y - pos.yOffset * s;
    d += pathOf(g.path.commands, (gx, gy) => [ox + gx * s, oy - gy * s]);
    pen += pos.xAdvance * s + letterSpacing;
  });
  return d;
}

/**
 * `text` along a circle around (cx, cy), centred on the angle `at` (degrees, 0 is up, clockwise).
 * `r` is the baseline radius. Top text reads clockwise with the letters pointing outward; bottom
 * text (`bottom`) reads counter-clockwise with the letters pointing inward, so both read normally.
 */
export function textOnCircle(
  text: string,
  f: fontkit.Font,
  size: number,
  cx: number,
  cy: number,
  r: number,
  at = 0,
  bottom = false,
  letterSpacing = 0,
): string {
  const run = f.layout(text);
  const s = size / f.unitsPerEm;
  const advances = run.positions.map((p) => p.xAdvance * s);
  const total = advances.reduce((a, b) => a + b + letterSpacing, -letterSpacing);
  const dir = bottom ? -1 : 1;
  const base = (at * Math.PI) / 180;
  let pen = -total / 2;
  let d = '';
  run.glyphs.forEach((g, i) => {
    const adv = advances[i]!;
    const ox = pen;
    d += pathOf(g.path.commands, (gx, gy) => {
      const lx = ox + gx * s;
      const ly = gy * s;
      const rad = bottom ? r - ly : r + ly;
      const a = base + (dir * lx) / r;
      return [cx + Math.sin(a) * rad, cy - Math.cos(a) * rad];
    });
    pen += adv + letterSpacing;
  });
  return d;
}
