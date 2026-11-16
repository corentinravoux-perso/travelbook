/**
 * The "Déco" set, generated: washi tape, labels and tags, travel stamps, hand-drawn arrows,
 * speech bubbles, frames and corners, confetti and French hand lettering. Each family is a
 * small generator crossed with a few palettes. See `docs/design/stickers-style.md`.
 */
import {
  type Drawing,
  INK,
  PAPER,
  circle,
  fill,
  heart,
  ink,
  rng,
  smoothOpen,
  sparkle,
  star,
  stroke,
  tidy,
} from './core.ts';
import { ETIQUETTES_PAPIER } from './deco-etiquettes-papier.ts';
import { ETIQUETTES } from './deco-etiquettes.ts';
import { font, textOnCircle, textPath, textWidth } from './text.ts';

export const SET = {
  id: 'deco',
  name: 'Déco',
  order: 4,
  categories: {
    washi: 'Washi tape',
    etiquette: 'Étiquettes',
    tampon: 'Tampons',
    fleche: 'Flèches',
    bulle: 'Bulles',
    cadre: 'Cadres et coins',
    confettis: 'Confettis',
    lettrage: 'Lettrages',
  },
};

const DRAWINGS_: Drawing[] = [];
const add = (d: Drawing): void => {
  DRAWINGS_.push(d);
};

// ---------------------------------------------------------------- washi tape

interface Palette {
  id: string;
  fr: string;
  base: string;
  motif: string;
  light: string;
}

const PALETTES: Palette[] = [
  { id: 'rose', fr: 'rose', base: '#f6c1cc', motif: '#e0587a', light: '#fde4ea' },
  { id: 'menthe', fr: 'menthe vert', base: '#bfe3d6', motif: '#2f8f84', light: '#e3f4ee' },
  { id: 'moutarde', fr: 'moutarde jaune', base: '#f7d98b', motif: '#c07f1f', light: '#fcefc8' },
  { id: 'bleu', fr: 'bleu', base: '#bcd5ef', motif: '#2f5f9e', light: '#e2edf8' },
  { id: 'corail', fr: 'corail orange', base: '#f9bba5', motif: '#de5038', light: '#fde1d6' },
  { id: 'kraft', fr: 'kraft marron', base: '#d9b78c', motif: '#7d4f2c', light: '#ead3b4' },
  { id: 'lavande', fr: 'lavande violet', base: '#d4c8ec', motif: '#6a50a8', light: '#ece6f8' },
  { id: 'sauge', fr: 'sauge vert', base: '#c9d8bf', motif: '#5c7d4c', light: '#e6eedf' },
];

const TAPE_W = 420;
const TAPE_H = 84;

/** The tape outline: torn (jagged) short ends. */
function tapeOutline(seed: number): string {
  const r = rng(seed);
  const left: string[] = [];
  const right: string[] = [];
  for (let y = 0; y <= TAPE_H; y += 7) {
    left.push(`${Math.round(r() * 9)} ${y}`);
    right.push(`${TAPE_W - Math.round(r() * 9)} ${TAPE_H - y}`);
  }
  return `M${left.join('L')}L${right.join('L')}Z`;
}

type Motif = (p: Palette) => string[];

