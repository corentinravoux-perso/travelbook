/** Shape helpers of the "Croquis" set (see `croquis.ts`). */
import { INK, PAPER, fill, ink, stroke, tidy } from './core.ts';

type Pt = [number, number];

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** A rectangle path. */
export const rect = (x: number, y: number, w: number, h: number): string =>
  `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;

/** A rounded rectangle path. */
export const rr = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}L${x + w - r} ${y}Q${x + w} ${y} ${x + w} ${y + r}L${x + w} ${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}L${x + r} ${y + h}Q${x} ${y + h} ${x} ${y + h - r}L${x} ${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/** An ellipse path. */
export const ell = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** A closed polygon path. */
export const poly = (pts: Pt[]): string =>
  `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;

/** An open polyline path. */
export const pline = (pts: Pt[]): string =>
  `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}`;

/** An annular sector between radii a and b, angles in degrees (0 = right, clockwise). */
export function sector(
  cx: number,
  cy: number,
  a: number,
  b: number,
  d1: number,
  d2: number,
): string {
  const p = (r: number, d: number): string => {
    const t = (d * Math.PI) / 180;
    return `${r1(cx + Math.cos(t) * r)} ${r1(cy + Math.sin(t) * r)}`;
  };
  const large = d2 - d1 > 180 ? 1 : 0;
  return `M${p(b, d1)}A${b} ${b} 0 ${large} 1 ${p(b, d2)}L${p(a, d2)}A${a} ${a} 0 ${large} 0 ${p(a, d1)}Z`;
}

/** A filled ring (outer minus inner) with croquis lines on both edges. */
export function inkRing(outer: string, inner: string, w = 9, colour = PAPER): string[] {
  return [
    fill(`${outer} ${inner}`, colour, ' fill-rule="evenodd"'),
    ...ink(outer, { w, fill: 'none' }),
    ...ink(inner, { w: w * 0.8, fill: 'none', sketch: false }),
  ];
}

/** A shape filled with ink, with a rough edge. */
export const solid = (d: string, w = 6): string[] => [
  fill(d, INK),
  ...stroke(d, w, { roughness: 0.8 }),
];

/** A white highlight stroke on an ink area. */
export const shine = (d: string, w = 4): string[] =>
  stroke(d, w, { stroke: PAPER, roughness: 1.1 });

/** Short accent strokes (motion marks) fanned around a point, angles in degrees. */
export function accents(
  x: number,
  y: number,
  n: number,
  len: number,
  from: number,
  to: number,
  w = 6,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((from + ((to - from) * i) / Math.max(1, n - 1)) * Math.PI) / 180;
    const x1 = x + Math.cos(a) * len;
    const y1 = y + Math.sin(a) * len;
    const x2 = x + Math.cos(a) * len * 1.35;
    const y2 = y + Math.sin(a) * len * 1.35;
    out.push(...stroke(`M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}`, w));
  }
  return out;
}

/** Points along a quadratic Bézier. */
export function qpts(p0: Pt, c: Pt, p1: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

/** Points along a cubic Bézier. */
export function cpts(p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 30): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
      a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
    ]);
  }
  return out;
}

/**
 * A thick arrow along `pts`: the shaft is a band whose width goes from w0 to w1, ending in a
 * triangular head of size h. Returns the shaft and head paths and the centre line (for the
 * white sketch line).
 */
export function bandArrow(
  pts: Pt[],
  w0: number,
  w1: number,
  h: number,
): { shaft: string; head: string; centre: string } {
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const w = (w0 + ((w1 - w0) * i) / (n - 1)) / 2;
    left.push([pts[i]![0] + nx * w, pts[i]![1] + ny * w]);
    right.push([pts[i]![0] - nx * w, pts[i]![1] - ny * w]);
  }
  const end = pts[n - 1]!;
  const prev = pts[n - 3] ?? pts[0]!;
  const dx = end[0] - prev[0];
  const dy = end[1] - prev[1];
  const l = Math.hypot(dx, dy) || 1;
  const tx = dx / l;
  const ty = dy / l;
  const head = poly([
    [end[0] + tx * h, end[1] + ty * h],
    [end[0] - ty * h * 0.75 - tx * h * 0.15, end[1] + tx * h * 0.75 - ty * h * 0.15],
    [end[0] + ty * h * 0.75 - tx * h * 0.15, end[1] - tx * h * 0.75 - ty * h * 0.15],
  ]);
  const shaft = poly([...left, ...right.reverse()]);
  const inner = pts.slice(2, Math.max(3, n - 3)).map(([x, y], i, all) => {
    const k = i / Math.max(1, all.length - 1);
    const off = ((w0 + (w1 - w0) * k) / 2) * 0.35;
    const a = all[Math.max(0, i - 1)]!;
    const b = all[Math.min(all.length - 1, i + 1)]!;
    const ddx = b[0] - a[0];
    const ddy = b[1] - a[1];
    const ll = Math.hypot(ddx, ddy) || 1;
    return [x - (ddy / ll) * off, y + (ddx / ll) * off] as Pt;
  });
  return { shaft, head, centre: pline(inner) };
}

/** A croquis arrow from `bandArrow`: ink fill, rough edge, white sketch line. */
export function inkArrow(pts: Pt[], w0: number, w1: number, h: number): string[] {
  const a = bandArrow(pts, w0, w1, h);
  return [...solid(a.shaft, 7), ...solid(a.head, 7), ...shine(a.centre, Math.max(3, w1 * 0.12))];
}

/** A croquis outline-only arrow (white band with ink edges). */
export function hollowArrow(pts: Pt[], w0: number, w1: number, h: number): string[] {
  const a = bandArrow(pts, w0, w1, h);
  return [...ink(a.shaft, { w: 8 }), ...ink(a.head, { w: 8 })];
}

/** Rough dashes along a polyline: every other segment of `pts` is drawn. */
export function dashes(pts: Pt[], w = 5): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    out.push(
      ...stroke(
        `M${r1(pts[i]![0])} ${r1(pts[i]![1])}L${r1(pts[i + 1]![0])} ${r1(pts[i + 1]![1])}`,
        w,
      ),
    );
  }
  return out;
}

/** A teardrop (raindrop) pointing up, centred on its round part. */
export const drop = (x: number, y: number, r: number): string =>
  tidy(
    `M${x} ${y - r * 2.2}Q${x + r * 1.1} ${y - r * 0.6} ${x + r} ${y}A${r} ${r} 0 1 1 ${x - r} ${y}Q${x - r * 1.1} ${y - r * 0.6} ${x} ${y - r * 2.2}Z`,
  );

export type { Pt };
