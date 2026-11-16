/**
 * Torn-paper labels for the Déco set: plain rectangles torn on one side, two sides, a corner or
 * all four, in five tear styles (fine, chunky, teeth, soft wave, and fibre: the pale paper core
 * showing along the tear), plus notebook pages torn from a pad (Seyès, squared, lined). No
 * printed border: the paper alone carries the label. See `docs/design/stickers-style.md`.
 */
import { type Drawing, circle, rng } from './core.ts';
import { PAL, type Pal } from './deco-etiquettes.ts';

type Pt = [number, number];
type Style = 'fin' | 'gros' | 'dents' | 'vague' | 'fibre';
/** Which sides are torn: top, right, bottom, left. */
type Sides = [boolean, boolean, boolean, boolean];

const r1 = (n: number): number => Math.round(n * 10) / 10;
const poly = (pts: Pt[]): string => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;

/** A seed from a string, so every sticker tears its own way. */
function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Inward offsets along one torn side of length `len`, at `n + 1` evenly spaced samples. */
function profile(style: Style, len: number, r: () => number): number[] {
  const step = { fin: 7, gros: 24, dents: 13, vague: 6, fibre: 9 }[style];
  const n = Math.max(2, Math.round(len / step));
  const f1 = (Math.PI * 2 * len) / (110 + r() * 50);
  const f2 = (Math.PI * 2 * len) / (40 + r() * 20);
  const p1 = r() * 6.3;
  const p2 = r() * 6.3;
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    switch (style) {
      case 'fin':
        out.push(1 + r() * 5);
        break;
      case 'gros':
        out.push(2 + r() * 13);
        break;
      case 'dents':
        out.push(k % 2 === 0 ? 1 + r() * 3 : 8 + r() * 9);
        break;
      case 'vague':
        out.push(Math.max(0, 8 + 6 * Math.sin(t * f1 + p1) + 2.5 * Math.sin(t * f2 + p2) + r()));
        break;
      case 'fibre':
        out.push(2 + r() * 7);
        break;
    }
  }
  return out;
}

/**
 * The outline of a rectangle whose `torn` sides follow a tear profile. `extra` pushes the torn
 * sides further in (the top layer of a fibre tear); straight sides stay put.
 */
function tornRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  torn: Sides,
  offsets: number[][],
  extra: number[][] | null = null,
): string {
  const corners: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const normals: Pt[] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % 4]!;
    if (!torn[i]) {
      if (!torn[(i + 3) % 4]) pts.push([ax, ay]);
      continue;
    }
    const off = offsets[i]!;
    const n = off.length - 1;
    const [nx, ny] = normals[i]!;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const o = off[k]! + (extra ? extra[i]![k]! : 0);
      if (k === n && torn[(i + 1) % 4]) continue; // the next torn side owns this corner
      if (k === 0 && torn[(i + 3) % 4]) {
        // Two torn sides meet: one corner point, pushed in along both normals (no spike).
        const j = (i + 3) % 4;
        const prev = offsets[j]!;
        const op = prev[prev.length - 1]! + (extra ? extra[j]![prev.length - 1]! : 0);
        const [px, py] = normals[j]!;
        pts.push([ax + nx * o + px * op, ay + ny * o + py * op]);
        continue;
      }
      pts.push([ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o]);
    }
  }
  return poly(pts);
}

/** Offsets for the four sides (empty for a straight side). */
function sideOffsets(style: Style, torn: Sides, w: number, h: number, r: () => number): number[][] {
  return torn.map((t, i) => (t ? profile(style, i % 2 === 0 ? w : h, r) : []));
}

/** The pale paper core of a fibre tear, on light and on dark paper. */
const core = (c: Pal): string =>
  ['rouge', 'marine', 'noir', 'foret'].includes(c.id) ? '#ece6da' : '#fffdf7';

/** A torn label: shadow, then (fibre) the pale core, then the paper. */
function tornLabel(
  id: string,
  style: Style,
  torn: Sides,
  paper: string,
  coreColour: string,
  box: [number, number, number, number],
): { outline: string; parts: string[] } {
  const [x0, y0, x1, y1] = box;
  const r = rng(hash(id));
  const offs = sideOffsets(style, torn, x1 - x0, y1 - y0, r);
  const base = tornRect(x0, y0, x1, y1, torn, offs);
  const parts = [`<path d="${base}" fill="#0000001c" transform="translate(3 5)"/>`];
  if (style === 'fibre') {
    const more = offs.map((o) => o.map(() => 2.5 + r() * 6));
    const top = tornRect(x0, y0, x1, y1, torn, offs, more);
    parts.push(`<path d="${base}" fill="${coreColour}"/>`, `<path d="${top}" fill="${paper}"/>`);
    return { outline: top, parts };
  }
  parts.push(`<path d="${base}" fill="${paper}"/>`);
  return { outline: base, parts };
}

// ---------------------------------------------------------------- plain torn labels

const SIDES: { id: string; fr: string; torn: Sides }[] = [
  { id: 'droite', fr: 'un côté droite', torn: [false, true, false, false] },
  { id: 'bas', fr: 'un côté bas', torn: [false, false, true, false] },
  { id: 'gauche-droite', fr: 'deux côtés gauche droite', torn: [false, true, false, true] },
  { id: 'haut-bas', fr: 'deux côtés haut bas', torn: [true, false, true, false] },
  { id: 'coin', fr: 'coin angle deux côtés', torn: [true, true, false, false] },
  { id: 'tous', fr: 'tous les côtés bords', torn: [true, true, true, true] },
];