const MOTIFS: Record<string, { fr: string; draw: Motif }> = {
  rayures: {
    fr: 'rayures rayé',
    draw: (p) => {
      const out: string[] = [];
      for (let x = -TAPE_H; x < TAPE_W + TAPE_H; x += 28) {
        out.push(
          fill(
            `M${x} ${TAPE_H}L${x + TAPE_H} 0L${x + TAPE_H + 12} 0L${x + 12} ${TAPE_H}Z`,
            p.motif,
          ),
        );
      }
      return out;
    },
  },
  pois: {
    fr: 'pois points',
    draw: (p) => {
      const out: string[] = [];
      for (let y = 14, row = 0; y < TAPE_H; y += 28, row++) {
        for (let x = row % 2 ? 26 : 12; x < TAPE_W; x += 28)
          out.push(fill(circle(x, y, 5.5), p.motif));
      }
      return out;
    },
  },
  vichy: {
    fr: 'vichy carreaux',
    draw: (p) => {
      const out: string[] = [];
      for (let x = 0; x < TAPE_W; x += 28)
        out.push(
          `<rect x="${x}" y="0" width="14" height="${TAPE_H}" fill="${p.motif}" opacity="0.45"/>`,
        );
      for (let y = 0; y < TAPE_H; y += 28)
        out.push(
          `<rect x="0" y="${y}" width="${TAPE_W}" height="14" fill="${p.motif}" opacity="0.45"/>`,
        );
      return out;
    },
  },
  coeurs: {
    fr: 'coeurs amour',
    draw: (p) => {
      const out: string[] = [];
      for (let y = 22, row = 0; y < TAPE_H; y += 40, row++) {
        for (let x = row % 2 ? 44 : 20; x < TAPE_W; x += 48)
          out.push(fill(heart(x, y, 9), p.motif));
      }
      return out;
    },
  },
  etoiles: {
    fr: 'étoiles',
    draw: (p) => {
      const out: string[] = [];
      for (let y = 22, row = 0; y < TAPE_H; y += 40, row++) {
        for (let x = row % 2 ? 44 : 20; x < TAPE_W; x += 48)
          out.push(fill(star(x, y, 10), p.motif));
      }
      return out;
    },
  },
  chevrons: {
    fr: 'chevrons zigzag',
    draw: (p) => {
      const out: string[] = [];
      for (let y = 12; y < TAPE_H + 10; y += 26) {
        let d = `M-10 ${y}`;
        for (let x = -10; x < TAPE_W + 20; x += 24) d += `L${x + 12} ${y - 10}L${x + 24} ${y}`;
        out.push(
          `<path d="${d}" fill="none" stroke="${p.motif}" stroke-width="5" stroke-linejoin="round"/>`,
        );
      }
      return out;
    },
  },
  fleurettes: {
    fr: 'fleurs fleurettes liberty',
    draw: (p) => {
      const out: string[] = [];
      const r = rng(11);
      for (let y = 18, row = 0; y < TAPE_H + 10; y += 30, row++) {
        for (let x = row % 2 ? 34 : 12; x < TAPE_W; x += 44) {
          const cx = x + r() * 6;
          const cy = y + r() * 4;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            out.push(fill(circle(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 4.5), p.motif));
          }
          out.push(fill(circle(cx, cy, 3), p.light));
        }
      }
      return out;
    },
  },
  grille: {
    fr: 'grille quadrillage',
    draw: (p) => {
      const out: string[] = [];
      for (let x = 10; x < TAPE_W; x += 20)
        out.push(`<path d="M${x} 0V${TAPE_H}" stroke="${p.motif}" stroke-width="2"/>`);
      for (let y = 10; y < TAPE_H; y += 20)
        out.push(`<path d="M0 ${y}H${TAPE_W}" stroke="${p.motif}" stroke-width="2"/>`);
      return out;
    },
  },
  uni: {
    fr: 'uni simple',
    draw: (p) => [
      `<path d="M0 10H${TAPE_W}M0 ${TAPE_H - 10}H${TAPE_W}" stroke="${p.light}" stroke-width="3" stroke-dasharray="10 7"/>`,
    ],
  },
};

{
  const motifNames = Object.keys(MOTIFS);
  motifNames.forEach((m, mi) => {
    // Each motif in four palettes, rotating, so the palettes are evenly used.
    for (let k = 0; k < 4; k++) {
      const p = PALETTES[(mi * 3 + k * 2) % PALETTES.length]!;
      const id = `washi-${m}-${p.id}`;
      const clip = `c-${id}`;
      add({
        id,
        viewBox: `0 0 ${TAPE_W} ${TAPE_H}`,
        kw: [
          'washi',
          'ruban',
          'adhésif',
          'scotch',
          'masking tape',
          ...MOTIFS[m]!.fr.split(' '),
          ...p.fr.split(' '),
        ],
        parts: () => {
          const outline = tapeOutline(mi * 10 + k + 1);
          return [
            `<defs><clipPath id="${clip}"><path d="${outline}"/></clipPath></defs>`,
            `<g clip-path="url(#${clip})" opacity="0.92">`,
            fill(outline, p.base),
            ...MOTIFS[m]!.draw(p),
            '</g>',
          ];
        },
      });
    }
  });
}

// ---------------------------------------------------------------- labels and tags

const LABEL_COLOURS = [
  { id: 'kraft', fr: 'kraft', fillc: '#d8b48a', edge: '#8a5a35' },
  { id: 'creme', fr: 'crème blanc', fillc: '#fbf3e2', edge: '#6b5a48' },
  { id: 'rose', fr: 'rose', fillc: '#f6c1cc', edge: '#b4405f' },
  { id: 'menthe', fr: 'menthe vert', fillc: '#bfe3d6', edge: '#2f7f74' },
  { id: 'moutarde', fr: 'moutarde jaune', fillc: '#f7d98b', edge: '#a4691a' },
  { id: 'bleu', fr: 'bleu', fillc: '#bcd5ef', edge: '#2f5f9e' },
];

/** A path for a hole (drawn with evenodd inside the shape). */
const hole = (x: number, y: number, r: number): string => circle(x, y, r);

