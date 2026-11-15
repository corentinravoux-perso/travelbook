/** Croquis: arrows. */
import { type Drawing, smoothOpen, stroke } from './core.ts';
import { type Pt, cpts, hollowArrow, inkArrow, poly, qpts, solid } from './croquis-kit.ts';

/** A drawn line ending in a solid triangular head. */
function lineArrow(pts: Pt[], w: number, h: number, start = false): string[] {
  const head = (end: Pt, prev: Pt): string => {
    const dx = end[0] - prev[0];
    const dy = end[1] - prev[1];
    const l = Math.hypot(dx, dy) || 1;
    const tx = dx / l;
    const ty = dy / l;
    return poly([
      [end[0] + tx * h * 0.6, end[1] + ty * h * 0.6],
      [end[0] - tx * h * 0.6 - ty * h * 0.55, end[1] - ty * h * 0.6 + tx * h * 0.55],
      [end[0] - tx * h * 0.6 + ty * h * 0.55, end[1] - ty * h * 0.6 - tx * h * 0.55],
    ]);
  };
  const n = pts.length;
  const out = [
    ...stroke(smoothOpen(pts), w, { roughness: 0.7 }),
    ...solid(head(pts[n - 1]!, pts[n - 3] ?? pts[0]!), 6),
  ];
  if (start) out.push(...solid(head(pts[0]!, pts[2] ?? pts[n - 1]!), 6));
  return out;
}

/** A drawn line ending in an open V head. */
function vArrow(pts: Pt[], w: number, h: number): string[] {
  const n = pts.length;
  const end = pts[n - 1]!;
  const prev = pts[n - 3] ?? pts[0]!;
  const dx = end[0] - prev[0];
  const dy = end[1] - prev[1];
  const l = Math.hypot(dx, dy) || 1;
  const tx = dx / l;
  const ty = dy / l;
  const a: Pt = [end[0] - tx * h - ty * h * 0.7, end[1] - ty * h + tx * h * 0.7];
  const b: Pt = [end[0] - tx * h + ty * h * 0.7, end[1] - ty * h - tx * h * 0.7];
  return [
    ...stroke(smoothOpen(pts), w, { roughness: 0.8 }),
    ...stroke(
      `M${Math.round(a[0])} ${Math.round(a[1])}L${Math.round(end[0])} ${Math.round(end[1])}L${Math.round(b[0])} ${Math.round(b[1])}`,
      w,
      { roughness: 0.8 },
    ),
  ];
}

export const FLECHES: Drawing[] = [
  {
    id: 'fleche-droite',
    viewBox: '0 0 420 200',
    kw: ['flèche', 'droite', 'direction', 'ici'],
    parts: () => [
      ...inkArrow(qpts([20, 130], [180, 96], [320, 100]), 40, 50, 70),
      ...stroke('M40 170Q160 150 280 160', 4, { roughness: 1.6 }),
    ],
  },
  {
    id: 'fleche-courbe-bas',
    viewBox: '0 0 400 330',
    kw: ['flèche', 'courbe', 'bas', 'direction'],
    parts: () => {
      const pts = cpts([30, 70], [170, 20], [300, 80], [310, 220]);
      return [
        ...hollowArrow(pts, 44, 56, 76),
        ...stroke('M40 110Q160 70 250 110', 4, { roughness: 1.6 }),
      ];
    },
  },
  {
    id: 'fleche-boucle',
    viewBox: '0 0 420 300',
    kw: ['flèche', 'boucle', 'tourbillon', 'direction'],
    parts: () =>
      lineArrow(
        [
          [20, 230],
          [90, 210],
          [160, 170],
          [200, 110],
          [190, 60],
          [150, 50],
          [120, 80],
          [130, 140],
          [180, 190],
          [250, 210],
          [320, 200],
          [380, 170],
        ],
        10,
        56,
      ),
  },
  {
    id: 'fleche-double',
    viewBox: '0 0 420 180',
    kw: ['flèche', 'double', 'aller-retour', 'échange'],
    parts: () => lineArrow(qpts([50, 110], [210, 50], [370, 104], 16), 11, 60, true),
  },
  {
    id: 'fleche-zigzag',
    viewBox: '0 0 420 260',
    kw: ['flèche', 'zigzag', 'éclair', 'direction'],
    parts: () =>
      lineArrow(
        [
          [20, 200],
          [70, 120],
          [120, 200],
          [170, 110],
          [220, 190],
          [270, 100],
          [320, 170],
          [370, 80],
          [380, 64],
        ],
        11,
        58,
      ),
  },
  {
    id: 'fleche-spirale',
    viewBox: '0 0 400 340',
    kw: ['flèche', 'spirale', 'tourbillon', 'tourner'],
    parts: () => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 4.2;
        const r = 10 + i * 3.4;
        pts.push([Math.round(160 + Math.cos(a) * r), Math.round(170 + Math.sin(a) * r * 0.9)]);
      }
      pts.push([326, 248], [350, 232]);
      return lineArrow(pts, 9, 54);
    },
  },
  {
    id: 'fleche-rebond',
    viewBox: '0 0 420 260',
    kw: ['flèche', 'rebond', 'saut', 'arc'],
    parts: () => [
      ...vArrow(
        [
          [24, 220],
          [70, 110],
          [120, 90],
          [160, 200],
          [170, 214],
          [210, 120],
          [260, 70],
          [310, 90],
          [350, 160],
          [372, 210],
        ],
        9,
        40,
      ),
    ],
  },
  {
    id: 'fleche-fine-courbe',
    viewBox: '0 0 400 300',
    kw: ['flèche', 'fine', 'courbe', 'note', 'regarde'],
    parts: () => vArrow(cpts([30, 260], [40, 100], [200, 40], [360, 80], 20), 8, 42),
  },
  {
    id: 'fleche-coeur',
    viewBox: '0 0 420 240',
    kw: ['flèche', 'coeur', 'cupidon', 'amour'],
    parts: () => [
      ...stroke('M30 190L370 60', 10),
      ...solid(
        poly([
          [392, 52],
          [334, 50],
          [356, 94],
        ]),
        6,
      ),
      ...stroke('M30 190L60 160M50 196L80 166M30 168L52 146M60 210L94 178', 7),
      ...solid(
        'M210 158C190 160 150 140 156 112C160 90 186 88 198 106C204 84 236 84 238 108C242 138 222 152 210 158Z',
        6,
      ),
    ],
  },
];
