/**
 * More Déco labels ("Étiquettes"): blank shapes, from plain flat ovals and pennants to drawn
 * ones (a pinned note, a scroll, a rosette, a chalkboard, a stitched leather tag). They stay
 * blank: the text is a separate text block put on top. Each shape is crossed with a few
 * palettes picked for it. See `docs/design/stickers-style.md`.
 */
import {
  type Drawing,
  INK,
  circle,
  fill,
  heart,
  hatch,
  ink,
  rng,
  smoothClosed,
  smoothOpen,
  sparkle,
  star,
  stroke,
  tidy,
} from './core.ts';

/** A palette: `f` the label, `e` its border, `l` a lighter panel, `d` a deep accent. */
export interface Pal {
  id: string;
  fr: string;
  f: string;
  e: string;
  l: string;
  d: string;
}

export const PAL: Record<string, Pal> = {
  kraft: {
    id: 'kraft',
    fr: 'kraft marron',
    f: '#d8b48a',
    e: '#8a5a35',
    l: '#ead3b4',
    d: '#6b4426',
  },
  creme: { id: 'creme', fr: 'crème beige', f: '#fbf3e2', e: '#6b5a48', l: '#fffaf0', d: '#4a3d30' },
  rose: { id: 'rose', fr: 'rose', f: '#f6c1cc', e: '#b4405f', l: '#fde4ea', d: '#8e2c48' },
  menthe: {
    id: 'menthe',
    fr: 'menthe vert',
    f: '#bfe3d6',
    e: '#2f7f74',
    l: '#e3f4ee',
    d: '#1f5e56',
  },
  moutarde: {
    id: 'moutarde',
    fr: 'moutarde jaune',
    f: '#f7d98b',
    e: '#a4691a',
    l: '#fcefc8',
    d: '#7a4c10',
  },
  bleu: { id: 'bleu', fr: 'bleu', f: '#bcd5ef', e: '#2f5f9e', l: '#e2edf8', d: '#1f4170' },
  corail: {
    id: 'corail',
    fr: 'corail orange',
    f: '#f9bba5',
    e: '#c9442e',
    l: '#fde1d6',
    d: '#94301f',
  },
  lavande: {
    id: 'lavande',
    fr: 'lavande violet',
    f: '#d4c8ec',
    e: '#6a50a8',
    l: '#ece6f8',
    d: '#4b3680',
  },
  sauge: { id: 'sauge', fr: 'sauge vert', f: '#c9d8bf', e: '#5c7d4c', l: '#e6eedf', d: '#3f5a33' },
  rouge: { id: 'rouge', fr: 'rouge', f: '#d9483b', e: '#fff3e6', l: '#e86a5e', d: '#9e2d24' },
  marine: {
    id: 'marine',
    fr: 'bleu marine',
    f: '#2f4a72',
    e: '#f3e7cf',
    l: '#3c5a86',
    d: '#1d3050',
  },
  noir: { id: 'noir', fr: 'noir', f: '#2e3431', e: '#f4f1ea', l: '#3b423f', d: '#1a1e1c' },
  foret: { id: 'foret', fr: 'vert forêt', f: '#2f4a3e', e: '#f1efe4', l: '#3b5a4c', d: '#1d3027' },
  cognac: {
    id: 'cognac',
    fr: 'cognac cuir',
    f: '#b06d3b',
    e: '#f5dfbd',
    l: '#c58552',
    d: '#7a4320',
  },
  chocolat: {
    id: 'chocolat',
    fr: 'chocolat brun',
    f: '#6e4630',
    e: '#eedbbd',
    l: '#86583f',
    d: '#4a2d1d',
  },
};

// ---------------------------------------------------------------- geometry

const r1 = (n: number): number => Math.round(n * 10) / 10;
type Pt = [number, number];

const poly = (pts: Pt[]): string => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;

const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** A rectangle with concave (inverted round) corners, as on old apothecary labels. */
function notched(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 0 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 0 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 0 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 0 ${x + r} ${y}Z`
  );
}

/** Concave corners plus a round bump in the middle of each short side. */
function cartouche(x: number, y: number, w: number, h: number, r: number, b: number): string {
  const my = y + h / 2;
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 0 ${x + w} ${y + r}V${my - b}` +
    `A${b} ${b} 0 0 1 ${x + w} ${my + b}V${y + h - r}A${r} ${r} 0 0 0 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 0 ${x} ${y + h - r}V${my + b}A${b} ${b} 0 0 1 ${x} ${my - b}` +
    `V${y + r}A${r} ${r} 0 0 0 ${x + r} ${y}Z`
  );
}