const LABELS: {
  id: string;
  fr: string;
  view: string;
  draw: (c: (typeof LABEL_COLOURS)[number]) => string[];
}[] = [
  {
    id: 'bagage',
    fr: 'étiquette bagage valise tag',
    view: '0 0 420 230',
    draw: (c) => {
      const body = 'M70 30L400 30Q410 30 410 40L410 190Q410 200 400 200L70 200L14 140L14 90Z';
      return [
        ...stroke('M40 115C10 60 -10 30 20 10', 4, { stroke: INK, roughness: 1.2 }),
        `<path d="${body}${hole(58, 115, 12)}" fill="${c.fillc}" fill-rule="evenodd"/>`,
        `<path d="${tidy(circle(58, 115, 18))}${hole(58, 115, 12)}" fill="${c.edge}" fill-rule="evenodd"/>`,
        `<path d="M100 48L392 48L392 182L100 182Z" fill="none" stroke="${c.edge}" stroke-width="3" stroke-dasharray="9 7"/>`,
      ];
    },
  },
  {
    id: 'banderole',
    fr: 'banderole ruban bannière',
    view: '0 0 460 170',
    draw: (c) => [
      fill('M10 70L80 70L80 150L10 150L40 110Z', c.edge),
      fill('M450 70L380 70L380 150L450 150L420 110Z', c.edge),
      fill('M60 130L80 150L80 130Z', '#00000055'),
      fill('M400 130L380 150L380 130Z', '#00000055'),
      fill('M60 30L400 30L400 130L60 130Z', c.fillc),
      `<path d="M72 44H388M72 116H388" stroke="${c.edge}" stroke-width="3" stroke-dasharray="8 6"/>`,
    ],
  },
  {
    id: 'festonnee',
    fr: 'étiquette festonnée ronde badge',
    view: '0 0 320 320',
    draw: (c) => {
      const pts: string[] = [];
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 0.5) / n) * Math.PI * 2;
        const a2 = ((i + 1) / n) * Math.PI * 2;
        const p = (a: number, r: number): string =>
          `${(160 + Math.cos(a) * r).toFixed(1)} ${(160 + Math.sin(a) * r).toFixed(1)}`;
        pts.push(`${i === 0 ? 'M' + p(a0, 140) : ''}Q${p(a1, 162)} ${p(a2, 140)}`);
      }
      return [
        fill(pts.join('') + 'Z', c.fillc),
        `<circle cx="160" cy="160" r="112" fill="none" stroke="${c.edge}" stroke-width="3" stroke-dasharray="8 6"/>`,
      ];
    },
  },
  {
    id: 'ticket',
    fr: 'ticket billet entrée',
    view: '0 0 440 200',
    draw: (c) => [
      `<path d="M14 14H426V78A22 22 0 0 0 426 122V186H14V122A22 22 0 0 0 14 78Z" fill="${c.fillc}"/>`,
      `<path d="M330 22V178" stroke="${c.edge}" stroke-width="3" stroke-dasharray="7 7"/>`,
      `<path d="M34 34H310V166H34Z" fill="none" stroke="${c.edge}" stroke-width="3"/>`,
      fill(star(378, 100, 22), c.edge),
    ],
  },
  {
    id: 'note',
    fr: 'note post-it papier mémo',
    view: '0 0 320 330',
    draw: (c) => [
      `<g transform="rotate(-3 160 170)">`,
      fill('M30 50L292 44L296 306Q170 316 34 300Z', c.fillc),
      fill('M296 306Q170 316 34 300L40 292Q170 304 294 296Z', '#00000018'),
      '</g>',
      fill('M110 20L220 30L214 76L104 66Z', '#ffffffb0'),
    ],
  },
  {
    id: 'rectangle',
    fr: 'étiquette rectangle cadre',
    view: '0 0 440 180',
    draw: (c) => [
      `<path d="M40 10H400L430 40V140L400 170H40L10 140V40Z" fill="${c.fillc}"/>`,
      `<path d="M46 26H394L414 46V134L394 154H46L26 134V46Z" fill="none" stroke="${c.edge}" stroke-width="3"/>`,
    ],
  },
];

for (const l of LABELS) {
  for (const c of LABEL_COLOURS) {
    if (l.id === 'note' && c.id === 'kraft') continue;
    add({
      id: `etiquette-${l.id}-${c.id}`,
      viewBox: l.view,
      kw: ['étiquette', 'label', ...l.fr.split(' '), ...c.fr.split(' ')],
      parts: () => l.draw(c),
    });
  }
}

for (const d of [...ETIQUETTES, ...ETIQUETTES_PAPIER]) add(d);

// ---------------------------------------------------------------- travel stamps

const STAMP_INKS = [
  { id: 'rouge', fr: 'rouge', c: '#c23b2e' },
  { id: 'bleu', fr: 'bleu', c: '#2c5aa0' },
  { id: 'vert', fr: 'vert', c: '#2e7d5b' },
  { id: 'violet', fr: 'violet', c: '#6b3fa0' },
];

const ROUND_STAMPS: [string, string, string, 'star' | 'plane' | 'sun' | 'wave'][] = [
  ['bon-voyage', 'BON VOYAGE', 'PAR AVION', 'plane'],
  ['vacances', 'VACANCES', 'AU SOLEIL', 'sun'],
  ['souvenir', 'SOUVENIR', 'DE VOYAGE', 'star'],
  ['road-trip', 'ROAD TRIP', 'EN ROUTE', 'star'],
  ['tour-du-monde', 'TOUR DU MONDE', 'ÉVASION', 'plane'],
  ['bord-de-mer', 'BORD DE MER', 'ÉTÉ', 'wave'],
  ['aventure', 'AVENTURE', 'EXPLORATION', 'sun'],
  ['passeport', 'PASSEPORT', 'VISA', 'star'],
];

const PLANE =
  'M-34 4L-6 0L10 -26L18 -26L10 0L28 0L36 -10L42 -10L38 4L42 18L36 18L28 8L10 8L18 34L10 34L-6 8L-34 4Z';

