/**
 * Déco labels drawn by hand ("griffonnées"): a pastel shape with a bold rough ink outline, a
 * hatched shadow offset to the lower right, and a small accent (a sparkle, an inner line, a
 * stitch). The first two shapes (`griffonnee`, `griffonnee-ronde`) live in `deco-etiquettes.ts`;
 * these extend the family to other shapes. They stay blank: the text is a separate text block.
 * Each shape is crossed with a few palettes picked for it. See `docs/design/stickers-style.md`.
 */
import {
  type Drawing,
  INK,
  circle,
  fill,
  hatch,
  heart,
  ink,
  smoothOpen,
  sparkle,
  stroke,
  tidy,
} from './core.ts';
import {
  PAL,
  type Pal,
  type Pt,
  ellipse,
  poly,
  r1,
  rrect,
  scallopCircle,
} from './deco-etiquettes.ts';

// ---------------------------------------------------------------- recipe

/** The hatched shadow of `d`, moved by (dx, dy). */
const shade = (d: string, dx = 18, dy = 18): string[] => [
  `<g transform="translate(${dx} ${dy})">`,
  ...hatch(d, { gap: 8, angle: -50, w: 2 }),
  '</g>',
];

/** The label itself: the shape filled with the palette, a bold rough ink line around it. */
const body = (d: string, c: Pal, w = 6): string[] => ink(d, { w, fill: c.f });

/** A thin rough line in the palette's border colour, inside the shape. */
const inner = (d: string, c: Pal, w = 2.5): string[] =>
  stroke(d, w, { stroke: c.e, roughness: 1.1, bowing: 1 });