/** Curly-brace ends on a band. */
function brace(x: number, y: number, w: number, h: number, k: number): string {
  const my = y + h / 2;
  const x1 = x + w;
  return (
    `M${x + k} ${y}H${x1 - k}C${x1} ${y} ${x1 - k / 3} ${my} ${x1 + k / 2} ${my}` +
    `C${x1 - k / 3} ${my} ${x1} ${y + h} ${x1 - k} ${y + h}H${x + k}` +
    `C${x} ${y + h} ${x + k / 3} ${my} ${x - k / 2} ${my}C${x + k / 3} ${my} ${x} ${y} ${x + k} ${y}Z`
  );
}

/** Scallops (outward half-bumps) along a clockwise polygon. */
function scallopPoly(pts: Pt[], size: number, amp: number): string {
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / size));
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.5) / n;
      const t1 = (k + 1) / n;
      const cx = ax + (bx - ax) * t0 + nx * amp * 2;
      const cy = ay + (by - ay) * t0 + ny * amp * 2;
      d += `Q${r1(cx)} ${r1(cy)} ${r1(ax + (bx - ax) * t1)} ${r1(ay + (by - ay) * t1)}`;
    }
  }
  return d + 'Z';
}

/** Zigzag teeth (outward) along the edges of a clockwise polygon listed in `edges`. */
function zigzagPoly(pts: Pt[], size: number, amp: number, edges: number[]): string {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % pts.length]!;
    out.push([ax, ay]);
    if (!edges.includes(i)) continue;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / size));
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      out.push([ax + (bx - ax) * t + nx * amp, ay + (by - ay) * t + ny * amp]);
      if (k < n - 1) out.push([ax + (bx - ax) * ((k + 1) / n), ay + (by - ay) * ((k + 1) / n)]);
    }
  }
  return poly(out);
}

/** A torn paper edge: every side jittered by small random steps. */
function torn(x: number, y: number, w: number, h: number, seed: number, step = 14, j = 5): string {
  const r = rng(seed);
  const pts: Pt[] = [];
  const side = (ax: number, ay: number, bx: number, by: number): void => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.round(len / step);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push([
        ax + (bx - ax) * t + (r() - 0.5) * j * 2,
        ay + (by - ay) * t + (r() - 0.5) * j * 2,
      ]);
    }
  };
  side(x, y, x + w, y);
  side(x + w, y, x + w, y + h);
  side(x + w, y + h, x, y + h);
  side(x, y + h, x, y);
  return poly(pts);
}