function centreMark(kind: 'star' | 'plane' | 'sun' | 'wave', c: string): string[] {
  if (kind === 'plane')
    return [
      `<path transform="translate(160 160) rotate(-20) scale(1.3)" d="${PLANE}" fill="${c}"/>`,
    ];
  if (kind === 'sun') {
    const out = [fill(circle(160, 160, 22), c)];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push(
        `<path d="M${(160 + Math.cos(a) * 30).toFixed(1)} ${(160 + Math.sin(a) * 30).toFixed(1)}L${(160 + Math.cos(a) * 44).toFixed(1)} ${(160 + Math.sin(a) * 44).toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
      );
    }
    return out;
  }
  if (kind === 'wave') {
    return [0, 18, 36].map(
      (dy) =>
        `<path d="M112 ${142 + dy}q12 -12 24 0t24 0t24 0t24 0" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
    );
  }
  return [fill(star(160, 160, 36), c)];
}

for (const [id, top, bottom, mark] of ROUND_STAMPS) {
  const inkc = STAMP_INKS[(ROUND_STAMPS.findIndex((s) => s[0] === id) * 3) % STAMP_INKS.length]!;
  add({
    id: `tampon-${id}`,
    viewBox: '0 0 320 320',
    kw: [
      'tampon',
      'cachet',
      'voyage',
      inkc.fr,
      ...top.toLowerCase().split(' '),
      ...bottom.toLowerCase().split(' '),
    ],
    parts: () => {
      const f = font('oswald', 700);
      const size = top.length > 11 ? 26 : 30;
      return [
        `<g opacity="0.9">`,
        ...stroke(circle(160, 160, 146), 7, { stroke: inkc.c, roughness: 1.1 }),
        ...stroke(circle(160, 160, 132), 3, { stroke: inkc.c, roughness: 1.1 }),
        ...stroke(circle(160, 160, 82), 3, { stroke: inkc.c, roughness: 1.1 }),
        fill(textOnCircle(top, f, size, 160, 160, 96, 0, false, 2), inkc.c),
        fill(textOnCircle(bottom, f, 24, 160, 160, 118, 180, true, 2), inkc.c),
        fill(star(66, 168, 7), inkc.c),
        fill(star(254, 168, 7), inkc.c),
        ...centreMark(mark, inkc.c),
        '</g>',
      ];
    },
  });
}

const RECT_STAMPS: [string, string, string][] = [
  ['par-avion', 'PAR AVION', 'AIR MAIL'],
  ['depart', 'DÉPART', '— — / — — / — —'],
  ['arrivee', 'ARRIVÉE', '— — / — — / — —'],
  ['fragile', 'FRAGILE', 'SOUVENIRS'],
];

RECT_STAMPS.forEach(([id, big, small], i) => {
  const inkc = STAMP_INKS[i % STAMP_INKS.length]!;
  add({
    id: `tampon-${id}`,
    viewBox: '0 0 400 200',
    kw: ['tampon', 'cachet', inkc.fr, ...big.toLowerCase().split(' ')],
    parts: () => {
      const f = font('oswald', 700);
      return [
        `<g opacity="0.9" transform="rotate(-6 200 100)">`,
        ...stroke('M24 24L376 24L376 176L24 176Z', 7, { stroke: inkc.c, roughness: 1.1 }),
        ...stroke('M38 38L362 38L362 162L38 162Z', 3, { stroke: inkc.c, roughness: 1.1 }),
        fill(textPath(big, f, 62, 200, 112, 'middle', 4), inkc.c),
        fill(textPath(small, f, 22, 200, 146, 'middle', 3), inkc.c),
        '</g>',
      ];
    },
  });
});

// Postage stamps: a perforated edge around a small flat scene.
const POSTAGE: [string, string, (x: number, y: number) => string[]][] = [
  [
    'mer',
    'mer plage soleil',
    () => [
      fill('M60 60H260V300H60Z', '#bfe3f0'),
      fill(circle(200, 130, 30), '#f7c85c'),
      fill('M60 220Q110 200 160 220T260 220V300H60Z', '#3e8fbf'),
      fill('M60 250Q110 232 160 250T260 250V300H60Z', '#2c6d9a'),
      fill('M60 280H260V300H60Z', '#efdcb4'),
    ],
  ],
  [
    'montagne',
    'montagne neige',
    () => [
      fill('M60 60H260V300H60Z', '#d9ecf2'),
      fill('M60 300L140 150L190 230L215 190L260 260V300Z', '#5b7f95'),
      fill('M140 150L118 192L132 186L142 200L156 184L166 196Z', '#ffffff'),
      fill('M60 300H260V280Q160 262 60 284Z', '#7cae6b'),
    ],
  ],
  [
    'palmier',
    'palmier île tropical',
    () => [
      fill('M60 60H260V300H60Z', '#fbe0c4'),
      fill(circle(110, 120, 28), '#f39a6b'),
      fill('M60 260H260V300H60Z', '#3e9ab0'),
      fill('M190 262Q184 200 170 140L178 140Q194 200 200 262Z', '#7a5230'),
      ...[
        [-60, '#2f8a5b'],
        [-20, '#3fa56c'],
        [20, '#2f8a5b'],
        [60, '#3fa56c'],
        [-100, '#3fa56c'],
      ].map(
        ([a, c]) =>
          `<path transform="translate(174 140) rotate(${a})" d="M0 0C10 -20 30 -34 60 -34C40 -26 20 -14 0 0Z" fill="${c}"/>`,
      ),
    ],
  ],
  [
    'montgolfiere',
    'montgolfière ciel',
    () => [
      fill('M60 60H260V300H60Z', '#cfe6f7'),
      fill('M160 90C110 90 100 150 130 190L150 214H170L190 190C220 150 210 90 160 90Z', '#e8604c'),
      fill('M160 90C145 90 138 150 150 214H170C182 150 175 90 160 90Z', '#f7c85c'),
      fill('M148 224H172V244H148Z', '#7a5230'),
      fill('M70 250Q100 236 130 250Q160 236 190 250H70Z', '#ffffff'),
    ],
  ],
];