const STYLES: { id: Style; fr: string }[] = [
  { id: 'fin', fr: 'fin net' },
  { id: 'gros', fr: 'gros morceaux irrégulier' },
  { id: 'dents', fr: 'dents pointu' },
  { id: 'vague', fr: 'vague ondulé doux' },
  { id: 'fibre', fr: 'fibre frange bord blanc' },
];

const CYCLE = [
  'kraft',
  'rose',
  'creme',
  'bleu',
  'moutarde',
  'menthe',
  'corail',
  'lavande',
  'sauge',
  'marine',
  'rouge',
  'noir',
  'foret',
];

const PLAIN: Drawing[] = [];
let shapeIndex = 0;
for (const st of STYLES) {
  for (const sd of SIDES) {
    const i = shapeIndex++;
    for (const p of [CYCLE[(2 * i) % CYCLE.length]!, CYCLE[(2 * i + 1) % CYCLE.length]!]) {
      const c = PAL[p]!;
      const id = `etiquette-papier-${sd.id}-${st.id}-${c.id}`;
      PLAIN.push({
        id,
        viewBox: '0 0 440 220',
        kw: [
          'étiquette',
          'label',
          'papier',
          'déchiré',
          'déchirée',
          ...sd.fr.split(' '),
          ...st.fr.split(' '),
          ...c.fr.split(' '),
        ],
        parts: () => tornLabel(id, st.id, sd.torn, c.f, core(c), [20, 22, 420, 198]).parts,
      });
    }
  }
}

// ---------------------------------------------------------------- notebook pages

const NOTE_PAPERS = [
  { id: 'blanc', fr: 'blanc', paper: '#fffdf8' },
  { id: 'jaune', fr: 'jaune', paper: '#fff3c4' },
];

type Ruling = () => string[];

/** French Seyès ruling: 8 px lines, every fourth one stronger, verticals and a red margin. */
const seyes: Ruling = () => {
  const out: string[] = [];
  let d = '';
  for (let y = 38, k = 0; y < 196; y += 8, k++) if (k % 4 !== 0) d += `M20 ${y}H420`;
  out.push(`<path d="${d}" stroke="#c9d0ee" stroke-width="1"/>`);
  d = '';
  for (let y = 38; y < 196; y += 32) d += `M20 ${y}H420`;
  for (let x = 102; x < 420; x += 32) d += `M${x} 22V198`;
  out.push(`<path d="${d}" stroke="#9aa6dc" stroke-width="1.6"/>`);
  out.push('<path d="M86 22V198" stroke="#e0706b" stroke-width="2"/>');
  return out;
};

/** Squared paper, 16 px. */
const carreaux: Ruling = () => {
  let d = '';
  for (let y = 30; y < 198; y += 16) d += `M20 ${y}H420`;
  for (let x = 28; x < 420; x += 16) d += `M${x} 22V198`;
  return [`<path d="${d}" stroke="#b9cfe4" stroke-width="1.2"/>`];
};

/** Lined paper with a red margin. */
const lignes: Ruling = () => {
  let d = '';
  for (let y = 56; y < 196; y += 24) d += `M20 ${y}H420`;
  return [
    `<path d="${d}" stroke="#9fc0e0" stroke-width="1.6"/>`,
    '<path d="M76 22V198" stroke="#e0706b" stroke-width="2"/>',
  ];
};

const NOTEBOOK: {
  id: string;
  fr: string;
  style: Style;
  torn: Sides;
  ruling: Ruling;
  holes: boolean;
}[] = [
  {
    id: 'seyes',
    fr: 'cahier seyès grands carreaux école feuille spirale',
    style: 'fin',
    torn: [false, false, false, true],
    ruling: seyes,
    holes: true,
  },
  {
    id: 'carreaux',
    fr: 'cahier petits carreaux quadrillé bloc feuille',
    style: 'fibre',
    torn: [true, false, false, false],
    ruling: carreaux,
    holes: false,
  },
  {
    id: 'lignes',
    fr: 'cahier lignes ligné bloc-notes feuille',
    style: 'vague',
    torn: [false, false, true, false],
    ruling: lignes,
    holes: false,
  },
];

const NOTES: Drawing[] = NOTEBOOK.flatMap((nb) =>
  NOTE_PAPERS.map((p) => {
    const id = `etiquette-cahier-${nb.id}-${p.id}`;
    return {
      id,
      viewBox: '0 0 440 220',
      kw: ['étiquette', 'label', 'papier', 'déchiré', ...nb.fr.split(' '), ...p.fr.split(' ')],
      parts: () => {
        const { outline, parts } = tornLabel(
          id,
          nb.style,
          nb.torn,
          p.paper,
          '#ffffff',
          [20, 22, 420, 198],
        );
        const clip = `cp-${id}`;
        let holes = '';
        if (nb.holes) for (let y = 40; y < 190; y += 26) holes += circle(40, y, 5);
        return [
          ...parts.slice(0, -1),
          `<clipPath id="${clip}"><path d="${outline}${holes}" clip-rule="evenodd"/></clipPath>`,
          `<path d="${outline}${holes}" fill="${p.paper}" fill-rule="evenodd"/>`,
          `<g clip-path="url(#${clip})" fill="none">${nb.ruling().join('')}</g>`,
          ...(nb.holes
            ? [`<path d="${holes}" fill="none" stroke="#00000022" stroke-width="1.5"/>`]
            : []),
        ];
      },
    };
  }),
);

export const ETIQUETTES_PAPIER: Drawing[] = [...PLAIN, ...NOTES];
