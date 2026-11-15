/** Bohème: flat colour flowers, sprigs and leaves, tropical plants. */
import { type Drawing, INK, circle, fill, heart, smoothOpen, tidy } from './core.ts';
import { P, leaf, petal, roundPetal } from './boheme-kit.ts';

// Flat vector only: no outline, no white (a white shape would show on a coloured page).

/** Extra colours of the flowers. */
const C = {
  cream: '#fbe8c4',
  creamDark: '#f1cf93',
  yellow: '#f6c945',
  orange: '#f29a3a',
  brown: '#6b3d2a',
  bordeaux: '#8e2c48',
  rose: '#f59cb5',
  roseDark: '#e2718f',
  blossom: '#f8c3cc',
  blossomDark: '#ec93a5',
  blue: '#5b8fd1',
  blueLight: '#9cc0ea',
  lavender: '#8e7cc3',
  lavenderDark: '#6b5ca5',
  olive: '#8a9a5b',
  oliveDark: '#5f6b3a',
  oliveFruit: '#4b3550',
  bark: '#7a5a43',
  stem: '#7fa58f',
};

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** A path placed at (x, y), rotated by `deg`, scaled by `s`. */
function place(d: string, colour: string, x: number, y: number, deg = 0, s = 1): string {
  const rot = deg !== 0 ? ` rotate(${r1(deg)})` : '';
  const sc = s !== 1 ? ` scale(${Math.round(s * 100) / 100})` : '';
  return `<path transform="translate(${r1(x)} ${r1(y)})${rot}${sc}" d="${tidy(d)}" fill="${colour}"/>`;
}

/** `n` copies of a petal around (cx, cy). */
function ring(cx: number, cy: number, n: number, d: string, colour: string, offset = 0, s = 1): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(place(d, colour, cx, cy, offset + (360 / n) * i, s));
  return out;
}

const pointed = (r: number, k = 0.38): string => tidy(petal(r, k));
const rounded = (r: number, k = 0.55): string => tidy(roundPetal(r, k));

/** A petal with a notched tip (cosmos, cherry blossom). */
function notched(r: number, k = 0.5): string {
  const w = k * r;
  return tidy(
    `M0 0C${w} ${-0.15 * r} ${1.05 * w} ${-0.8 * r} ${0.6 * w} ${-r}L${0.25 * w} ${-0.88 * r}L0 ${-0.97 * r}L${-0.25 * w} ${-0.88 * r}L${-0.6 * w} ${-r}C${-1.05 * w} ${-0.8 * r} ${-w} ${-0.15 * r} 0 0Z`,
  );
}

/** A petal broad at its tip (frangipani, pansy-like). */
function obovate(r: number, k = 0.6): string {
  const w = k * r;
  return tidy(`M0 0C${w * 0.3} ${-r * 0.3} ${w * 1.1} ${-r * 0.6} ${w * 0.6} ${-r}C${w * 0.2} ${-r * 1.08} ${-w * 1.1} ${-r * 0.9} 0 0Z`);
}