for (const [id, fr, scene] of POSTAGE) {
  add({
    id: `tampon-timbre-${id}`,
    viewBox: '0 0 320 360',
    kw: ['timbre', 'poste', 'lettre', ...fr.split(' ')],
    parts: () => {
      // Perforated edge: a white sheet whose border is a row of round bites.
      let d = 'M30 30';
      const step = 20;
      for (let x = 30; x < 290; x += step) d += `H${x + 4}a6 6 0 0 0 12 0`;
      d += 'H290';
      for (let y = 30; y < 330; y += step) d += `V${y + 4}a6 6 0 0 0 0 12`;
      d += 'V330';
      for (let x = 290; x > 30; x -= step) d += `H${x - 4}a6 6 0 0 0 -12 0`;
      d += 'H30';
      for (let y = 330; y > 30; y -= step) d += `V${y - 4}a6 6 0 0 0 0 -12`;
      d += 'Z';
      return [
        fill(d, '#fffdf8'),
        `<path d="${d}" fill="none" stroke="#d8cfc0" stroke-width="2"/>`,
        ...scene(0, 0),
        `<path d="M60 60H260V300H60Z" fill="none" stroke="#5a4a3a" stroke-width="2"/>`,
      ];
    },
  });
}

// ---------------------------------------------------------------- hand-drawn arrows

const ARROW_COLOURS = [
  { id: 'noir', fr: 'noir', c: INK },
  { id: 'corail', fr: 'corail orange', c: '#e0533f' },
  { id: 'bleu', fr: 'bleu', c: '#2f5f9e' },
];

/** An arrow head at the end of a polyline (last two points). */
function headAt(pts: [number, number][], size: number): string {
  const [x2, y2] = pts[pts.length - 1]!;
  const [x1, y1] = pts[pts.length - 2]!;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (da: number): string =>
    `${(x2 - Math.cos(a + da) * size).toFixed(1)} ${(y2 - Math.sin(a + da) * size).toFixed(1)}`;
  return `M${p(0.5)}L${x2} ${y2}L${p(-0.5)}`;
}

const ARROWS: [string, string, string, [number, number][], boolean?][] = [
  [
    'courbe',
    'courbe',
    '0 0 400 260',
    [
      [30, 220],
      [110, 120],
      [230, 80],
      [360, 110],
    ],
  ],
  [
    'boucle',
    'boucle',
    '0 0 420 260',
    [
      [20, 200],
      [120, 190],
      [200, 120],
      [170, 60],
      [120, 90],
      [160, 160],
      [260, 190],
      [390, 140],
    ],
  ],
  [
    'vague',
    'vague ondulée',
    '0 0 420 200',
    [
      [20, 120],
      [80, 70],
      [140, 130],
      [200, 70],
      [260, 130],
      [320, 80],
      [390, 100],
    ],
  ],
  [
    'spirale',
    'spirale',
    '0 0 400 300',
    [
      [200, 150],
      [220, 140],
      [225, 165],
      [195, 180],
      [170, 150],
      [195, 115],
      [245, 120],
      [265, 170],
      [230, 215],
      [170, 210],
      [140, 160],
      [160, 100],
      [250, 70],
      [370, 110],
    ],
  ],
  [
    'coudee',
    'coudée angle',
    '0 0 320 320',
    [
      [40, 40],
      [50, 160],
      [80, 260],
      [160, 270],
      [280, 260],
    ],
  ],
  [
    'pointillee',
    'pointillés chemin',
    '0 0 420 260',
    [
      [20, 230],
      [90, 140],
      [200, 180],
      [280, 90],
      [390, 40],
    ],
    true,
  ],
  [
    'zigzag',
    'zigzag',
    '0 0 420 200',
    [
      [20, 160],
      [100, 60],
      [170, 150],
      [250, 50],
      [320, 140],
      [400, 60],
    ],
  ],
  [
    'double-courbe',
    'double',
    '0 0 400 200',
    [
      [30, 150],
      [120, 60],
      [280, 60],
      [370, 150],
    ],
  ],
];