/** A stitched (dashed) line in the palette's border colour. */
const stitch = (d: string, c: Pal, w = 3, dash = '10 8'): string =>
  `<path d="${tidy(d)}" fill="none" stroke="${c.e}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A sparkle and a dot, the family's mark. */
const spark = (x: number, y: number, s = 15): string[] => [
  fill(sparkle(x, y, s), INK),
  fill(circle(x + s * 1.6, y + s * 2.2, s * 0.32), INK),
];

// ---------------------------------------------------------------- geometry

/** A cloud: `n` round bumps on an ellipse, clockwise from the top. */
function cloud(cx: number, cy: number, rx: number, ry: number, n: number, bulge = 0.62): string {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % n]!;
    const r = r1(Math.hypot(x1 - x0, y1 - y0) * bulge);
    d += `A${r} ${r} 0 0 1 ${r1(x1)} ${r1(y1)}`;
  }
  return d + 'Z';
}

/** A rounded rectangle with a speech tail from its bottom edge to (tx, ty). */
function bubble(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  tail: [number, number, number, number],
): string {
  const [ax, bx, tx, ty] = tail;
  const x1 = x + w;
  const y1 = y + h;
  return (
    `M${x + r} ${y}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}` +
    `H${bx}L${tx} ${ty}L${ax} ${y1}H${x + r}A${r} ${r} 0 0 1 ${x} ${y1 - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

// ---------------------------------------------------------------- shapes

interface Shape {
  id: string;
  fr: string;
  view: string;
  pals: string[];
  draw: (c: Pal) => string[];
}

const OVALE = ellipse(206, 132, 186, 108);
const BULLE = bubble(24, 24, 392, 196, 38, [96, 150, 70, 282]);
const NUAGE = cloud(214, 146, 172, 98, 9);
const PENSEE = `${cloud(232, 128, 172, 92, 10)}${circle(86, 266, 22)}${circle(48, 310, 12)}`;
const COEUR = heart(176, 176, 150);
const FESTON = scallopCircle(164, 164, 130, 16, 9);
const TICKET = 'M24 24H424V88A24 24 0 0 0 424 136V200H24V136A24 24 0 0 0 24 88Z';
const BAGAGE = 'M96 34H450V214H96L30 168V80Z';
const BANDE = 'M74 30H426V158H74Z';
const QUEUE_G = poly([
  [20, 86],
  [112, 86],
  [112, 200],
  [20, 200],
  [54, 143],
]);
const QUEUE_D = poly([
  [480, 86],
  [388, 86],
  [388, 200],
  [480, 200],
  [446, 143],
]);
const FLECHE = poly([
  [24, 40],
  [356, 40],
  [452, 124],
  [356, 208],
  [24, 208],
  [64, 124],
]);
const CARNET = 'M30 56H366V320H30Z';
const ARCHE = 'M30 376V166A134 134 0 0 1 298 166V376Z';
const ARRONDI = rrect(24, 24, 404, 168, 44);

const SHAPES: Shape[] = [
  {
    id: 'ovale',
    fr: 'ovale ellipse',
    view: '0 0 430 280',
    pals: ['framboise', 'citron', 'turquoise', 'sable'],
    draw: (c) => [
      ...shade(OVALE),
      ...body(OVALE, c),
      ...inner(ellipse(206, 132, 162, 86), c),
      ...spark(366, 34),
    ],
  },
  {
    id: 'bulle',
    fr: 'bulle dialogue parole bd',
    view: '0 0 440 300',
    pals: ['ciel', 'rose', 'citron', 'menthe'],
    draw: (c) => [...shade(BULLE), ...body(BULLE, c), ...spark(398, 22)],
  },
  {
    id: 'pensee',
    fr: 'bulle pensée nuage rêve',
    view: '0 0 440 340',
    pals: ['lavande', 'ciel', 'peche', 'pistache'],
    draw: (c) => [...shade(PENSEE, 16, 16), ...body(PENSEE, c), ...spark(388, 28, 14)],
  },
  {
    id: 'nuage',
    fr: 'nuage ciel',
    view: '0 0 430 290',
    pals: ['ciel', 'turquoise', 'rose', 'sable'],
    draw: (c) => [...shade(NUAGE, 16, 16), ...body(NUAGE, c), ...spark(388, 30, 14)],
  },
  {
    id: 'coeur',
    fr: 'cœur coeur amour',
    view: '0 0 360 340',
    pals: ['framboise', 'corail', 'rose', 'peche'],
    draw: (c) => [
      ...shade(COEUR, 16, 16),
      ...body(COEUR, c),
      ...inner(heart(176, 184, 118), c),
      ...spark(320, 34, 14),
    ],
  },
  {
    id: 'festonnee',
    fr: 'festonnée ronde rosette badge',
    view: '0 0 340 340',
    pals: ['moutarde', 'menthe', 'framboise', 'ciel'],
    draw: (c) => [
      ...shade(FESTON, 14, 14),
      ...body(FESTON, c, 5),
      ...inner(circle(164, 164, 104), c),
      ...spark(300, 22, 13),
    ],
  },
  {
    id: 'ticket',
    fr: 'ticket billet entrée',
    view: '0 0 450 225',
    pals: ['citron', 'corail', 'turquoise', 'kraft'],
    draw: (c) => [
      ...shade(TICKET, 14, 16),
      ...body(TICKET, c),
      stitch('M340 36V188', c, 3, '9 9'),
      fill(sparkle(376, 112, 16), INK),
    ],
  },
  {
    id: 'bagage',
    fr: 'bagage valise étiquette ficelle',
    view: '0 0 470 240',
    pals: ['kraft', 'sable', 'pistache', 'ciel'],
    draw: (c) => [
      ...shade(BAGAGE, 14, 16),
      ...body(BAGAGE, c),
      ...ink(circle(84, 124, 22), { w: 4, fill: c.l }),
      fill(circle(84, 124, 9), INK),
      ...stroke(
        smoothOpen([
          [84, 124],
          [60, 80],
          [24, 58],
          [16, 24],
          [44, 10],
        ]),
        4,
        { roughness: 1.2 },
      ),
      ...spark(424, 22, 13),
    ],
  },
  {
    id: 'banderole',
    fr: 'banderole ruban bannière',
    view: '0 0 500 220',
    pals: ['rose', 'turquoise', 'moutarde', 'lavande'],
    draw: (c) => [
      ...ink(QUEUE_G, { w: 5, fill: c.l }),
      ...ink(QUEUE_D, { w: 5, fill: c.l }),
      ...ink('M74 158L112 158L112 200Z', { w: 4, fill: c.e }),
      ...ink('M426 158L388 158L388 200Z', { w: 4, fill: c.e }),
      ...shade(BANDE, 12, 12),
      ...body(BANDE, c),
      ...inner('M96 50H404', c),
      ...inner('M96 138H404', c),
    ],
  },
  {
    id: 'fleche',
    fr: 'flèche panneau direction',
    view: '0 0 480 240',
    pals: ['peche', 'menthe', 'citron', 'framboise'],
    draw: (c) => [
      ...shade(FLECHE, 14, 16),
      ...body(FLECHE, c),
      fill(circle(108, 124, 8), INK),
      ...spark(384, 18, 13),
    ],
  },
  {
    id: 'carnet',
    fr: 'carnet bloc-notes spirale page',
    view: '0 0 400 345',
    pals: ['creme', 'citron', 'ciel', 'rose'],
    draw: (c) => {
      const out = [...shade(CARNET, 14, 16), ...body(CARNET, c)];
      for (let x = 72; x <= 330; x += 43) {
        out.push(fill(circle(x, 80, 7), INK));
        out.push(
          ...stroke(
            `M${x} 80C${x - 18} 60 ${x - 14} 24 ${x + 4} 24C${x + 16} 24 ${x + 12} 40 ${x + 10} 52`,
            4,
          ),
        );
      }
      return out;
    },
  },
  {
    id: 'arche',
    fr: 'arche fenêtre porte arcade',
    view: '0 0 330 400',
    pals: ['peche', 'sauge', 'lavande', 'turquoise'],
    draw: (c) => [
      ...shade(ARCHE, 14, 14),
      ...body(ARCHE, c),
      ...inner('M52 358V170A112 112 0 0 1 276 170V358', c),
      ...spark(290, 24, 14),
    ],
  },
  {
    id: 'arrondie',
    fr: 'arrondie rectangle couture cousue',
    view: '0 0 450 215',
    pals: ['framboise', 'pistache', 'ciel', 'moutarde'],
    draw: (c) => [
      ...shade(ARRONDI, 14, 14),
      ...body(ARRONDI, c),
      stitch(rrect(44, 44, 364, 128, 28), c),
      ...spark(408, 14, 13),
    ],
  },
];

export const ETIQUETTES_GRIFFONNEES: Drawing[] = SHAPES.flatMap((s) =>
  s.pals.map((p) => {
    const c = PAL[p]!;
    return {
      id: `etiquette-griffonnee-${s.id}-${c.id}`,
      viewBox: s.view,
      kw: [
        'étiquette',
        'label',
        'griffonnée',
        'dessinée',
        'croquis',
        'main',
        ...s.fr.split(' '),
        ...c.fr.split(' '),
      ],
      parts: () => s.draw(c),
    };
  }),
);