/** A plain stroke in colour, no fill, round ends. */
const stem = (d: string, colour = C.stem, w = 4): string =>
  `<path d="${tidy(d)}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A leaf with rounded numbers. */
const lf = (x: number, y: number, l: number, deg: number, colour: string, k = 0.32): string =>
  tidy(leaf(x, y, l, deg, colour, k));

/** A leaf with a darker half, for a bit of volume. */
function lf2(x: number, y: number, l: number, deg: number, colour: string, shade: string, k = 0.32): string[] {
  const half = `M0 0C${l * 0.3} ${-l * k} ${l * 0.75} ${-l * k} ${l} 0Z`;
  return [lf(x, y, l, deg, colour, k), place(half, shade, x, y, deg)];
}

/** Point and direction (degrees) at fraction t of a polyline. */
function along(pts: [number, number][], t: number): [number, number, number] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    seg.push(l);
    total += l;
  }
  let target = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]! || i === seg.length - 1) {
      const f = Math.min(1, target / seg[i]!);
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      return [ax + (bx - ax) * f, ay + (by - ay) * f, (Math.atan2(by - ay, bx - ax) * 180) / Math.PI];
    }
    target -= seg[i]!;
  }
  return [pts[0]![0], pts[0]![1], 0];
}

/**
 * A sprig: a stem through `pts` (base first) with `n` leaves alternating sides at `angle`
 * from the stem, getting smaller toward the tip, and a leaf at the tip.
 */
function sprig(
  pts: [number, number][],
  o: { n: number; len: number; angle?: number; k?: number; leafC: string; stemC?: string; w?: number; shade?: string; tip?: boolean; pairs?: boolean },
): string[] {
  const out = [stem(smoothOpen(pts), o.stemC ?? o.leafC, o.w ?? 4)];
  const angle = o.angle ?? 45;
  for (let i = 0; i < o.n; i++) {
    const t = 0.18 + (0.78 * i) / Math.max(1, o.n - 1);
    const [x, y, dir] = along(pts, t);
    const l = o.len * (1 - 0.45 * t);
    const sides = o.pairs ? [-1, 1] : [i % 2 === 0 ? -1 : 1];
    for (const s of sides) {
      if (o.shade) out.push(...lf2(x, y, l, dir + s * angle, o.leafC, o.shade, o.k ?? 0.32));
      else out.push(lf(x, y, l, dir + s * angle, o.leafC, o.k ?? 0.32));
    }
  }
  if (o.tip !== false) {
    const [x, y, dir] = along(pts, 1);
    out.push(lf(x, y, o.len * 0.6, dir, o.leafC, o.k ?? 0.32));
  }
  return out;
}

/**
 * A monstera leaf in local coordinates (base at 0 0, tip at 0 −L): separate lobes on each side,
 * the slits being real gaps between them, so nothing white is drawn.
 */
function monstera(L: number, W: number, colour: string, vein: string, slits = 5): string[] {
  const w = (t: number): number =>
    W * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * Math.min(1, Math.max(0, t)))), 0.6) * (1 - 0.2 * t);
  const g = 0.024;
  const m: number[] = [];
  const o: number[] = [];
  for (let k = 0; k <= slits + 1; k++) {
    const mk = k / (slits + 1);
    m.push(mk);
    o.push(k === 0 || k === slits + 1 ? mk : Math.min(0.97, mk + 0.15));
  }
  const out: string[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i <= slits; i++) {
      const m0 = i === 0 ? 0 : m[i]! + g;
      const m1 = i === slits ? 1 : m[i + 1]! - g;
      const o0 = i === 0 ? 0 : o[i]! + g;
      const o1 = i === slits ? 1 : o[i + 1]! - g;
      const pts: string[] = [`M0 ${r1(-L * m0)}`];
      for (let j = 0; j <= 8; j++) {
        const t = o0 + ((o1 - o0) * j) / 8;
        pts.push(`L${r1(s * w(t))} ${r1(-L * t)}`);
      }
      pts.push(`L0 ${r1(-L * m1)}Z`);
      out.push(`<path d="${pts.join('')}" fill="${colour}"/>`);
    }
  }
  out.push(stem(`M0 ${r1(L * 0.18)}L0 ${r1(-L * 0.96)}`, vein, Math.max(2, L * 0.018)));
  return out;
}

/** A banana leaf (local coords, base 0 0, tip 0 −L): two halves, a few tears, a midrib. */
function banana(L: number, W: number, a: string, b: string, vein: string): string[] {
  const w = (t: number): number => W * Math.pow(Math.sin(Math.PI * t), 0.45);
  const tears: Record<string, number[]> = { '-1': [0.3, 0.52, 0.7], '1': [0.42, 0.62] };
  const out: string[] = [];
  for (const s of [-1, 1]) {
    const cuts = [0, ...tears[String(s)]!, 1];
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = cuts[i]! + (i === 0 ? 0 : 0.008);
      const t1 = cuts[i + 1]! - (i === cuts.length - 2 ? 0 : 0.008);
      const pts: string[] = [`M0 ${r1(-L * t0)}`];
      for (let j = 0; j <= 8; j++) {
        const t = t0 + ((t1 - t0) * j) / 8;
        pts.push(`L${r1(s * w(t))} ${r1(-L * (t + (j === 0 || j === 8 ? 0 : 0.012)))}`);
      }
      pts.push(`L0 ${r1(-L * t1)}Z`);
      out.push(`<path d="${pts.join('')}" fill="${s < 0 ? a : b}"/>`);
    }
  }
  out.push(stem(`M0 ${r1(L * 0.12)}L0 ${r1(-L * 0.97)}`, vein, Math.max(2, L * 0.02)));
  return out;
}

/** A palm frond: a curved midrib through `pts` and thin leaflets on both sides. */
function frond(pts: [number, number][], colour: string, len: number, n = 14): string[] {
  const out = [stem(smoothOpen(pts), colour, 5)];
  for (let i = 0; i < n; i++) {
    const t = 0.08 + (0.9 * i) / (n - 1);
    const [x, y, dir] = along(pts, t);
    const l = len * (1 - 0.6 * t) * (0.85 + 0.15 * Math.sin(i * 1.7));
    out.push(lf(x, y, l, dir - 38, colour, 0.12), lf(x, y, l, dir + 38, colour, 0.12));
  }
  return out;
}

/** Wrap fragments in a group placed at (x, y), rotated, scaled. */
function group(parts: string[], x: number, y: number, deg = 0, s = 1): string {
  const rot = deg !== 0 ? ` rotate(${r1(deg)})` : '';
  const sc = s !== 1 ? ` scale(${Math.round(s * 100) / 100})` : '';
  return `<g transform="translate(${r1(x)} ${r1(y)})${rot}${sc}">${parts.join('')}</g>`;
}

/** Dots on a circle. */
function dotRing(cx: number, cy: number, r: number, n: number, size: number, colour: string, offset = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    out.push(fill(circle(r1(cx + Math.cos(a) * r), r1(cy + Math.sin(a) * r), size), colour));
  }
  return out;
}

/** Seeds on a Fermat spiral (sunflower heart). */
function seeds(cx: number, cy: number, R: number, n: number, colour: string): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const r = R * Math.sqrt(i / n);
    const a = i * 2.39996;
    out.push(fill(circle(r1(cx + Math.cos(a) * r), r1(cy + Math.sin(a) * r), 3.2), colour));
  }
  return out;
}

/** A hibiscus head centred on 0 0 (local coords). */
function hibiscus(r: number, a: string, b: string, core: string, pollen: string, deg = 0): string[] {
  return [
    ...ring(0, 0, 5, rounded(r, 0.68), a, deg),
    ...ring(0, 0, 5, rounded(r * 0.62, 0.48), b, deg),
    fill(circle(0, 0, r * 0.12), core),
    stem(`M0 0Q${r * 0.25} ${-r * 0.45} ${r * 0.38} ${-r * 0.8}`, pollen, Math.max(3, r * 0.035)),
    fill(circle(r1(r * 0.38), r1(-r * 0.82), r * 0.06), pollen),
    fill(circle(r1(r * 0.28), r1(-r * 0.76), r * 0.045), pollen),
    fill(circle(r1(r * 0.44), r1(-r * 0.72), r * 0.045), pollen),
  ];
}

/** A cherry blossom head centred on 0 0. */
function blossom(r: number, a = C.blossom, b = C.blossomDark, deg = 0): string[] {
  const out = [...ring(0, 0, 5, notched(r, 0.6), a, deg), fill(circle(0, 0, r * 0.28), b)];
  for (let i = 0; i < 5; i++) {
    const ang = ((deg + 36 + i * 72 - 90) * Math.PI) / 180;
    const x = Math.cos(ang) * r * 0.5;
    const y = Math.sin(ang) * r * 0.5;
    out.push(stem(`M0 0L${r1(x)} ${r1(y)}`, C.bordeaux, Math.max(1.5, r * 0.04)), fill(circle(r1(x), r1(y), r * 0.06), C.bordeaux));
  }
  return out;
}

/** A small five-petal flower centred on 0 0 (forget-me-not). */
const floret = (r: number, a: string, centre: string, deg = 0): string[] => [
  ...ring(0, 0, 5, rounded(r, 0.7), a, deg),
  fill(circle(0, 0, r * 0.3), centre),
];

/** A frangipani head centred on 0 0: five twisted petals. */
function frangipani(r: number, a: string, centre: string, deg = 0): string[] {
  return [...ring(0, 0, 5, obovate(r, 0.62), a, deg), ...ring(0, 0, 5, obovate(r * 0.45, 0.5), centre, deg), fill(circle(0, 0, r * 0.1), centre)];
}

/** A ribbon bow centred on (x, y). */
function bow(x: number, y: number, s: number, colour: string, shade: string): string[] {
  return [
    place(`M0 0C-30 -40 -80 -40 -78 -6C-76 22 -30 14 0 0Z`, colour, x, y, 0, s),
    place(`M0 0C30 -40 80 -40 78 -6C76 22 30 14 0 0Z`, colour, x, y, 0, s),
    place(`M-4 4L-40 80L-22 74L-12 90L6 8Z`, shade, x, y, 0, s),
    place(`M4 4L34 84L18 76L4 92L-6 8Z`, colour, x, y, 0, s),
    fill(circle(x, y, 12 * s), shade),
  ];
}

export const FLEURS: Drawing[] = [
  // ——— Fleurs ———
  {
    id: 'fleur-turquoise-prune',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'turquoise', 'bleu', 'violet'],
    parts: () => [
      ...ring(200, 200, 7, pointed(180, 0.42), P.teal, 8),
      ...ring(200, 200, 7, pointed(130, 0.34), P.tealDark, 8),
      ...ring(200, 200, 7, pointed(92, 0.3), '#6b5ca5', 30),
      fill(circle(200, 200, 32), P.plum),
      fill(circle(200, 200, 18), '#7a3462'),
    ],
  },
  {
    id: 'fleur-corail-etoile',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'corail', 'orange', 'lys'],
    parts: () => [
      ...ring(200, 200, 6, pointed(185, 0.36), P.coral, 0),
      ...ring(200, 200, 6, pointed(120, 0.18), P.coralLight, 0),
      ...dotRing(200, 200, 58, 12, 4.5, INK),
      fill(circle(200, 200, 36), '#3b1d2a'),
    ],
  },
  {
    id: 'fleur-moutarde-terracotta',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'jaune', 'moutarde', 'terracotta', 'automne'],
    parts: () => [
      ...ring(200, 200, 8, pointed(180, 0.34), P.mustard, 0),
      ...ring(200, 200, 8, pointed(130, 0.3), P.terracotta, 22.5),
      ...ring(200, 200, 8, pointed(80, 0.26), C.orange, 0),
      fill(circle(200, 200, 30), C.brown),
      ...dotRing(200, 200, 44, 10, 3.5, C.brown, 0.3),
    ],
  },
  {
    id: 'fleur-bleue-etoilee',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'bleu', 'étoile', 'pervenche'],
    parts: () => [
      ...ring(200, 205, 5, pointed(180, 0.5), C.blue, 0),
      ...ring(200, 205, 5, pointed(120, 0.3), C.blueLight, 0),
      ...ring(200, 205, 5, pointed(60, 0.3), P.plum, 36),
      fill(circle(200, 205, 18), C.yellow),
    ],
  },
  {
    id: 'fleur-marguerite',
    viewBox: '0 0 400 400',
    kw: ['marguerite', 'fleur', 'champs', 'printemps', 'pâquerette'],
    parts: () => [
      ...ring(200, 200, 18, rounded(175, 0.16), C.creamDark, 10),
      ...ring(200, 200, 18, rounded(165, 0.15), C.cream, 0),
      fill(circle(200, 200, 44), C.yellow),
      ...seeds(200, 200, 36, 26, C.orange),
    ],
  },
  {
    id: 'fleur-cosmos',
    viewBox: '0 0 400 400',
    kw: ['cosmos', 'fleur', 'rose', 'été', 'jardin'],
    parts: () => [
      ...ring(200, 200, 8, notched(178, 0.46), C.rose, 0),
      ...ring(200, 200, 8, pointed(110, 0.08), C.roseDark, 0),
      fill(circle(200, 200, 34), C.yellow),
      ...dotRing(200, 200, 26, 9, 4, C.orange),
    ],
  },
  {
    id: 'fleur-anemone',
    viewBox: '0 0 400 400',
    kw: ['anémone', 'fleur', 'violet', 'printemps'],
    parts: () => [
      ...ring(200, 200, 6, rounded(175, 0.72), C.lavender, 0),
      ...ring(200, 200, 6, rounded(110, 0.5), C.lavenderDark, 0),
      fill(circle(200, 200, 46), '#2a1f33'),
      ...dotRing(200, 200, 60, 16, 4, '#2a1f33'),
      ...dotRing(200, 200, 28, 8, 3, C.lavender),
    ],
  },
  {
    id: 'fleur-pavot',
    viewBox: '0 0 400 400',
    kw: ['pavot', 'coquelicot', 'fleur', 'rouge', 'champs'],
    parts: () => [
      ...ring(200, 200, 4, rounded(180, 0.85), P.red, 45),
      ...ring(200, 200, 4, rounded(175, 0.75), '#f0715d', 0),
      ...ring(200, 200, 4, rounded(90, 0.5), '#c23b2e', 0),
      fill(circle(200, 200, 34), '#2a1a1a'),
      ...ring(200, 200, 12, pointed(52, 0.08), '#2a1a1a', 0),
      fill(circle(200, 200, 14), C.olive),
    ],
  },
  {
    id: 'fleur-tournesol',
    viewBox: '0 0 400 400',
    kw: ['tournesol', 'fleur', 'soleil', 'jaune', 'été', 'provence'],
    parts: () => [
      ...ring(200, 200, 18, pointed(185, 0.22), C.orange, 10),
      ...ring(200, 200, 18, pointed(170, 0.22), C.yellow, 0),
      fill(circle(200, 200, 78), C.brown),
      ...seeds(200, 200, 70, 70, '#3e2418'),
    ],
  },
  {
    id: 'fleur-rose',
    viewBox: '0 0 400 400',
    kw: ['rose', 'fleur', 'amour', 'romantique'],
    parts: () => [
      lf(200, 200, 185, 30, P.leaf, 0.3),
      lf(200, 200, 175, 160, P.leafDark, 0.3),
      lf(200, 200, 165, 260, P.leaf, 0.3),
      ...ring(200, 200, 6, rounded(140, 0.7), C.roseDark, 0),
      ...ring(200, 200, 5, rounded(108, 0.75), C.rose, 20),
      ...ring(200, 200, 5, rounded(78, 0.75), C.roseDark, 50),
      ...ring(200, 200, 4, rounded(52, 0.8), C.rose, 15),
      fill(circle(200, 200, 22), C.roseDark),
      stem('M190 200Q196 186 210 192Q216 206 202 212', C.bordeaux, 4),
    ],
  },
  {
    id: 'fleur-pivoine',
    viewBox: '0 0 400 400',
    kw: ['pivoine', 'fleur', 'rose', 'bouquet', 'mariage'],
    parts: () => [
      ...ring(200, 200, 7, rounded(175, 0.7), C.blossom, 0),
      ...ring(200, 200, 7, rounded(150, 0.65), C.blossomDark, 25),
      ...ring(200, 200, 7, rounded(118, 0.6), C.blossom, 10),
      ...ring(200, 200, 6, rounded(90, 0.6), C.rose, 40),
      ...ring(200, 200, 6, rounded(64, 0.6), C.roseDark, 5),
      ...ring(200, 200, 5, rounded(40, 0.7), C.rose, 30),
      fill(circle(200, 200, 12), C.yellow),
    ],
  },
  {
    id: 'fleur-tulipe',
    viewBox: '0 0 300 420',
    kw: ['tulipe', 'fleur', 'printemps', 'hollande'],
    parts: () => [
      stem('M150 400Q146 300 150 170', P.leaf, 7),
      place('M0 0C40 -40 50 -150 30 -230C10 -150 -10 -60 0 0Z', P.leaf, 148, 400, -12),
      place('M0 0C-40 -40 -60 -130 -40 -200C-20 -130 0 -60 0 0Z', P.leafDark, 150, 400, 8),
      place('M-62 0C-74 -60 -60 -110 -44 -128L-20 -96L0 -136L20 -96L44 -128C60 -110 74 -60 62 0C40 26 -40 26 -62 0Z', P.coral, 150, 176),
      place('M-24 10C-40 -40 -24 -100 0 -136C24 -100 40 -40 24 10C10 18 -10 18 -24 10Z', '#d94a40', 150, 176),
    ],
  },
  {
    id: 'fleur-lys',
    viewBox: '0 0 400 400',
    kw: ['lys', 'fleur', 'rose', 'élégant'],
    parts: () => {
      const out = [...ring(200, 200, 6, pointed(180, 0.3), C.rose, 0), ...ring(200, 200, 6, pointed(130, 0.07), C.roseDark, 0)];
      for (let i = 0; i < 6; i++) {
        const a = ((i * 60 - 90) * Math.PI) / 180;
        out.push(...dotRing(200 + Math.cos(a) * 60, 200 + Math.sin(a) * 60, 10, 3, 3, C.bordeaux, a));
        const b = a + Math.PI / 6;
        const x = 200 + Math.cos(b) * 80;
        const y = 200 + Math.sin(b) * 80;
        out.push(stem(`M200 200L${r1(x)} ${r1(y)}`, P.leafLight, 3), place('M-4 -8C4 -10 10 -2 4 8C-4 10 -10 2 -4 -8Z', C.brown, x, y, (b * 180) / Math.PI));
      }
      out.push(fill(circle(200, 200, 14), P.leafLight));
      return out;
    },
  },
  {
    id: 'fleur-dahlia',
    viewBox: '0 0 400 400',
    kw: ['dahlia', 'fleur', 'orange', 'jardin', 'automne'],
    parts: () => {
      const cols = [P.terracotta, P.coral, C.orange, P.coralLight, P.mustard];
      const out: string[] = [];
      for (let j = 0; j < 5; j++) {
        out.push(...ring(200, 200, 14 - j, pointed(180 - j * 32, 0.26), cols[j]!, j * 9));
      }
      out.push(fill(circle(200, 200, 16), C.yellow));
      return out;
    },
  },
  {
    id: 'fleur-myosotis-grappe',
    viewBox: '0 0 360 380',
    kw: ['myosotis', 'fleur', 'bleu', 'petites fleurs', 'grappe'],
    parts: () => {
      const spots: [number, number, number, number][] = [
        [180, 80, 34, 0], [120, 120, 30, 20], [240, 118, 32, 40], [170, 160, 30, 10],
        [90, 190, 26, 30], [262, 196, 28, 5], [200, 226, 26, 25], [140, 246, 22, 15],
      ];
      const out = [stem('M180 370Q176 300 170 170M176 300Q130 260 92 196M178 290Q230 250 262 200', C.stem, 5)];
      out.push(lf(176, 320, 70, 210, P.leaf, 0.3), lf(178, 335, 64, -30, P.leafLight, 0.3));
      spots.forEach(([x, y, r, d], i) => out.push(group(floret(r, i % 3 === 0 ? C.blueLight : C.blue, C.yellow, d), x, y)));
      return out;
    },
  },
  {
    id: 'fleur-bouquet',
    viewBox: '0 0 360 440',
    kw: ['bouquet', 'fleurs', 'cadeau', 'anniversaire', 'mariage'],
    parts: () => [
      stem('M180 420L130 150M180 420L180 120M180 420L236 150M180 420L90 220M180 420L274 230', C.stem, 5),
      lf(150, 300, 90, 200, P.leaf, 0.3),
      lf(206, 300, 90, -20, P.leafDark, 0.3),
      lf(160, 220, 80, 230, P.leafLight, 0.3),
      lf(200, 220, 80, -50, P.leaf, 0.3),
      group([...ring(0, 0, 8, pointed(56, 0.36), P.mustard), fill(circle(0, 0, 14), C.brown)], 90, 210),
      group([...ring(0, 0, 6, rounded(60, 0.7), C.rose), fill(circle(0, 0, 14), C.bordeaux)], 274, 220),
      group([...ring(0, 0, 7, pointed(70, 0.4), P.teal), ...ring(0, 0, 7, pointed(46, 0.3), P.tealDark, 25), fill(circle(0, 0, 14), P.plum)], 130, 140),
      group([...ring(0, 0, 6, pointed(74, 0.34), P.coral), fill(circle(0, 0, 16), '#3b1d2a')], 236, 140),
      group([...ring(0, 0, 7, rounded(64, 0.7), C.blossom), ...ring(0, 0, 6, rounded(40, 0.65), C.blossomDark, 20), fill(circle(0, 0, 10), C.yellow)], 180, 92),
      ...bow(180, 330, 0.9, P.terracotta, P.clay),
    ],
  },
  {
    id: 'fleur-couronne',
    viewBox: '0 0 420 420',
    kw: ['couronne', 'fleurs', 'cadre', 'cercle', 'mariage', 'feuillage'],
    parts: () => {
      const out: string[] = [];
      const R = 160;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const x = 210 + Math.cos(a) * R;
        const y = 210 + Math.sin(a) * R;
        const tangent = (a * 180) / Math.PI + 90;
        out.push(lf(x, y, 46, tangent + (i % 2 ? 35 : -35), i % 3 === 0 ? P.sage : i % 3 === 1 ? P.leaf : P.leafLight, 0.34));
      }
      out.unshift(`<circle cx="210" cy="210" r="${R}" fill="none" stroke="${P.leafDark}" stroke-width="4"/>`);
      for (const a of [-2.2, -0.9, 0.4, 1.6, 2.6]) {
        out.push(group([...ring(0, 0, 6, rounded(30, 0.7), a > 0 ? C.rose : P.coral), fill(circle(0, 0, 8), C.yellow)], 210 + Math.cos(a) * R, 210 + Math.sin(a) * R));
      }
      for (const a of [-1.5, -0.2, 1.0, 2.1, 3.1]) out.push(fill(circle(r1(210 + Math.cos(a) * (R + 22)), r1(210 + Math.sin(a) * (R + 22)), 8), P.red));
      return out;
    },
  },
  {
    id: 'fleur-coin-floral',
    viewBox: '-20 -20 420 420',
    kw: ['coin', 'angle', 'cadre', 'photo', 'fleurs', 'feuillage'],
    parts: () => [
      ...sprig([[60, 60], [160, 50], [260, 64], [370, 50]], { n: 8, len: 46, leafC: P.sage, stemC: P.sage, angle: 50 }),
      ...sprig([[60, 60], [50, 160], [64, 260], [50, 370]], { n: 8, len: 46, leafC: P.leaf, stemC: P.leaf, angle: 50 }),
      ...dotRing(130, 120, 0, 1, 9, P.red),
      fill(circle(210, 100, 8), P.red),
      fill(circle(100, 210, 8), P.red),
      group([...ring(0, 0, 7, pointed(72, 0.4), P.coral), ...ring(0, 0, 7, pointed(46, 0.2), P.coralLight), fill(circle(0, 0, 16), '#3b1d2a')], 70, 70),
      group(floret(26, C.rose, C.yellow, 10), 150, 70),
      group(floret(24, C.rose, C.yellow, 30), 70, 150),
    ],
  },
  // ——— Brins ———
  {
    id: 'brin-coeurs',
    viewBox: '0 0 260 420',
    kw: ['brin', 'coeur', 'amour', 'tige', 'fleur'],
    parts: () => [
      stem(smoothOpen([[130, 410], [128, 300], [134, 180], [130, 70]]), P.sage, 4),
      stem('M130 300Q90 260 70 200M132 250Q176 210 196 150M131 180Q100 140 92 100', P.sage, 3.4),
      fill(heart(130, 62, 20), P.red),
      fill(heart(70, 192, 17), P.red),
      fill(heart(198, 142, 17), P.red),
      fill(heart(92, 92, 14), P.red),
      lf(128, 340, 52, -150, P.sage),
      lf(130, 360, 50, -30, P.sage),
    ],
  },
  {
    id: 'brin-coeurs-roses',
    viewBox: '0 0 300 420',
    kw: ['brin', 'coeur', 'amour', 'rose', 'saint-valentin'],
    parts: () => [
      stem(smoothOpen([[150, 410], [146, 280], [156, 150], [150, 50]]), C.stem, 4),
      stem('M148 300Q100 270 70 220M150 240Q200 210 230 160M154 170Q120 140 104 96M152 120Q180 100 196 70', C.stem, 3.4),
      lf(148, 330, 50, -150, P.sage),
      lf(150, 350, 46, -30, P.sage),
      lf(150, 260, 40, -20, P.sage),
      fill(heart(150, 40, 18), C.roseDark),
      fill(heart(68, 210, 16), C.rose),
      fill(heart(232, 150, 16), C.roseDark),
      fill(heart(102, 86, 13), C.rose),
      fill(heart(198, 60, 12), C.rose),
    ],
  },
  {
    id: 'brin-feuilles-ovales',
    viewBox: '0 0 220 420',
    kw: ['brin', 'feuille', 'branche', 'vert'],
    parts: () => {
      const out: string[] = [stem(smoothOpen([[110, 410], [106, 300], [114, 190], [108, 40]]), P.sage, 4)];
      const ys = [360, 310, 262, 214, 168, 124, 84];
      ys.forEach((y, i) => {
        out.push(`<ellipse cx="${i % 2 ? 150 : 70}" cy="${y}" rx="${30 - i * 2}" ry="${18 - i}" transform="rotate(${i % 2 ? -30 : 30} ${i % 2 ? 150 : 70} ${y})" fill="${P.sage}"/>`);
        out.push(stem(`M110 ${y + 14}L${i % 2 ? 130 : 90} ${y + 4}`, P.sage, 3));
      });
      out.push(fill(circle(108, 36, 12), P.red), fill(circle(160, 236, 7), P.red), fill(circle(60, 150, 7), P.red));
      return out;
    },
  },
  {
    id: 'brin-eucalyptus',
    viewBox: '0 0 260 440',
    kw: ['eucalyptus', 'brin', 'feuille', 'vert', 'mariage'],
    parts: () => {
      const pts: [number, number][] = [[130, 430], [120, 320], [138, 200], [126, 40]];
      const out = [stem(smoothOpen(pts), C.stem, 4)];
      for (let i = 0; i < 9; i++) {
        const t = 0.1 + i * 0.1;
        const [x, y] = along(pts, t);
        const r = 34 - i * 2.4;
        const s = i % 2 ? 1 : -1;
        out.push(`<ellipse cx="${r1(x + s * r * 0.8)}" cy="${r1(y)}" rx="${r1(r)}" ry="${r1(r * 0.85)}" fill="${i % 3 === 0 ? '#93b5a6' : P.sage}"/>`);
      }
      out.push(`<ellipse cx="126" cy="40" rx="14" ry="12" fill="${P.sage}"/>`);
      return out;
    },
  },
  {
    id: 'brin-olivier',
    viewBox: '0 0 470 300',
    kw: ['olivier', 'olive', 'branche', 'méditerranée', 'grèce', 'provence'],
    parts: () => [
      ...sprig([[20, 240], [140, 200], [270, 170], [400, 90]], { n: 12, len: 80, k: 0.16, angle: 40, leafC: C.olive, stemC: C.bark, w: 5, shade: C.oliveDark }),
      `<ellipse cx="150" cy="232" rx="13" ry="18" transform="rotate(-20 150 232)" fill="${C.oliveFruit}"/>`,
      `<ellipse cx="174" cy="236" rx="12" ry="17" transform="rotate(10 174 236)" fill="${C.oliveDark}"/>`,
      `<ellipse cx="300" cy="196" rx="12" ry="17" transform="rotate(-10 300 196)" fill="${C.oliveFruit}"/>`,
      stem('M150 214L152 204M174 219L170 206M300 179L296 168', C.bark, 3),
    ],
  },
  {
    id: 'brin-lavande',
    viewBox: '0 0 300 440',
    kw: ['lavande', 'provence', 'violet', 'fleur', 'été'],
    parts: () => {
      const out: string[] = [];
      const stems: [number, number, number][] = [[150, 60, 0], [100, 100, -12], [200, 96, 12]];
      for (const [tx, ty] of stems) out.push(stem(`M150 430Q${(tx + 150) / 2} 300 ${tx} ${ty}`, C.stem, 4));
      for (const [tx, ty, d] of stems) {
        for (let i = 0; i < 7; i++) {
          const y = ty + i * 22;
          const x = tx + (d / 12) * i * 3;
          const w = 9 + i * 0.6;
          out.push(`<ellipse cx="${r1(x - w * 0.7)}" cy="${r1(y)}" rx="${r1(w)}" ry="${r1(w * 0.6)}" transform="rotate(-30 ${r1(x - w * 0.7)} ${r1(y)})" fill="${i % 2 ? C.lavender : C.lavenderDark}"/>`);
          out.push(`<ellipse cx="${r1(x + w * 0.7)}" cy="${r1(y + 6)}" rx="${r1(w)}" ry="${r1(w * 0.6)}" transform="rotate(30 ${r1(x + w * 0.7)} ${r1(y + 6)})" fill="${i % 2 ? C.lavenderDark : C.lavender}"/>`);
        }
      }
      out.push(lf(150, 380, 70, 220, P.sage, 0.14), lf(150, 390, 70, -40, P.sage, 0.14));
      out.push(...bow(150, 340, 0.6, P.mustard, '#d9a73e'));
      return out;
    },
  },
  {
    id: 'brin-fougere',
    viewBox: '0 0 300 440',
    kw: ['fougère', 'feuille', 'forêt', 'vert', 'nature'],
    parts: () => {
      const pts: [number, number][] = [[160, 430], [150, 320], [140, 200], [150, 40]];
      const out = [stem(smoothOpen(pts), P.leafDark, 4)];
      for (let i = 0; i < 16; i++) {
        const t = 0.06 + i * 0.058;
        const [x, y, dir] = along(pts, t);
        const l = 100 * (1 - t * 0.85);
        out.push(lf(x, y, l, dir - 70, i % 2 ? P.leaf : P.leafLight, 0.2), lf(x, y, l, dir + 70, i % 2 ? P.leafLight : P.leaf, 0.2));
      }
      return out;
    },
  },
  {
    id: 'brin-baies',
    viewBox: '0 0 320 420',
    kw: ['baies', 'brin', 'rouge', 'hiver', 'houx', 'noël'],
    parts: () => {
      const out = [
        ...sprig([[160, 410], [150, 300], [166, 180], [156, 70]], { n: 6, len: 70, leafC: P.leaf, stemC: C.bark, w: 4, shade: P.leafDark, tip: false }),
      ];
      const clusters: [number, number][] = [[156, 60], [96, 170], [226, 210], [110, 290]];
      for (const [x, y] of clusters) {
        out.push(stem(`M${x} ${y + 20}L${x - 14} ${y}M${x} ${y + 20}L${x + 14} ${y + 2}M${x} ${y + 20}L${x} ${y - 6}`, C.bark, 2.5));
        out.push(fill(circle(x - 14, y, 11), P.red), fill(circle(x + 14, y + 2, 10), '#c23b2e'), fill(circle(x, y - 8, 12), P.red));
      }
      out.splice(1, 0, stem('M152 250Q120 220 100 180M160 220Q200 220 226 220M154 320Q130 310 112 296', C.bark, 3));
      return out;
    },
  },
  {
    id: 'brin-feuillage-mixte',
    viewBox: '0 0 360 420',
    kw: ['feuillage', 'brin', 'feuille', 'vert', 'composition'],
    parts: () => [
      ...sprig([[180, 410], [150, 300], [100, 180], [70, 60]], { n: 7, len: 56, leafC: P.sage, k: 0.3 }),
      ...sprig([[180, 410], [200, 290], [250, 170], [300, 70]], { n: 9, len: 46, leafC: P.leaf, k: 0.18, angle: 35 }),
      ...sprig([[180, 410], [182, 300], [176, 180], [184, 40]], { n: 6, len: 62, leafC: P.leafLight, shade: P.leaf, k: 0.34, pairs: true }),
      fill(circle(70, 60, 9), P.terracotta),
      fill(circle(300, 70, 9), P.terracotta),
    ],
  },
  {
    id: 'brin-laurier',
    viewBox: '0 0 420 360',
    kw: ['laurier', 'couronne', 'victoire', 'branche', 'grèce', 'antique'],
    parts: () => {
      const out: string[] = [];
      for (const s of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI / 2 + s * (0.15 + (i / 8) * 2.3);
          pts.push([r1(210 + Math.cos(a) * 160), r1(170 + Math.sin(a) * 150)]);
        }
        out.push(stem(smoothOpen(pts), P.leafDark, 4));
        for (let i = 1; i < 14; i++) {
          const [x, y, dir] = along(pts, i / 14);
          out.push(...lf2(x, y, 50 - i * 1.2, dir - s * 40, P.leaf, P.leafDark, 0.28));
          out.push(lf(x, y, 46 - i * 1.2, dir + s * 40, P.leafLight, 0.28));
        }
      }
      return out;
    },
  },
  {
    id: 'brin-cerisier',
    viewBox: '0 0 440 320',
    kw: ['cerisier', 'sakura', 'japon', 'printemps', 'fleur', 'branche'],
    parts: () => [
      stem('M20 280Q140 230 230 180Q320 130 420 120M230 180Q250 110 300 60M140 228Q150 170 120 120', C.bark, 8),
      group(blossom(46), 300, 60, 10),
      group(blossom(40), 120, 116, 30),
      group(blossom(44), 380, 124, 0),
      group(blossom(36), 230, 180, 20),
      group(blossom(30, C.blossomDark, C.bordeaux), 186, 200, 0),
      fill(circle(260, 120, 9), C.blossomDark),
      fill(circle(340, 136, 8), C.blossomDark),
      fill(circle(80, 252, 8), C.blossomDark),
      lf(170, 210, 34, -70, P.leafLight, 0.3),
    ],
  },
  {
    id: 'brin-gypsophile',
    viewBox: '0 0 320 420',
    kw: ['gypsophile', 'brin', 'fleurs', 'mariage', 'délicat'],
    parts: () => {
      const out = [stem('M160 410L160 260M160 260L100 150M160 260L220 140M160 300L80 230M160 300L250 240M100 150L70 90M100 150L130 80M220 140L190 70M220 140L262 90', C.stem, 3)];
      const ends: [number, number][] = [[70, 90], [130, 80], [190, 70], [262, 90], [80, 230], [250, 240], [100, 150], [220, 140]];
      for (const [x, y] of ends) {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05;
          out.push(fill(circle(r1(x + Math.cos(a) * 14), r1(y + Math.sin(a) * 12), 7), i % 2 ? C.blossom : C.cream));
        }
        out.push(fill(circle(x, y, 6), C.blossomDark));
      }
      return out;
    },
  },
  // ——— Tropiques ———
  {
    id: 'tropique-hibiscus-monstera',
    viewBox: '-60 0 520 400',
    kw: ['hibiscus', 'monstera', 'tropical', 'île', 'été', 'fleur', 'feuille'],
    parts: () => [
      group(monstera(240, 110, P.leaf, P.leafDark), 190, 330, -58),
      group(monstera(220, 100, P.leafLight, P.leaf), 270, 330, 55),
      group(frond([[0, 0], [0, -120], [10, -220]], P.leafDark, 70, 12), 230, 360, -5),
      group(hibiscus(120, P.pink, '#d94a63', '#b8324d', '#f6d46b', 10), 230, 220),
    ],
  },
  {
    id: 'tropique-hibiscus-rouge',
    viewBox: '0 0 400 400',
    kw: ['hibiscus', 'fleur', 'rouge', 'tropical', 'île', 'hawaï'],
    parts: () => [
      ...lf2(200, 210, 185, 200, P.leaf, P.leafDark, 0.34),
      ...lf2(200, 210, 175, -25, P.leafLight, P.leaf, 0.34),
      group(hibiscus(150, P.red, '#b8302a', '#7a1f1f', C.yellow, -8), 200, 200),
    ],
  },
  {
    id: 'tropique-monstera',
    viewBox: '0 0 360 500',
    kw: ['monstera', 'feuille', 'tropical', 'plante', 'jungle'],
    parts: () => [group(monstera(360, 160, P.leaf, P.leafDark, 6), 180, 410, 8)],
  },
  {
    id: 'tropique-palmier',
    viewBox: '0 -30 440 470',
    kw: ['palmier', 'plage', 'île', 'tropical', 'cocotier', 'vacances'],
    parts: () => {
      const trunk: [number, number][] = [[150, 430], [170, 330], [200, 230], [230, 140]];
      const out: string[] = [];
      for (let i = 0; i < 9; i++) {
        const [x, y, dir] = along(trunk, i / 9);
        const w = 26 - i * 1.4;
        out.push(place(`M${-w} 0L${w} 0L${w * 0.86} -34L${-w * 0.86} -30Z`, i % 2 ? C.bark : '#93714f', x, y, dir + 90));
      }
      const top: [number, number] = [230, 140];
      const fr: [number, number][][] = [
        [[0, 0], [-80, -40], [-170, 0]], [[0, 0], [-60, -80], [-120, -100]], [[0, 0], [20, -90], [60, -130]],
        [[0, 0], [90, -60], [160, -40]], [[0, 0], [100, -10], [170, 50]], [[0, 0], [-90, 10], [-150, 80]],
      ];
      fr.forEach((pts, i) => out.push(group(frond(pts, i % 2 ? P.leaf : P.leafDark, 50, 11), top[0], top[1])));
      out.push(fill(circle(220, 156, 14), C.brown), fill(circle(244, 160, 13), '#5a3322'), fill(circle(232, 176, 12), C.brown));
      return out;
    },
  },
  {
    id: 'tropique-feuille-bananier',
    viewBox: '0 0 300 490',
    kw: ['bananier', 'feuille', 'tropical', 'jungle', 'vert'],
    parts: () => [group(banana(400, 100, P.leaf, P.leafLight, P.leafDark), 150, 420, 12)],
  },
  {
    id: 'tropique-palme',
    viewBox: '0 0 450 300',
    kw: ['palme', 'feuille', 'palmier', 'tropical'],
    parts: () => [group(frond([[0, 0], [130, -80], [280, -110], [380, -60]], P.leaf, 110, 18), 20, 270)],
  },
  {
    id: 'tropique-oiseau-de-paradis',
    viewBox: '0 0 420 420',
    kw: ['strelitzia', 'oiseau de paradis', 'fleur', 'tropical', 'orange'],
    parts: () => [
      stem('M190 410Q186 320 170 250', P.leafDark, 9),
      place('M0 0C40 -30 80 -120 70 -240C40 -140 10 -60 0 0Z', P.leaf, 196, 410, 20),
      place('M0 0C-30 -40 -50 -140 -30 -220C-10 -140 0 -60 0 0Z', P.leafLight, 186, 410, -10),
      place('M0 0C60 -10 160 -6 230 22C160 30 60 26 0 0Z', P.leafDark, 160, 250, -10),
      place('M0 0C30 -16 120 -14 220 14C120 14 40 18 0 0Z', P.tealDark, 166, 246, -10),
      place(pointed(150, 0.16), C.orange, 210, 236, -40),
      place(pointed(170, 0.15), P.mustard, 220, 236, -18),
      place(pointed(140, 0.16), C.orange, 228, 238, 4),
      place(pointed(110, 0.14), C.blue, 240, 238, 28),
      place(pointed(90, 0.12), '#3d63a8', 246, 240, 46),
    ],
  },
  {
    id: 'tropique-ananas',
    viewBox: '0 0 320 440',
    kw: ['ananas', 'fruit', 'tropical', 'été', 'exotique'],
    parts: () => {
      const out: string[] = [];
      const crown: [number, number, number][] = [[-50, 130, 0.14], [-25, 160, 0.13], [0, 180, 0.13], [25, 160, 0.13], [50, 130, 0.14], [-70, 100, 0.16], [70, 100, 0.16]];
      crown.forEach(([deg, l, k], i) => out.push(place(pointed(l, k), i % 2 ? P.leaf : P.leafDark, 160, 200, deg)));
      out.push(`<ellipse cx="160" cy="306" rx="96" ry="122" fill="${C.yellow}"/>`);
      for (let row = 0; row < 8; row++) {
        for (let col = -4; col <= 4; col++) {
          const x = 160 + col * 24 + (row % 2) * 12;
          const y = 204 + row * 28;
          const dx = (x - 160) / 96;
          const dy = (y - 306) / 122;
          if (dx * dx + dy * dy > 0.78) continue;
          out.push(place('M0 -9L9 0L0 9L-9 0Z', C.orange, x, y));
          out.push(fill(circle(x, y, 2.4), C.brown));
        }
      }
      out.push(group(hibiscus(52, P.pink, '#d94a63', '#b8324d', C.yellow, 20), 82, 380));
      return out;
    },
  },
  {
    id: 'tropique-frangipani',
    viewBox: '0 0 420 360',
    kw: ['frangipanier', 'frangipani', 'fleur', 'tropical', 'polynésie', 'tiaré'],
    parts: () => [
      ...lf2(210, 220, 190, 200, P.leaf, P.leafDark, 0.26),
      ...lf2(210, 220, 180, -20, P.leafLight, P.leaf, 0.26),
      group(frangipani(110, C.cream, C.yellow, 0), 160, 170),
      group(frangipani(90, C.blossom, C.roseDark, 30), 290, 200),
    ],
  },
  {
    id: 'tropique-composition',
    viewBox: '-80 -10 680 460',
    kw: ['tropical', 'composition', 'jungle', 'fleurs', 'feuilles', 'île', 'été'],
    parts: () => [
      group(monstera(250, 112, P.leafDark, P.leaf), 170, 380, -50),
      group(banana(260, 64, P.leaf, P.leafLight, P.leafDark), 360, 390, 48),
      group(frond([[0, 0], [10, -150], [-20, -260]], P.leafLight, 70, 13), 270, 400, -12),
      group(hibiscus(90, P.pink, '#d94a63', '#b8324d', '#f6d46b', 0), 200, 250),
      group(hibiscus(70, P.coral, '#d9533f', '#9c2f22', C.yellow, 30), 330, 280),
      group(frangipani(60, C.cream, C.yellow, 12), 280, 190),
    ],
  },
];