ARROWS.forEach(([id, fr, view, pts, dashed], i) => {
  const cols = i < 4 ? ARROW_COLOURS : ARROW_COLOURS.slice(0, 2);
  for (const col of cols) {
    add({
      id: `fleche-${id}-${col.id}`,
      viewBox: view,
      kw: ['flèche', 'dessinée', 'main', ...fr.split(' '), ...col.fr.split(' ')],
      parts: () => {
        const d = smoothOpen(pts);
        const out = dashed
          ? [
              `<path d="${d}" fill="none" stroke="${col.c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="4 18"/>`,
            ]
          : stroke(d, 7, { stroke: col.c, roughness: 0.9, bowing: 1 });
        out.push(...stroke(headAt(pts, 34), 7, { stroke: col.c }));
        if (id === 'double-courbe')
          out.push(...stroke(headAt([pts[1]!, pts[0]!], 34), 7, { stroke: col.c }));
        if (dashed) out.push(fill(circle(pts[0]![0], pts[0]![1], 9), col.c));
        return out;
      },
    });
  }
});

// The travel classic: a dashed flight path ending with a plane.
for (const col of ARROW_COLOURS) {
  add({
    id: `fleche-avion-${col.id}`,
    viewBox: '0 0 440 260',
    kw: ['avion', 'trajet', 'vol', 'voyage', 'pointillés', 'chemin', ...col.fr.split(' ')],
    parts: () => [
      `<path d="${smoothOpen([
        [20, 230],
        [80, 160],
        [60, 110],
        [110, 100],
        [140, 150],
        [240, 150],
        [340, 80],
      ])}" fill="none" stroke="${col.c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="14 12"/>`,
      `<path transform="translate(380 60) rotate(-32) scale(1.15)" d="${PLANE}" fill="${col.c}"/>`,
    ],
  });
}

// ---------------------------------------------------------------- speech bubbles

const BUBBLE_FILLS = [
  { id: 'blanc', fr: 'blanc', c: PAPER },
  { id: 'jaune', fr: 'jaune', c: '#f9e08b' },
  { id: 'rose', fr: 'rose', c: '#f8c6d0' },
];

const BUBBLES: [string, string, string, string][] = [
  [
    'ronde',
    'ronde parole',
    '0 0 400 320',
    'M200 30C300 30 370 80 370 150C370 220 300 268 200 268C180 268 160 266 142 262L80 300L96 246C56 224 30 190 30 150C30 80 100 30 200 30Z',
  ],
  [
    'rectangle',
    'rectangle dialogue',
    '0 0 420 300',
    'M40 30L380 30Q394 30 394 44L394 200Q394 214 380 214L170 214L110 276L118 214L40 214Q26 214 26 200L26 44Q26 30 40 30Z',
  ],
  [
    'nuage',
    'nuage pensée',
    '0 0 420 320',
    'M120 80C130 40 190 30 220 60C250 26 320 40 320 90C370 90 390 150 350 180C370 230 300 260 260 230C230 270 160 260 150 226C100 240 50 200 76 160C36 140 60 80 120 80Z',
  ],
  [
    'cri',
    'cri explosion boum',
    '0 0 400 340',
    'M200 20L232 92L300 50L290 128L380 130L310 180L370 250L280 236L270 320L210 260L150 320L140 240L50 270L100 196L20 150L104 130L80 50L160 96Z',
  ],
];

for (const [id, fr, view, d] of BUBBLES) {
  for (const f of BUBBLE_FILLS) {
    add({
      id: `bulle-${id}-${f.id}`,
      viewBox: view,
      kw: ['bulle', 'bd', ...fr.split(' '), f.fr],
      parts: () => {
        const out = ink(d, { w: 8, fill: f.c });
        if (id === 'nuage')
          out.push(
            ...ink(circle(84, 262, 18), { w: 6, fill: f.c }),
            ...ink(circle(50, 296, 10), { w: 5, fill: f.c }),
          );
        return out;
      },
    });
  }
}

// ---------------------------------------------------------------- frames, corners, doodles

const CORNER_COLOURS = [
  { id: 'noir', fr: 'noir', c: '#222222' },
  { id: 'kraft', fr: 'kraft', c: '#c79a68' },
  { id: 'blanc', fr: 'blanc', c: '#f4efe6' },
  { id: 'or', fr: 'doré or', c: '#c9a347' },
];

for (const col of CORNER_COLOURS) {
  add({
    id: `cadre-coin-photo-${col.id}`,
    viewBox: '0 0 200 200',
    kw: ['coin', 'photo', 'angle', 'album', ...col.fr.split(' ')],
    parts: () => [
      fill('M10 10L190 10L10 190Z', col.c),
      fill('M10 10L190 10L176 24L24 24L24 176L10 190Z', '#00000022'),
    ],
  });
}