/** A regular polygon (or a star) of `n` corners, first corner at angle `rot`. */
function ngon(cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Round scallops around a circle (a rosette or a badge). */
function scallopCircle(cx: number, cy: number, r: number, n: number, amp: number): string {
  let d = '';
  const p = (a: number, rr: number): string =>
    `${r1(cx + Math.cos(a) * rr)} ${r1(cy + Math.sin(a) * rr)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    d += `${i === 0 ? 'M' + p(a0, r) : ''}Q${p(a1, r + amp * 2)} ${p(a2, r)}`;
  }
  return d + 'Z';
}

// ---------------------------------------------------------------- SVG fragments

const line = (d: string, c: string, w = 3): string =>
  `<path d="${tidy(d)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dashed = (d: string, c: string, w = 3, dash = '8 6'): string =>
  `<path d="${tidy(d)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
const dotted = (d: string, c: string, w = 5, gap = 11): string =>
  `<path d="${tidy(d)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="0.1 ${gap}" stroke-linecap="round"/>`;
const shadow = (d: string, dx = 6, dy = 8, a = '22'): string =>
  `<path d="${tidy(d)}" fill="#000000${a}" transform="translate(${dx} ${dy})"/>`;
const holed = (d: string, holeX: number, holeY: number, r: number, c: string): string =>
  `<path d="${tidy(d)}${circle(holeX, holeY, r)}" fill="${c}" fill-rule="evenodd"/>`;
/** A metal eyelet: a ring around a hole. */
const eyelet = (x: number, y: number, r: number, c = '#b9b2a6'): string[] => [
  `<path d="${circle(x, y, r + 7)}${circle(x, y, r)}" fill="${c}" fill-rule="evenodd"/>`,
  `<path d="${circle(x, y, r + 7)}" fill="none" stroke="#00000033" stroke-width="2"/>`,
];

// ---------------------------------------------------------------- shapes

interface Shape {
  id: string;
  fr: string;
  view: string;
  pals: string[];
  draw: (c: Pal, seed: number) => string[];
}

const SHAPES: Shape[] = [
  {
    id: 'ovale',
    fr: 'ovale ellipse',
    view: '0 0 400 250',
    pals: ['creme', 'rose', 'bleu'],
    draw: (c) => [
      shadow(ellipse(200, 125, 185, 110), 4, 6, '18'),
      fill(ellipse(200, 125, 185, 110), c.f),
      line(ellipse(200, 125, 168, 94), c.e, 3),
      line(ellipse(200, 125, 160, 87), c.e, 1.5),
      fill(sparkle(200, 52, 9), c.e),
    ],
  },
  {
    id: 'pastille',
    fr: 'pastille ronde rond cercle',
    view: '0 0 300 300',
    pals: ['moutarde', 'menthe', 'marine'],
    draw: (c) => [
      fill(circle(150, 150, 140), c.f),
      line(circle(150, 150, 124), c.e, 6),
      line(circle(150, 150, 112), c.e, 2),
    ],
  },
  {
    id: 'gelule',
    fr: 'gélule arrondie capsule pilule',
    view: '0 0 460 150',
    pals: ['lavande', 'sauge', 'rose'],
    draw: (c) => [
      shadow(rrect(10, 12, 440, 120, 60), 4, 6, '18'),
      fill(rrect(10, 12, 440, 120, 60), c.f),
      dashed(rrect(26, 28, 408, 88, 44), c.e, 3),
    ],
  },
  {
    id: 'fanion',
    fr: 'fanion triangle drapeau',
    view: '0 0 460 230',
    pals: ['rouge', 'marine', 'moutarde'],
    draw: (c) => [
      fill(
        poly([
          [26, 20],
          [446, 115],
          [26, 210],
        ]),
        c.f,
      ),
      fill('M26 20L62 28L62 202L26 210Z', c.d),
      dashed(
        poly([
          [80, 50],
          [380, 115],
          [80, 180],
        ]),
        c.e,
        3,
      ),
      ...stroke('M24 8V222', 7, { stroke: INK, roughness: 0.6 }),
    ],
  },
  {
    id: 'queue-aronde',
    fr: "drapeau queue d'aronde oriflamme",
    view: '0 0 460 210',
    pals: ['menthe', 'corail', 'kraft'],
    draw: (c) => [
      fill('M30 20H446L384 105L446 190H30Z', c.f),
      fill('M30 20H64V190H30Z', c.d),
      line('M84 42H398L354 105L398 168H84Z', c.e, 3),
      ...stroke('M28 6V204', 7, { stroke: INK, roughness: 0.6 }),
    ],
  },
  {
    id: 'coeur',
    fr: 'cœur coeur amour',
    view: '0 0 340 310',
    pals: ['rose', 'rouge', 'lavande'],
    draw: (c) => [
      shadow(heart(170, 160, 150), 4, 6, '18'),
      fill(heart(170, 160, 150), c.f),
      dashed(heart(170, 160, 126), c.e, 3),
    ],
  },
  {
    id: 'nuage',
    fr: 'nuage ciel',
    view: '0 0 420 270',
    pals: ['bleu', 'creme', 'lavande'],
    draw: (c) => {
      const cloud = (s: number): string => {
        const pts: [number, number, number][] = [
          [110, 150, 72],
          [180, 105, 80],
          [262, 100, 74],
          [320, 152, 66],
          [258, 182, 70],
          [170, 186, 72],
        ];
        return pts
          .map(([x, y, r]) => circle(210 + (x - 210) * s, 150 + (y - 150) * s, r * s))
          .join('');
      };
      const base = rrect(52, 140, 316, 110, 55);
      return [
        `<g fill="#0000001a" transform="translate(4 6)"><path d="${cloud(1)}"/><path d="${base}"/></g>`,
        `<g fill="${c.f}"><path d="${cloud(1)}"/><path d="${base}"/></g>`,
        dashed('M78 226H342', c.e, 3),
        fill(sparkle(364, 46, 14), c.e),
        fill(circle(390, 72, 5), c.e),
      ];
    },
  },
  {
    id: 'blason',
    fr: 'blason écusson bouclier',
    view: '0 0 300 360',
    pals: ['marine', 'rouge', 'sauge'],
    draw: (c) => {
      const sh = (k: number): string =>
        `M${30 + k} ${30 + k}H${270 - k}V${170}C${270 - k} ${268 - k} ${200} ${318 - k * 1.2} 150 ${345 - k * 1.4}C100 ${318 - k * 1.2} ${30 + k} ${268 - k} ${30 + k} 170Z`;
      return [
        shadow(sh(0), 4, 6, '18'),
        fill(sh(0), c.f),
        line(sh(16), c.e, 4),
        fill(star(150, 68, 16), c.e),
      ];
    },
  },
  {
    id: 'hexagone',
    fr: 'hexagone alvéole',
    view: '0 0 400 350',
    pals: ['moutarde', 'menthe', 'noir'],
    draw: (c) => [
      fill(poly(ngon(200, 175, 188, 162, 6)), c.f),
      line(poly(ngon(200, 175, 166, 143, 6)), c.e, 5),
      dashed(poly(ngon(200, 175, 150, 129, 6)), c.e, 2.5, '6 6'),
    ],
  },
  {
    id: 'apothicaire',
    fr: 'apothicaire pharmacie bocal vintage',
    view: '0 0 440 260',
    pals: ['creme', 'kraft', 'marine'],
    draw: (c) => [
      shadow(notched(10, 10, 420, 240, 36), 4, 6, '18'),
      fill(notched(10, 10, 420, 240, 36), c.f),
      line(notched(26, 26, 388, 208, 26), c.e, 4),
      line(notched(36, 36, 368, 188, 20), c.e, 1.5),
    ],
  },
  {
    id: 'losange',
    fr: 'losange diamant',
    view: '0 0 420 260',
    pals: ['corail', 'bleu', 'moutarde'],
    draw: (c) => [
      fill(
        poly([
          [210, 8],
          [412, 130],
          [210, 252],
          [8, 130],
        ]),
        c.f,
      ),
      dashed(
        poly([
          [210, 32],
          [372, 130],
          [210, 228],
          [48, 130],
        ]),
        c.e,
        3,
      ),
      fill(circle(80, 130, 6), c.e),
      fill(circle(340, 130, 6), c.e),
    ],
  },
  {
    id: 'etoile',
    fr: 'étoile',
    view: '0 0 340 330',
    pals: ['moutarde', 'rouge', 'bleu'],
    draw: (c) => [
      shadow(star(170, 178, 162, 5, 0.56), 4, 6, '18'),
      fill(star(170, 178, 162, 5, 0.56), c.f),
      dashed(star(170, 178, 132, 5, 0.56), c.e, 3),
    ],
  },
  {
    id: 'arche',
    fr: 'arche fenêtre arc',
    view: '0 0 300 380',
    pals: ['corail', 'sauge', 'kraft'],
    draw: (c) => [
      fill('M20 370V150A130 130 0 0 1 280 150V370Z', c.f),
      line('M40 350V150A110 110 0 0 1 260 150V350Z', c.e, 3),
      fill(sparkle(150, 78, 16), c.e),
      fill(circle(112, 92, 4), c.e),
      fill(circle(188, 92, 4), c.e),
    ],
  },
  {
    id: 'parchemin',
    fr: 'parchemin rouleau papier ancien',
    view: '0 0 470 250',
    pals: ['creme', 'kraft', 'moutarde'],
    draw: (c) => {
      const roll = (x: number): string[] => [
        fill(rrect(x - 22, 22, 44, 206, 22), c.l),
        fill(rrect(x - 22, 22, 18, 206, 9), '#0000001a'),
        ...stroke(rrect(x - 22, 22, 44, 206, 22), 3, { stroke: c.d, roughness: 0.8 }),
        fill(ellipse(x, 34, 12, 8), c.d),
      ];
      return [
        fill('M60 42H410V208H60Z', c.f),
        ...stroke('M60 42Q235 52 410 42M60 208Q235 198 410 208', 3, { stroke: c.d, roughness: 1 }),
        ...roll(52),
        ...roll(418),
      ];
    },
  },
  {
    id: 'ruban',
    fr: 'ruban banderole bannière courbe',
    view: '0 0 470 210',
    pals: ['rouge', 'marine', 'menthe'],
    draw: (c) => [
      fill('M12 92L96 84V174L12 182L44 136Z', c.f),
      fill('M458 92L374 84V174L458 182L426 136Z', c.f),
      fill('M70 150L96 174V146Z', c.d),
      fill('M400 150L374 174V146Z', c.d),
      fill('M70 56Q235 6 400 56V150Q235 100 70 150Z', c.f),
      dashed('M86 74Q235 28 384 74', c.e, 3),
      dashed('M86 132Q235 86 384 132', c.e, 3),
    ],
  },
  {
    id: 'cocarde',
    fr: 'cocarde rosette prix médaille',
    view: '0 0 300 400',
    pals: ['bleu', 'rouge', 'moutarde'],
    draw: (c) => [
      fill('M90 200L52 380L92 352L118 388L150 220Z', c.d),
      fill('M210 200L248 380L208 352L182 388L150 220Z', c.e === '#fff3e6' ? '#b8392d' : c.e),
      fill(scallopCircle(150, 150, 124, 22, 9), c.f),
      fill(circle(150, 150, 98), c.l),
      line(circle(150, 150, 98), c.d, 3),
      dashed(circle(150, 150, 86), c.d, 2, '5 6'),
    ],
  },
  {
    id: 'sceau',
    fr: 'sceau cachet cire',
    view: '0 0 300 300',
    pals: ['rouge', 'marine', 'sauge'],
    draw: (c, seed) => {
      const r = rng(seed);
      const outer: Pt[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const k = 128 + r() * 16;
        outer.push([150 + Math.cos(a) * k, 150 + Math.sin(a) * k]);
      }
      return [
        fill(smoothClosed(outer.map(([x, y]) => [Math.round(x), Math.round(y)])), c.d),
        fill(circle(150, 150, 104), c.f),
        line(circle(150, 150, 92), c.d, 3),
        fill('M86 92Q120 70 150 66', 'none'),
        line('M92 96Q118 74 150 70', '#ffffff55', 6),
      ];
    },
  },
  {
    id: 'eclat',
    fr: 'éclat soleil explosion promo',
    view: '0 0 340 340',
    pals: ['moutarde', 'corail', 'menthe'],
    draw: (c) => [
      fill(star(170, 170, 162, 22, 0.84), c.f),
      line(circle(170, 170, 120), c.e, 4),
      dashed(circle(170, 170, 108), c.e, 2, '5 6'),
    ],
  },
  {
    id: 'prix',
    fr: 'étiquette prix tag solde',
    view: '0 0 440 280',
    pals: ['kraft', 'rouge', 'noir'],
    draw: (c) => {
      const body = 'M100 60H400Q412 60 412 72V208Q412 220 400 220H100L28 140Z';
      return [
        `<g transform="rotate(-10 220 140)">`,
        shadow(body, 5, 7, '1c'),
        holed(body, 80, 140, 11, c.f),
        line(circle(80, 140, 17), c.e, 3),
        dashed('M122 80H392V200H122', c.e, 3),
        '</g>',
        ...stroke('M76 128C60 80 30 40 8 30', 4, { stroke: INK, roughness: 1.1 }),
      ];
    },
  },
  {
    id: 'cadeau',
    fr: 'étiquette cadeau noël anniversaire',
    view: '0 0 270 420',
    pals: ['rose', 'menthe', 'kraft'],
    draw: (c) => {
      const body = 'M30 130L100 62H170L240 130V392Q240 406 226 406H44Q30 406 30 392Z';
      return [
        shadow(body, 4, 6, '18'),
        holed(body, 135, 104, 12, c.f),
        line(circle(135, 104, 18), c.e, 3),
        dashed('M50 150L114 86H156L220 150V386H50Z', c.e, 2.5),
        ...stroke('M135 92C120 60 80 40 70 20C100 30 128 54 135 92', 4, { stroke: c.d }),
        ...stroke('M135 92C150 60 190 40 200 20C170 30 142 54 135 92', 4, { stroke: c.d }),
        ...stroke('M135 92C122 70 112 50 96 46M135 92C150 70 162 54 176 50', 3, { stroke: c.d }),
      ];
    },
  },
  {
    id: 'confiture',
    fr: 'confiture pot bocal festonnée',
    view: '0 0 440 280',
    pals: ['rose', 'rouge', 'moutarde'],
    draw: (c) => {
      const box: Pt[] = [
        [24, 24],
        [416, 24],
        [416, 256],
        [24, 256],
      ];
      return [
        fill(scallopPoly(box, 28, 8), c.f),
        fill(rrect(48, 48, 344, 184, 14), c.l),
        line(rrect(48, 48, 344, 184, 14), c.d, 3),
        fill(heart(220, 72, 9), c.d),
        fill(circle(190, 70, 3.5), c.d),
        fill(circle(250, 70, 3.5), c.d),
      ];
    },
  },
  {
    id: 'ecolier',
    fr: 'écolier école cahier rentrée',
    view: '0 0 440 260',
    pals: ['bleu', 'rouge', 'menthe'],
    draw: (c) => {
      const accent = c.id === 'rouge' ? c.f : c.e;
      return [
        shadow(rrect(10, 10, 420, 240, 22), 4, 6, '18'),
        fill(rrect(10, 10, 420, 240, 22), '#fffaf0'),
        line(rrect(22, 22, 396, 216, 14), accent, 6),
        line(rrect(36, 36, 368, 188, 8), accent, 2),
        fill(rrect(36, 36, 368, 44, 8), accent + '33'),
      ];
    },
  },
  {
    id: 'cartouche',
    fr: 'cartouche ornement vintage',
    view: '0 0 470 230',
    pals: ['kraft', 'lavande', 'marine'],
    draw: (c) => [
      shadow(cartouche(20, 15, 430, 200, 32, 28), 4, 6, '18'),
      fill(cartouche(20, 15, 430, 200, 32, 28), c.f),
      line(cartouche(38, 33, 394, 164, 24, 20), c.e, 3),
      dotted(cartouche(50, 45, 370, 140, 18, 14), c.e, 4, 10),
    ],
  },
  {
    id: 'onglet',
    fr: 'onglet intercalaire dossier classeur',
    view: '0 0 440 240',
    pals: ['bleu', 'moutarde', 'corail'],
    draw: (c) => {
      const body =
        'M30 64H150L174 22Q178 14 188 14H290Q300 14 304 22L328 64H410Q424 64 424 78V214Q424 228 410 228H30Q16 228 16 214V78Q16 64 30 64Z';
      return [
        shadow(body, 4, 6, '18'),
        fill(body, c.f),
        fill('M184 30H294L310 58H168Z', c.l),
        line('M36 84H404V208H36Z', c.e, 2.5),
      ];
    },
  },
  {
    id: 'fleur',
    fr: 'fleur pétales marguerite',
    view: '0 0 320 320',
    pals: ['rose', 'moutarde', 'lavande'],
    draw: (c) => {
      const petals = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return circle(r1(160 + Math.cos(a) * 104), r1(160 + Math.sin(a) * 104), 50);
      }).join('');
      return [
        `<path d="${petals}" fill="${c.f}"/>`,
        fill(circle(160, 160, 112), c.f),
        fill(circle(160, 160, 92), c.l),
        dashed(circle(160, 160, 80), c.e, 3),
      ];
    },
  },
  {
    id: 'tombola',
    fr: 'tombola ticket dentelé loterie',
    view: '0 0 440 200',
    pals: ['rouge', 'moutarde', 'bleu'],
    draw: (c) => {
      const pts: Pt[] = [
        [30, 20],
        [410, 20],
        [410, 180],
        [30, 180],
      ];
      return [
        fill(zigzagPoly(pts, 20, 14, [1, 3]), c.f),
        dotted('M326 26V174', c.e, 5, 12),
        line('M54 40H306V160H54Z', c.e, 3),
        fill(star(368, 100, 20), c.e),
      ];
    },
  },
  {
    id: 'punaise',
    fr: 'punaise note épinglée mémo papier',
    view: '0 0 330 350',
    pals: ['creme', 'moutarde', 'bleu'],
    draw: (c) => {
      const paper = 'M34 52L296 40L304 318L40 330Z';
      const pin = c.id === 'bleu' ? '#e0587a' : '#d9483b';
      return [
        shadow(paper, 5, 8, '1c'),
        fill(paper, c.f),
        fill('M296 40L304 318L292 318L284 42Z', '#00000010'),
        fill(ellipse(172, 56, 14, 5), '#00000033'),
        fill(circle(164, 40, 22), pin),
        fill(circle(158, 33, 7), '#ffffff88'),
        ...stroke(circle(164, 40, 22), 3, { stroke: INK, roughness: 0.7 }),
      ];
    },
  },
  {
    id: 'trombone',
    fr: 'trombone carte papier attaché',
    view: '0 0 380 310',
    pals: ['creme', 'rose', 'menthe'],
    draw: (c) => {
      const card = rrect(20, 40, 330, 250, 10);
      const clip = 'M78 120V30Q78 12 96 12Q114 12 114 30V104Q114 116 102 116Q90 116 90 104V40';
      return [
        `<g transform="rotate(2 185 165)">`,
        shadow(card, 5, 7, '1c'),
        fill(card, c.f),
        line(rrect(36, 56, 298, 218, 6), c.e, 2),
        '</g>',
        line(clip, '#5b636b', 9),
        line(clip, '#c6ccd2', 4),
      ];
    },
  },
  {
    id: 'scotch',
    fr: 'scotch adhésif collé papier',
    view: '0 0 440 280',
    pals: ['kraft', 'lavande', 'sauge'],
    draw: (c, seed) => {
      const tape = (cx: number, cy: number, a: number): string =>
        `<g transform="rotate(${a} ${cx} ${cy})">${fill(
          zigzagPoly(
            [
              [cx - 52, cy - 18],
              [cx + 52, cy - 18],
              [cx + 52, cy + 18],
              [cx - 52, cy + 18],
            ],
            9,
            4,
            [1, 3],
          ),
          '#efe3c4d0',
        )}${line('M' + (cx - 30) + ' ' + (cy - 18) + 'V' + (cy + 18), '#ffffff66', 2)}</g>`;
      return [
        shadow(torn(36, 40, 368, 210, seed, 18, 2.5), 4, 7, '1a'),
        fill(torn(36, 40, 368, 210, seed, 18, 2.5), c.f),
        tape(56, 52, -34),
        tape(384, 52, 34),
      ];
    },
  },
  {
    id: 'dechiree',
    fr: 'papier déchiré morceau bout',
    view: '0 0 440 210',
    pals: ['creme', 'kraft', 'bleu'],
    draw: (c, seed) => {
      const sheet = torn(20, 30, 400, 150, seed, 11, 7);
      return [shadow(sheet, 3, 6, '1e'), fill(sheet, c.f)];
    },
  },
  {
    id: 'panneau',
    fr: 'panneau flèche direction bois',
    view: '0 0 470 210',
    pals: ['kraft', 'sauge', 'marine'],
    draw: (c) => {
      const plank = 'M24 32H370L446 105L370 178H24Z';
      return [
        shadow(plank, 4, 6, '1c'),
        fill(plank, c.f),
        ...stroke('M40 70Q140 64 250 74T360 66M40 146Q160 152 270 140T380 148', 2.5, {
          stroke: c.d,
          roughness: 1.4,
        }),
        ...stroke(plank, 4, { stroke: c.d, roughness: 0.8 }),
        fill(circle(50, 105, 7), c.d),
        fill(circle(360, 105, 7), c.d),
      ];
    },
  },
  {
    id: 'cuir',
    fr: 'cuir couture surpiqûre artisan',
    view: '0 0 440 240',
    pals: ['cognac', 'chocolat', 'marine'],
    draw: (c) => {
      const body = 'M84 20H408Q424 20 424 36V204Q424 220 408 220H84L18 156V84Z';
      return [
        shadow(body, 4, 7, '22'),
        fill(body, c.f),
        fill('M84 20H408Q424 20 424 36V60Q250 40 84 44L18 100V84Z', '#ffffff14'),
        dashed('M90 38H392Q406 38 406 52V188Q406 202 392 202H90L38 150V90Z', c.e, 3, '10 7'),
        ...eyelet(70, 120, 12),
      ];
    },
  },
  {
    id: 'ardoise',
    fr: 'ardoise tableau noir craie école',
    view: '0 0 440 290',
    pals: ['noir', 'foret'],
    draw: (c) => [
      shadow(rrect(10, 10, 420, 270, 18), 4, 7, '22'),
      fill(rrect(10, 10, 420, 270, 18), '#b98250'),
      ...stroke('M24 22Q120 18 220 24T414 22M26 266Q140 270 240 264T414 268', 2, {
        stroke: '#8a5a35',
        roughness: 1.5,
      }),
      fill(rrect(34, 34, 372, 222, 8), c.f),
      ...stroke('M70 220Q150 200 230 214', 10, { stroke: '#ffffff14', roughness: 2 }),
      ...stroke('M240 70Q310 56 370 66', 12, { stroke: '#ffffff10', roughness: 2 }),
      fill(rrect(300, 246, 52, 12, 5), '#f4f1ea'),
    ],
  },
  {
    id: 'enveloppe',
    fr: 'enveloppe lettre courrier',
    view: '0 0 420 290',
    pals: ['kraft', 'rose', 'bleu'],
    draw: (c) => [
      shadow(rrect(14, 20, 392, 250, 10), 4, 6, '1a'),
      fill(rrect(14, 20, 392, 250, 10), c.f),
      fill('M18 26L210 130L402 26Q402 22 396 22H24Q18 22 18 26Z', c.l),
      line('M20 26L210 130L400 26', c.e, 3),
      line('M24 262L160 162M396 262L260 162', c.e, 2),
      fill(heart(210, 132, 22), c.id === 'rose' ? '#b4405f' : '#d9483b'),
    ],
  },
  {
    id: 'medaillon',
    fr: 'médaillon ovale perlé camée',
    view: '0 0 300 390',
    pals: ['sauge', 'lavande', 'rose'],
    draw: (c) => [
      fill(ellipse(150, 195, 138, 182), c.f),
      dotted(ellipse(150, 195, 124, 168), c.e, 8, 18),
      line(ellipse(150, 195, 108, 150), c.e, 3),
      fill(sparkle(150, 48, 10), c.e),
    ],
  },
  {
    id: 'accolade',
    fr: 'accolade crochet bannière',
    view: '0 0 470 200',
    pals: ['menthe', 'corail', 'marine'],
    draw: (c) => [
      shadow(brace(44, 20, 382, 160, 40), 4, 6, '18'),
      fill(brace(44, 20, 382, 160, 40), c.f),
      line(brace(70, 38, 330, 124, 30), c.e, 3),
    ],
  },
  {
    id: 'aeroport',
    fr: 'bagage aéroport avion embarquement valise',
    view: '0 0 470 170',
    pals: ['bleu', 'rouge', 'moutarde'],
    draw: (c) => {
      const body = rrect(14, 16, 440, 138, 18);
      const bars = [0, 7, 11, 20, 24, 31, 38, 42, 50, 54, 61, 66]
        .map((x, i) => `M${376 + x} 48V${i % 3 === 0 ? 124 : 116}`)
        .join('');
      return [
        shadow(body, 4, 6, '1a'),
        holed(body, 46, 85, 11, '#fffaf0'),
        fill('M350 16H436Q454 16 454 34V136Q454 154 436 154H350Z', c.f),
        `<path d="${bars}" stroke="${c.id === 'rouge' ? '#fff3e6' : c.d}" stroke-width="4"/>`,
        line('M84 34H330V136H84Z', c.id === 'rouge' ? c.f : c.e, 3),
        ...eyelet(46, 85, 11),
      ];
    },
  },
  {
    id: 'noeud',
    fr: 'nœud noeud ruban cadeau',
    view: '0 0 440 300',
    pals: ['rose', 'rouge', 'bleu'],
    draw: (c) => {
      const ribbon = c.id === 'rouge' ? '#9e2d24' : c.e;
      return [
        shadow(rrect(20, 60, 400, 220, 14), 4, 6, '18'),
        fill(rrect(20, 60, 400, 220, 14), c.id === 'rouge' ? '#fbeee0' : c.l),
        fill('M20 92H420V110H20Z', ribbon),
        fill('M300 60H318V280H300Z', ribbon),
        fill('M309 101C270 50 250 40 244 70C240 100 270 108 309 101Z', ribbon),
        fill('M309 101C348 50 368 40 374 70C378 100 348 108 309 101Z', ribbon),
        fill('M300 104L270 168L290 160L300 178L309 112Z', ribbon),
        fill('M318 104L348 168L328 160L318 178L309 112Z', ribbon),
        fill(circle(309, 101, 14), ribbon),
        fill(circle(304, 96, 5), '#ffffff55'),
      ];
    },
  },
  {
    id: 'ornee',
    fr: 'ornée volutes arabesques vintage',
    view: '0 0 440 280',
    pals: ['creme', 'sauge', 'bleu'],
    draw: (c) => {
      const curl = (x: number, y: number, sx: number, sy: number): string =>
        smoothOpen([
          [x, y + sy * 54],
          [x, y + sy * 16],
          [x + sx * 16, y],
          [x + sx * 54, y],
        ]) + `M${x + sx * 18} ${y + sy * 18}m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0`;
      return [
        shadow(rrect(14, 14, 412, 252, 12), 4, 6, '18'),
        fill(rrect(14, 14, 412, 252, 12), c.l),
        line(rrect(28, 28, 384, 224, 6), c.e, 3),
        line(curl(44, 44, 1, 1), c.e, 3),
        line(curl(396, 44, -1, 1), c.e, 3),
        line(curl(44, 236, 1, -1), c.e, 3),
        line(curl(396, 236, -1, -1), c.e, 3),
        fill(sparkle(220, 44, 9), c.e),
        fill(sparkle(220, 236, 9), c.e),
      ];
    },
  },
  {
    id: 'griffonnee',
    fr: 'griffonnée dessinée croquis main',
    view: '0 0 440 230',
    pals: ['moutarde', 'rose', 'menthe'],
    draw: (c) => [
      ...hatch('M44 46H420V204H44Z', { gap: 8, angle: -50, w: 2 }),
      ...ink('M24 26H404V186H24Z', { w: 6, fill: c.f }),
      fill(sparkle(404, 26, 16), INK),
    ],
  },
  {
    id: 'griffonnee-ronde',
    fr: 'griffonnée ronde dessinée croquis main',
    view: '0 0 320 320',
    pals: ['corail', 'bleu', 'lavande'],
    draw: (c) => [
      ...hatch(circle(170, 172, 128), { gap: 9, w: 2 }),
      ...ink(circle(156, 156, 132), { w: 6, fill: c.f }),
      fill(sparkle(268, 46, 15), INK),
      fill(circle(292, 80, 5), INK),
    ],
  },
];

export const ETIQUETTES: Drawing[] = SHAPES.flatMap((s, si) =>
  s.pals.map((p) => {
    const c = PAL[p]!;
    return {
      id: `etiquette-${s.id}-${c.id}`,
      viewBox: s.view,
      kw: ['étiquette', 'label', ...s.fr.split(' '), ...c.fr.split(' ')],
      parts: () => s.draw(c, 100 + si * 7),
    };
  }),
);
