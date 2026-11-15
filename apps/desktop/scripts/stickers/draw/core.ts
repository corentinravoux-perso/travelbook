/**
 * Drawing helpers for the travelbook sticker sets (see `docs/design/stickers-style.md`).
 * A drawing is a list of SVG fragments; the hand-drawn line comes from `roughjs` (seeded, so the
 * output is the same on every run). Numbers are rounded to one decimal to keep the files small.
 */
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

export const INK = '#1d1b1a';
export const PAPER = '#ffffff';

const gen = rough.generator();

/** Round every number of a path to one decimal. */
export const tidy = (d: string): string =>
  d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));

let seedCounter = 1;
/** A fresh deterministic seed; `resetSeeds` before each drawing keeps drawings independent. */
export const nextSeed = (): number => seedCounter++;
export const resetSeeds = (base: number): void => {
  seedCounter = base;
};

function roughPaths(shape: ReturnType<typeof gen.path>): string[] {
  return gen.toPaths(shape).map((p) => {
    const fill = p.fill && p.fill !== 'none' ? p.fill : 'none';
    const stroke = p.stroke && p.stroke !== 'none' ? p.stroke : 'none';
    const attrs = [`d="${tidy(p.d)}"`, `fill="${fill}"`];
    if (stroke !== 'none') {
      attrs.push(
        `stroke="${stroke}"`,
        `stroke-width="${Math.round(p.strokeWidth * 10) / 10}"`,
        'stroke-linecap="round"',
        'stroke-linejoin="round"',
      );
    }
    return `<path ${attrs.join(' ')}/>`;
  });
}

/** A rough stroke along `d` (open or closed), no fill. */
export function stroke(d: string, width = 6, opts: Partial<Options> = {}): string[] {
  return roughPaths(
    gen.path(d, {
      seed: nextSeed(),
      roughness: 0.9,
      bowing: 0.8,
      stroke: INK,
      strokeWidth: width,
      disableMultiStroke: true,
      preserveVertices: true,
      ...opts,
    }),
  );
}

/** A plain fill, no outline. */
export const fill = (d: string, colour: string, extra = ''): string =>
  `<path d="${tidy(d)}" fill="${colour}"${extra}/>`;

/**
 * The croquis outline: the shape filled (white by default), a bold rough line on it, and a second
 * thin sketchy line slightly off, as when a doodle is drawn over twice.
 */
export function ink(d: string, opts: { w?: number; fill?: string; sketch?: boolean } = {}): string[] {
  const w = opts.w ?? 9;
  const out: string[] = [];
  if (opts.fill !== 'none') out.push(fill(d, opts.fill ?? PAPER));
  out.push(...stroke(d, w, { roughness: 0.7, bowing: 0.6 }));
  if (opts.sketch !== false) out.push(...stroke(d, Math.max(2, w * 0.3), { roughness: 1.6, bowing: 1.4 }));
  return out;
}

/** Rough parallel hatching inside a closed shape (the croquis shadow). */
export function hatch(d: string, opts: { gap?: number; angle?: number; w?: number } = {}): string[] {
  return roughPaths(
    gen.path(d, {
      seed: nextSeed(),
      roughness: 0.8,
      stroke: 'none',
      fill: INK,
      fillStyle: 'hachure',
      hachureGap: opts.gap ?? 9,
      hachureAngle: opts.angle ?? -41,
      fillWeight: opts.w ?? 2.6,
    }),
  );
}

/** Points to a closed smooth path (Catmull-Rom to cubic Bézier). */
export function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return tidy(d.replace(/(\d+\.\d{2,})/g, (m) => String(Math.round(Number(m) * 10) / 10))) + 'Z';
}

/** Points to an open smooth path. */
export function smoothOpen(pts: [number, number][]): string {
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return tidy(d);
}

/** A small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An organic blob (the bohème colour patch): a jittered ellipse, smoothed. */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, wobble = 0.16): string {
  const r = rng(seed);
  const n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const k = 1 - wobble + r() * wobble * 2;
    pts.push([Math.round(cx + Math.cos(a) * rx * k), Math.round(cy + Math.sin(a) * ry * k)]);
  }
  return smoothClosed(pts);
}

/** A four-point sparkle centred on (x, y), outer radius `s`. */
export function sparkle(x: number, y: number, s: number): string {
  const i = s * 0.22;
  return tidy(
    `M${x} ${y - s}Q${x + i} ${y - i} ${x + s} ${y}Q${x + i} ${y + i} ${x} ${y + s}Q${x - i} ${y + i} ${x - s} ${y}Q${x - i} ${y - i} ${x} ${y - s}Z`,
  );
}

/** A circle as a path. */
export const circle = (x: number, y: number, r: number): string =>
  tidy(`M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`);

/** A heart centred on (x, y), width about 2s. */
export function heart(x: number, y: number, s: number): string {
  return tidy(
    `M${x} ${y + s * 0.85}C${x - s * 0.15} ${y + s * 0.6} ${x - s} ${y + s * 0.15} ${x - s} ${y - s * 0.3}C${x - s} ${y - s * 0.85} ${x - s * 0.3} ${y - s * 1.05} ${x} ${y - s * 0.5}C${x + s * 0.3} ${y - s * 1.05} ${x + s} ${y - s * 0.85} ${x + s} ${y - s * 0.3}C${x + s} ${y + s * 0.15} ${x + s * 0.15} ${y + s * 0.6} ${x} ${y + s * 0.85}Z`,
  );
}

/** A star with `n` points. */
export function star(x: number, y: number, r: number, n = 5, inner = 0.45, rot = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / n;
    pts.push(`${Math.round((x + Math.cos(a) * rr) * 10) / 10} ${Math.round((y + Math.sin(a) * rr) * 10) / 10}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Rotate a path's absolute coordinates? No: wrap fragments in a rotated group instead. */
export const rotate = (parts: string[], deg: number, cx: number, cy: number): string =>
  `<g transform="rotate(${deg} ${cx} ${cy})">${parts.join('')}</g>`;
export const translate = (parts: string[], dx: number, dy: number, s = 1): string =>
  `<g transform="translate(${dx} ${dy})${s !== 1 ? ` scale(${s})` : ''}">${parts.join('')}</g>`;

export interface Drawing {
  /** `<category>-<object>`, ASCII kebab case. */
  id: string;
  viewBox: string;
  /** French search words, besides the category label. */
  kw?: string[];
  parts: () => string[];
}

/** Render one drawing to a whole SVG file. Seeds are reset per drawing from its id. */
export function render(d: Drawing): string {
  let h = 0;
  for (const c of d.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  resetSeeds((h % 100000) + 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${d.viewBox}">\n${d.parts().join('\n')}\n</svg>\n`;
}