const DOODLES: [string, string, string, () => string[]][] = [
  [
    'cercle-gribouille',
    'cercle entourer gribouillis',
    '0 0 400 300',
    () =>
      stroke(
        smoothOpen([
          [60, 160],
          [100, 60],
          [240, 40],
          [350, 110],
          [330, 230],
          [180, 260],
          [60, 210],
          [70, 110],
          [170, 50],
        ]),
        6,
        { roughness: 1.2 },
      ),
  ],
  [
    'souligne-vague',
    'souligné vague trait',
    '0 0 420 100',
    () =>
      stroke(
        smoothOpen([
          [20, 60],
          [80, 40],
          [140, 62],
          [200, 40],
          [260, 62],
          [320, 40],
          [400, 56],
        ]),
        7,
      ),
  ],
  [
    'souligne-double',
    'souligné double trait',
    '0 0 420 100',
    () => [...stroke('M20 40Q210 28 400 44', 7), ...stroke('M50 70Q220 60 380 72', 5)],
  ],
  [
    'crochets',
    'crochets accolades encadrer',
    '0 0 420 220',
    () => [
      ...stroke('M60 20Q20 20 20 60V160Q20 200 60 200', 8),
      ...stroke('M360 20Q400 20 400 60V160Q400 200 360 200', 8),
    ],
  ],
  [
    'rectangle',
    'cadre rectangle encadré',
    '0 0 400 300',
    () => stroke('M20 24L380 18L384 280L16 284Z', 7, { roughness: 1.3, disableMultiStroke: false }),
  ],
  [
    'rond',
    'cadre rond cercle',
    '0 0 320 320',
    () => stroke(circle(160, 160, 140), 7, { roughness: 1.3, disableMultiStroke: false }),
  ],
  [
    'couronne-laurier',
    'couronne laurier lauriers',
    '0 0 360 340',
    () => {
      // Two branches along a circle, from the bottom up to the upper sides, leaves in pairs.
      const cx = 180;
      const cy = 170;
      const R = 140;
      const at = (deg: number, r = R): [number, number] => {
        const a = (deg * Math.PI) / 180;
        return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
      };
      const out: string[] = [];
      for (const side of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let deg = 172; deg >= 52; deg -= 15) pts.push(at(side === 1 ? deg : 360 - deg));
        out.push(...stroke(smoothOpen(pts), 4));
        for (let deg = 160; deg >= 58; deg -= 17) {
          const d = side === 1 ? deg : 360 - deg;
          for (const off of [-1, 1]) {
            const [x, y] = at(d, R + off * 13);
            const tangent = side === 1 ? d - 90 : d + 90;
            const rot = tangent - 90 + off * side * 28;
            out.push(
              `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="21" ry="8" transform="rotate(${rot.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="#5c7d4c"/>`,
            );
          }
        }
      }
      return out;
    },
  ],
  [
    'separateur-points',
    'séparateur ligne points',
    '0 0 420 60',
    () => [
      ...stroke('M20 30H170', 4),
      fill(circle(190, 30, 6), INK),
      fill(heart(210, 31, 10), '#e0533f'),
      fill(circle(230, 30, 6), INK),
      ...stroke('M250 30H400', 4),
    ],
  ],
];

for (const [id, fr, view, draw] of DOODLES) {
  add({ id: `cadre-${id}`, viewBox: view, kw: ['dessin', 'main', ...fr.split(' ')], parts: draw });
}

// ---------------------------------------------------------------- confetti

const CONFETTI_SETS: [string, string, string[]][] = [
  ['etincelles-noires', 'étincelles noir', [INK]],
  ['etincelles-dorees', 'étincelles doré or', ['#d4a62a', '#f0c75e']],
  ['etoiles-pastel', 'étoiles pastel', ['#f6a5b8', '#8fcfc1', '#f7d27a', '#a9b9ea']],
  ['coeurs-rouges', 'coeurs rouge amour', ['#e2523f', '#f28b82']],
  [
    'points-couleurs',
    'points ronds couleurs',
    ['#e0533f', '#2f8f84', '#f2b84b', '#2f5f9e', '#e0587a'],
  ],
  ['fete', 'fête confettis serpentins', ['#e0533f', '#2f8f84', '#f2b84b', '#6a50a8']],
];

CONFETTI_SETS.forEach(([id, fr, colours], i) => {
  add({
    id: `confettis-${id}`,
    viewBox: '0 0 360 300',
    kw: ['confettis', 'décoration', ...fr.split(' ')],
    parts: () => {
      const r = rng(100 + i);
      const out: string[] = [];
      for (let k = 0; k < 16; k++) {
        const x = 30 + r() * 300;
        const y = 30 + r() * 240;
        const c = colours[k % colours.length]!;
        const s = 8 + r() * 18;
        if (id.startsWith('etincelles')) out.push(fill(sparkle(x, y, s), c));
        else if (id.startsWith('etoiles')) out.push(fill(star(x, y, s * 0.9), c));
        else if (id.startsWith('coeurs')) out.push(fill(heart(x, y, s * 0.8), c));
        else if (id.startsWith('points')) out.push(fill(circle(x, y, s * 0.45), c));
        else if (k % 3 === 0)
          out.push(
            `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q10 -14 20 0t20 0" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
          );
        else
          out.push(
            `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(s * 0.5).toFixed(0)}" height="${(s * 0.9).toFixed(0)}" transform="rotate(${(r() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${c}"/>`,
          );
      }
      return out;
    },
  });
});

// ---------------------------------------------------------------- hand lettering

const LETTERING: [
  string,
  string,
  string,
  number,
  string,
  'swash' | 'sparkle' | 'heart' | 'none',
][] = [
  ['bon-voyage', 'Bon voyage', 'pacifico', 400, INK, 'swash'],
  ['vacances', 'Vacances', 'pacifico', 400, '#e0533f', 'sparkle'],
  ['souvenirs', 'Souvenirs', 'dancing-script', 700, INK, 'swash'],
  ['ete', 'Été', 'pacifico', 400, '#e0533f', 'sparkle'],
  ['hello', 'Hello', 'satisfy', 400, INK, 'heart'],
  ['bonjour', 'Bonjour', 'lobster', 400, '#2f5f9e', 'swash'],
  ['en-route', 'En route !', 'caveat', 700, INK, 'none'],
  ['road-trip', 'Road trip', 'pacifico', 400, '#2f8f84', 'swash'],
  ['aventure', 'Aventure', 'amatic-sc', 700, INK, 'sparkle'],
  ['carnet-de-voyage', 'Carnet de voyage', 'dancing-script', 700, '#7d4f2c', 'swash'],
  ['la-mer', 'La mer', 'pacifico', 400, '#2f5f9e', 'none'],
  ['au-soleil', 'Au soleil', 'satisfy', 400, '#c07f1f', 'sparkle'],
  ['liberte', 'Liberté', 'shadows-into-light', 400, INK, 'swash'],
  ['dolce-vita', 'Dolce vita', 'lobster', 400, '#e0533f', 'none'],
  ['wanderlust', 'Wanderlust', 'satisfy', 400, INK, 'sparkle'],
  ['summer', 'Summer', 'pacifico', 400, '#e0587a', 'sparkle'],
  ['holidays', 'Holidays', 'dancing-script', 700, '#2f8f84', 'swash'],
  ['love', 'Love', 'pacifico', 400, '#e2523f', 'heart'],
  ['bisous', 'Bisous', 'satisfy', 400, '#e0587a', 'heart'],
  ['merci', 'Merci', 'dancing-script', 700, INK, 'heart'],
  ['bonheur', 'Bonheur', 'pacifico', 400, '#c07f1f', 'sparkle'],
  ['famille', 'Famille', 'dancing-script', 700, INK, 'heart'],
  ['entre-amis', 'Entre amis', 'caveat', 700, '#2f5f9e', 'heart'],
  ['joyeux-anniversaire', 'Joyeux anniversaire', 'dancing-script', 700, '#e0533f', 'sparkle'],
  ['best-day-ever', 'Best day ever', 'caveat', 700, INK, 'sparkle'],
  ['so-good', 'Trop bien !', 'caveat', 700, '#e0533f', 'none'],
  ['wow', 'WOW', 'lilita-one', 400, '#f2b84b', 'sparkle'],
  ['miam', 'Miam !', 'lilita-one', 400, '#e0533f', 'none'],
  ['top', 'TOP', 'lilita-one', 400, '#2f8f84', 'sparkle'],
  ['coucou', 'Coucou', 'indie-flower', 400, INK, 'heart'],
  ['la-belle-vie', 'La belle vie', 'satisfy', 400, INK, 'swash'],
  ['jour-1', 'Jour 1', 'caveat', 700, INK, 'none'],
  ['jour-2', 'Jour 2', 'caveat', 700, INK, 'none'],
  ['jour-3', 'Jour 3', 'caveat', 700, INK, 'none'],
  ['the-end', 'Fin', 'pacifico', 400, INK, 'swash'],
];

for (const [id, text, family, weight, colour, extra] of LETTERING) {
  add({
    id: `lettrage-${id}`,
    viewBox: '0 0 0 0',
    kw: ['lettrage', 'texte', 'mot', 'titre', ...text.toLowerCase().replace(/[!]/g, '').split(' ')],
    parts: () => [],
  });
  const last = DRAWINGS_[DRAWINGS_.length - 1]!;
  const f = font(family, weight);
  const size = 110;
  const w = textWidth(text, f, size);
  const W = Math.ceil(w + 80);
  const H = extra === 'swash' ? 190 : 170;
  last.viewBox = `0 0 ${W} ${H}`;
  last.parts = () => {
    const out = [fill(textPath(text, f, size, W / 2, 115), colour)];
    if (extra === 'swash')
      out.push(
        ...stroke(
          smoothOpen([
            [W * 0.12, 158],
            [W * 0.5, 146],
            [W * 0.88, 152],
            [W * 0.7, 166],
          ]),
          5,
          { stroke: colour },
        ),
      );
    if (extra === 'sparkle')
      out.push(
        fill(sparkle(W - 26, 34, 18), colour),
        fill(sparkle(W - 52, 64, 9), colour),
        fill(sparkle(24, 140, 10), colour),
      );
    if (extra === 'heart') out.push(fill(heart(W - 26, 36, 16), '#e2523f'));
    return out;
  };
}

export const DRAWINGS: Drawing[] = DRAWINGS_;
