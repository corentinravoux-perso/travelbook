/** Bohème, "Ligne et couleur": thin black line art over a soft colour blob, dots, sparkles. */
import { type Drawing, INK, blob, circle, fill, heart, smoothClosed, smoothOpen, sparkle } from './core.ts';
import { P, line, petal, roundPetal } from './boheme-kit.ts';

type Pt = [number, number];

/** Main line width of the set. */
const W = 3.6;
const L = (d: string, w = W): string[] => line(d, w);
const g = (parts: string[], transform: string): string => `<g transform="${transform}">${parts.join('')}</g>`;
const bg = (cx: number, cy: number, rx: number, ry: number, seed: number, colour: string): string =>
  fill(blob(cx, cy, rx, ry, seed), colour);
/** Filled sparkles `[x, y, size]`. */
const sparks = (list: [number, number, number][]): string[] => list.map(([x, y, s]) => fill(sparkle(x, y, s), INK));
/** Filled dots `[x, y, r]`. */
const dots = (list: [number, number, number][]): string[] => list.map(([x, y, r]) => fill(circle(x, y, r), INK));

/** Mirror an absolute path (M L Q C S T commands, x y pairs) about x = w / 2. */
function mx(d: string, w = 400): string {
  let i = 0;
  return d.replace(/[MLQCSTZ]|-?\d+(?:\.\d+)?/g, (tok) => {
    if (/[A-Z]/.test(tok)) {
      i = 0;
      return tok;
    }
    const out = i % 2 === 0 ? String(Math.round((w - Number(tok)) * 10) / 10) : tok;
    i++;
    return out;
  });
}

/** A leaf outline from (0, 0) to (l, 0), with or without its midrib, placed at (x, y) turned `deg`. */
function leafLine(x: number, y: number, l: number, deg: number, k = 0.3, rib = true, w = 2.8): string {
  const d = `M0 0C${l * 0.3} ${-l * k} ${l * 0.75} ${-l * k} ${l} 0C${l * 0.75} ${l * k} ${l * 0.3} ${l * k} 0 0Z`;
  return g([...L(d, w), ...(rib ? L(`M0 0L${(l * 0.8).toFixed(1)} 0`, 1.8) : [])], `translate(${x} ${y}) rotate(${deg})`);
}

/** Point and tangent angle (degrees) on a quadratic Bézier. */
function quad(p0: Pt, p1: Pt, p2: Pt, t: number): { p: Pt; deg: number } {
  const u = 1 - t;
  const p: Pt = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return { p: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10], deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}
const qPath = (p0: Pt, p1: Pt, p2: Pt): string => `M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;

/** A branch along a quadratic curve with leaves on both sides. */
function branch(p0: Pt, p1: Pt, p2: Pt, n: number, l0: number, opts: { k?: number; spread?: number; shrink?: number; rib?: boolean } = {}): string[] {
  const out = [...L(qPath(p0, p1, p2), 3)];
  const spread = opts.spread ?? 50;
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (0.86 * i) / Math.max(1, n - 1);
    const { p, deg } = quad(p0, p1, p2, t);
    const l = l0 * (1 - t * (opts.shrink ?? 0.5));
    const side = i % 2 === 0 ? -1 : 1;
    out.push(leafLine(p[0], p[1], l, deg + side * spread, opts.k ?? 0.28, opts.rib ?? true));
  }
  const tip = quad(p0, p1, p2, 1);
  out.push(leafLine(tip.p[0], tip.p[1], l0 * (1 - (opts.shrink ?? 0.5)) * 0.9, tip.deg, opts.k ?? 0.28, opts.rib ?? true));
  return out;
}

/** Points on a circle. */
const onCircle = (cx: number, cy: number, r: number, deg: number): Pt => [
  Math.round((cx + Math.cos((deg * Math.PI) / 180) * r) * 10) / 10,
  Math.round((cy + Math.sin((deg * Math.PI) / 180) * r) * 10) / 10,
];

export const LIGNE: Drawing[] = [
  {
    id: 'ligne-bouteille-coupe',
    viewBox: '0 0 400 420',
    kw: ['bouteille', 'vin', 'champagne', 'coupe', 'verre', 'apéro', 'fête'],
    parts: () => [
      fill(blob(200, 220, 120, 130, 7), P.peach),
      // Bottle
      ...L('M86 400L86 214Q86 176 112 160L116 92L140 92L144 160Q170 176 170 214L170 400Z'),
      ...L('M112 108L144 108', 3),
      ...L('M98 260L158 260L158 330L98 330Z', 2.6),
      // Coupe
      ...L('M190 228Q186 290 246 296Q306 290 302 228Z'),
      ...L('M246 296L246 384M206 392Q246 378 286 392'),
      ...L('M196 252Q246 262 298 252', 2.4),
      // Branch
      ...branch([300, 404], [326, 350], [360, 292], 4, 34, { k: 0.3, spread: 55, rib: false }),
      ...sparks([[276, 120, 18], [312, 162, 9], [228, 96, 7]]),
      ...dots([[250, 140, 3.5], [296, 96, 3]]),
    ],
  },
  {
    id: 'ligne-soleil-lune',
    viewBox: '0 0 400 400',
    kw: ['soleil', 'lune', 'nuit', 'ciel', 'étoile', 'bohème', 'fleur'],
    parts: () => {
      const petals: string[] = [];
      for (let i = 0; i < 10; i++) {
        const long = i % 2 === 0;
        petals.push(g(L(petal(long ? 128 : 88, long ? 0.15 : 0.2), 3), `translate(222 160) rotate(${i * 36 + 8})`));
      }
      return [
        bg(262, 150, 112, 104, 3, P.mustard),
        ...petals,
        ...L(circle(222, 160, 11), 3),
        g([fill('M118 250C88 286 104 346 156 360C120 372 74 346 72 300C70 272 90 252 118 250Z', INK)], 'translate(-14 10)'),
        ...sparks([[340, 300, 15], [70, 110, 11], [350, 58, 8], [230, 352, 9]]),
        ...dots([[292, 340, 3.5], [120, 52, 3], [44, 200, 3]]),
      ];
    },
  },
  {
    id: 'ligne-rose',
    viewBox: '0 0 400 420',
    kw: ['rose', 'fleur', 'amour', 'romantique'],
    parts: () => {
      const spiral: Pt[] = [];
      for (let t = 0; t <= 2.6; t += 0.12) {
        const r = 5 + 15 * t;
        const a = t * Math.PI * 2;
        spiral.push([200 + Math.cos(a) * r, 130 + Math.sin(a) * r * 0.82]);
      }
      return [
        bg(210, 170, 120, 120, 11, P.peach),
        ...L(smoothOpen(spiral.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt))),
        ...L('M142 120Q134 196 200 206Q266 196 258 120'),
        ...L('M152 176Q200 196 248 176', 3),
        ...L('M170 204L160 222M230 204L240 222M200 206L200 226', 2.8),
        ...L(smoothOpen([[200, 210], [196, 290], [204, 400]])),
        leafLine(198, 280, 74, -32, 0.32),
        leafLine(202, 330, 66, 205, 0.32),
        ...sparks([[300, 80, 12], [110, 300, 9]]),
        ...dots([[320, 130, 3.5], [92, 90, 3]]),
      ];
    },
  },
  {
    id: 'ligne-pivoine',
    viewBox: '0 0 400 400',
    kw: ['pivoine', 'fleur', 'printemps', 'romantique'],
    parts: () => [
      bg(190, 180, 130, 118, 21, P.apricot),
      ...L('M165 118Q172 80 200 96Q228 80 235 118'),
      ...L('M172 150Q180 112 200 138Q220 112 228 150'),
      ...L('M150 172Q200 214 250 172'),
      ...L('M150 172Q106 150 126 108Q152 98 170 128'),
      ...L(mx('M150 172Q106 150 126 108Q152 98 170 128')),
      ...L('M142 182Q116 236 170 238Q200 254 230 238Q284 236 258 182'),
      ...L('M176 196Q200 222 224 196', 2.6),
      ...L('M200 252Q204 310 236 384'),
      leafLine(214, 306, 76, -20, 0.3),
      leafLine(208, 280, 70, 200, 0.3),
      ...sparks([[318, 90, 13], [80, 270, 9], [300, 300, 7]]),
      ...dots([[96, 120, 3.5], [330, 230, 3]]),
    ],
  },
  {
    id: 'ligne-lotus',
    viewBox: '0 0 400 360',
    kw: ['lotus', 'fleur', 'zen', 'yoga', 'eau', 'asie'],
    parts: () => [
      bg(200, 170, 140, 110, 31, P.sage),
      ...L('M200 70Q238 140 200 232Q162 140 200 70Z'),
      ...L('M200 232Q128 204 116 120Q170 146 200 232'),
      ...L(mx('M200 232Q128 204 116 120Q170 146 200 232')),
      ...L('M200 234Q108 240 64 186Q140 176 200 234'),
      ...L(mx('M200 234Q108 240 64 186Q140 176 200 234')),
      ...L('M200 110L200 200', 2.2),
      ...L('M110 270Q200 254 290 270', 3),
      ...L('M146 296Q200 286 254 296', 2.6),
      ...L('M178 318Q200 312 222 318', 2.2),
      ...sparks([[200, 30, 11], [326, 92, 9], [74, 104, 8]]),
      ...dots([[150, 48, 3], [250, 46, 3]]),
    ],
  },
  {
    id: 'ligne-tulipes',
    viewBox: '0 0 400 420',
    kw: ['tulipe', 'fleur', 'bouquet', 'printemps', 'hollande'],
    parts: () => {
      const head = 'M-30 0Q-36 -50 -20 -66L-8 -42L0 -72L8 -42L20 -66Q36 -50 30 0Q0 18 -30 0Z';
      return [
        bg(205, 190, 128, 140, 41, '#e9ab92'),
        g(L(head), 'translate(200 120)'),
        g(L(head), 'translate(118 170) rotate(-18)'),
        g(L(head), 'translate(286 176) rotate(16)'),
        ...L(smoothOpen([[200, 128], [198, 260], [200, 396]])),
        ...L(smoothOpen([[121, 178], [140, 290], [194, 396]])),
        ...L(smoothOpen([[284, 184], [262, 290], [206, 396]])),
        ...L('M198 330Q150 300 140 230Q176 270 198 330Z', 2.8),
        ...L('M202 350Q262 320 280 262Q236 300 202 350Z', 2.8),
        ...sparks([[330, 80, 12], [80, 90, 9]]),
        ...dots([[260, 60, 3], [340, 300, 3.5]]),
      ];
    },
  },
  {
    id: 'ligne-marguerite',
    viewBox: '0 0 400 420',
    kw: ['marguerite', 'fleur', 'pâquerette', 'champ', 'été'],
    parts: () => {
      const petals: string[] = [];
      for (let i = 0; i < 16; i++) {
        petals.push(g(L(roundPetal(78, 0.3), 2.8), `translate(200 150) rotate(${i * 22.5}) translate(0 -24)`));
      }
      return [
        bg(220, 160, 118, 116, 51, P.mustard),
        ...petals,
        ...L(circle(200, 150, 24), 3),
        ...dots([[194, 144, 2.6], [206, 148, 2.6], [198, 158, 2.6], [208, 160, 2.2], [190, 154, 2.2]]),
        ...L(smoothOpen([[200, 252], [206, 320], [196, 410]])),
        leafLine(204, 326, 70, -30, 0.26),
        leafLine(200, 360, 60, 210, 0.26),
        ...sparks([[330, 300, 13], [64, 70, 9]]),
        ...dots([[86, 250, 3.5], [344, 60, 3]]),
      ];
    },
  },
  {
    id: 'ligne-fougere',
    viewBox: '0 0 400 420',
    kw: ['fougère', 'feuille', 'forêt', 'nature', 'vert'],
    parts: () => {
      const p0: Pt = [130, 404];
      const p1: Pt = [150, 190];
      const p2: Pt = [276, 34];
      const out = [bg(200, 210, 120, 150, 61, P.sage), ...L(qPath(p0, p1, p2), 3.2)];
      for (let i = 0; i < 13; i++) {
        const t = 0.1 + i * 0.068;
        const { p, deg } = quad(p0, p1, p2, t);
        const l = 70 * (1 - t * 0.78);
        out.push(leafLine(p[0], p[1], l, deg - 62, 0.24, false, 2.6));
        out.push(leafLine(p[0], p[1], l, deg + 62, 0.24, false, 2.6));
      }
      out.push(...sparks([[330, 330, 12], [70, 120, 9]]), ...dots([[320, 200, 3.5], [96, 260, 3]]));
      return out;
    },
  },
  {
    id: 'ligne-olivier',
    viewBox: '0 0 420 400',
    kw: ['olivier', 'olive', 'branche', 'méditerranée', 'provence', 'grèce'],
    parts: () => {
      const p0: Pt = [60, 350];
      const p1: Pt = [190, 300];
      const p2: Pt = [370, 70];
      const olive = (x: number, y: number, deg: number): string[] => [
        `<ellipse cx="${x}" cy="${y}" rx="15" ry="10" transform="rotate(${deg} ${x} ${y})" fill="${P.sage}"/>`,
        g(L('M-15 0C-15 -14 15 -14 15 0C15 14 -15 14 -15 0Z', 2.8), `translate(${x} ${y}) rotate(${deg})`),
      ];
      return [
        bg(220, 200, 150, 120, 71, P.sand),
        ...branch(p0, p1, p2, 11, 74, { k: 0.17, spread: 38, shrink: 0.4 }),
        ...olive(178, 330, 30),
        ...olive(262, 248, -60),
        ...olive(300, 200, 20),
        ...sparks([[100, 100, 12], [360, 300, 9]]),
        ...dots([[150, 160, 3.5], [390, 200, 3]]),
      ];
    },
  },
  {
    id: 'ligne-lavande',
    viewBox: '0 0 400 420',
    kw: ['lavande', 'provence', 'fleur', 'violet', 'parfum'],
    parts: () => {
      const stems: [Pt, Pt][] = [
        [[200, 330], [200, 60]],
        [[196, 330], [120, 90]],
        [[204, 330], [282, 84]],
      ];
      const out: string[] = [bg(205, 200, 126, 150, 81, P.sage)];
      for (const [a, b] of stems) {
        out.push(...L(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, 2.8));
        const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        for (let i = 0; i < 7; i++) {
          const t = 0.6 + i * 0.062;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          for (const side of [-1, 1]) {
            const bx = Math.round((x + Math.cos(((deg + side * 40) * Math.PI) / 180) * 9) * 10) / 10;
            const by = Math.round((y + Math.sin(((deg + side * 40) * Math.PI) / 180) * 9) * 10) / 10;
            out.push(`<ellipse cx="${bx}" cy="${by}" rx="8" ry="5" transform="rotate(${Math.round(deg + side * 40)} ${bx} ${by})" fill="#9a86c6"/>`);
            out.push(g(L('M-8 0C-8 -7 8 -7 8 0C8 7 -8 7 -8 0Z', 2), `translate(${bx} ${by}) rotate(${Math.round(deg + side * 40)})`));
          }
        }
      }
      out.push(...L('M184 300Q166 278 186 280Q200 284 200 300Q200 284 214 280Q234 278 216 300Z', 2.8));
      out.push(...L('M196 302Q180 340 172 360M204 302Q220 340 232 356', 2.8));
      out.push(...L('M200 330L198 410M196 330L182 404M204 330L218 404', 2.8));
      out.push(...sparks([[330, 330, 12], [70, 300, 9]]), ...dots([[90, 200, 3.5], [330, 200, 3]]));
      return out;
    },
  },
  {
    id: 'ligne-eucalyptus',
    viewBox: '0 0 360 420',
    kw: ['eucalyptus', 'feuille', 'branche', 'vert', 'nature'],
    parts: () => {
      const p0: Pt = [150, 410];
      const p1: Pt = [120, 220];
      const p2: Pt = [220, 30];
      const out: string[] = [bg(180, 210, 120, 160, 91, P.sage), ...L(qPath(p0, p1, p2), 3)];
      for (let i = 0; i < 10; i++) {
        const t = 0.06 + i * 0.094;
        const { p, deg } = quad(p0, p1, p2, t);
        const side = i % 2 === 0 ? -1 : 1;
        const r = 36 - i * 2.2;
        const a = ((deg + side * 80) * Math.PI) / 180;
        const cx = Math.round(p[0] + Math.cos(a) * r);
        const cy = Math.round(p[1] + Math.sin(a) * r);
        out.push(g(L(`M${-r} 0C${-r} ${-r * 0.8} ${r} ${-r * 0.8} ${r} 0C${r} ${r * 0.8} ${-r} ${r * 0.8} ${-r} 0Z`, 2.8), `translate(${cx} ${cy}) rotate(${Math.round(deg + side * 80)})`));
        out.push(...L(`M${p[0]} ${p[1]}L${Math.round(p[0] + Math.cos(a) * r * 0.9)} ${Math.round(p[1] + Math.sin(a) * r * 0.9)}`, 1.8));
      }
      out.push(...sparks([[300, 120, 12], [60, 90, 8]]), ...dots([[290, 300, 3.5], [56, 330, 3]]));
      return out;
    },
  },
  {
    id: 'ligne-monstera',
    viewBox: '0 0 400 420',
    kw: ['monstera', 'feuille', 'tropical', 'plante', 'jungle'],
    parts: () => {
      const slitsL = [
        [96, 126, 156, 150],
        [72, 178, 152, 196],
        [78, 232, 156, 238],
        [112, 284, 166, 276],
      ];
      return [
        bg(212, 200, 140, 140, 101, P.sage),
        ...L('M200 330C120 330 60 260 70 180C80 100 150 62 200 76C250 62 320 100 330 180C340 260 280 330 200 330Z'),
        ...L('M200 330L200 90', 3),
        ...L('M200 330Q206 370 220 410', 3.4),
        ...slitsL.flatMap(([x1, y1, x2, y2]) => [
          ...L(`M${x1} ${y1}L${x2} ${y2}`, 3),
          ...L(mx(`M${x1} ${y1! + 4}L${x2} ${y2! + 4}`), 3),
        ]),
        ...L('M174 120C168 112 180 104 184 114', 2.4),
        ...L(mx('M170 214C162 206 176 198 180 208'), 2.4),
        ...sparks([[346, 60, 12], [60, 360, 9]]),
        ...dots([[60, 90, 3.5], [350, 330, 3]]),
      ];
    },
  },
  {
    id: 'ligne-cactus-pot',
    viewBox: '0 0 400 420',
    kw: ['cactus', 'plante', 'pot', 'désert', 'mexique'],
    parts: () => [
      bg(200, 190, 124, 140, 111, P.peach),
      fill('M142 300L258 300L244 390L156 390Z', P.terracotta),
      ...L('M142 300L258 300L244 390L156 390Z'),
      ...L('M130 278L270 278L270 302L130 302Z'),
      ...L('M150 330L170 350L190 330L210 350L230 330L250 350', 2.6),
      ...L('M178 278L178 120Q178 88 200 88Q222 88 222 120L222 278'),
      ...L('M178 222L158 222Q142 222 142 206L142 160Q142 144 155 144Q168 144 168 160L168 200L178 200'),
      ...L('M222 186L242 186Q258 186 258 170L258 130Q258 114 245 114Q232 114 232 130L232 164L222 164'),
      ...L('M200 98L200 276', 2.2),
      ...L('M186 140L192 136M208 180L214 176M186 230L192 226M150 180L156 176M244 150L250 146', 2.2),
      ...sparks([[320, 80, 12], [80, 90, 9]]),
      ...dots([[300, 250, 3.5], [96, 260, 3]]),
    ],
  },
  {
    id: 'ligne-palmier',
    viewBox: '0 0 400 420',
    kw: ['palmier', 'plage', 'tropical', 'île', 'vacances', 'été'],
    parts: () => {
      const crown: Pt = [214, 136];
      // [direction in degrees, length, droop of the tip]
      const fronds: [number, number, number][] = [
        [-176, 136, 70],
        [-146, 128, 40],
        [-112, 100, 14],
        [-66, 104, 14],
        [-30, 132, 44],
        [2, 134, 72],
      ];
      const out: string[] = [bg(260, 150, 110, 100, 121, P.mustard)];
      out.push(...L('M190 410Q186 300 206 140'), ...L('M214 410Q210 300 222 140'));
      for (let y = 380; y > 160; y -= 28) out.push(...L(`M${190 + (410 - y) * 0.06} ${y}Q${202 + (410 - y) * 0.06} ${y + 8} ${213 + (410 - y) * 0.035} ${y}`, 2.2));
      for (const [deg, l, droop] of fronds) {
        const a = (deg * Math.PI) / 180;
        const end: Pt = [Math.round(crown[0] + Math.cos(a) * l), Math.round(crown[1] + Math.sin(a) * l + droop)];
        const ctrl: Pt = [Math.round(crown[0] + Math.cos(a) * l * 0.55), Math.round(crown[1] + Math.sin(a) * l * 0.55 - 26)];
        // Normal to the frond, pointing up-ish.
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const s = ny > 0 ? -1 : 1;
        const w = 20;
        const up: Pt = [Math.round(ctrl[0] + nx * w * s), Math.round(ctrl[1] + ny * w * s)];
        const lo: Pt = [Math.round(ctrl[0] - nx * w * s), Math.round(ctrl[1] - ny * w * s)];
        out.push(...L(`M${crown[0]} ${crown[1]}Q${up[0]} ${up[1]} ${end[0]} ${end[1]}Q${lo[0]} ${lo[1]} ${crown[0]} ${crown[1]}Z`, 3));
        out.push(...L(qPath(crown, ctrl, end), 2));
        for (let i = 1; i < 5; i++) {
          const m = quad(crown, ctrl, end, i / 5);
          const e = quad(crown, lo, end, i / 5 + 0.08);
          out.push(...L(`M${m.p[0]} ${m.p[1]}L${e.p[0]} ${e.p[1]}`, 2));
        }
      }
      out.push(...L('M300 70q8 -8 16 0q8 -8 16 0M330 100q6 -6 12 0q6 -6 12 0', 2.4));
      out.push(...sparks([[80, 250, 10]]), ...dots([[340, 260, 3.5], [70, 60, 3]]));
      return out;
    },
  },
  {
    id: 'ligne-tasse-fumante',
    viewBox: '0 0 400 400',
    kw: ['tasse', 'café', 'thé', 'chaud', 'petit déjeuner', 'cocooning'],
    parts: () => [
      bg(200, 240, 140, 120, 131, P.apricot),
      ...L('M120 200Q200 226 280 200Q200 178 120 200Z'),
      ...L('M120 200L124 250Q132 312 200 316Q268 312 276 250L280 200'),
      ...L('M278 218Q334 216 328 256Q320 290 270 274'),
      ...L('M282 236Q306 238 304 256Q300 270 276 262', 2.4),
      ...L('M76 322Q200 362 324 322Q314 306 290 304', 3.2),
      ...L('M110 306Q90 310 76 322', 3.2),
      g(L(heart(0, 0, 16), 2.6), 'translate(200 262)'),
      ...L(smoothOpen([[170, 170], [160, 140], [178, 116], [166, 84]]), 3),
      ...L(smoothOpen([[204, 168], [194, 132], [214, 104], [202, 64]]), 3),
      ...L(smoothOpen([[236, 170], [228, 144], [244, 124], [234, 98]]), 3),
      ...sparks([[318, 120, 12], [84, 140, 9]]),
      ...dots([[300, 70, 3], [96, 230, 3.5]]),
    ],
  },
  {
    id: 'ligne-theiere',
    viewBox: '0 0 400 380',
    kw: ['théière', 'thé', 'tea time', 'maroc', 'anglais'],
    parts: () => [
      bg(200, 220, 140, 120, 141, P.sage),
      ...L('M126 300Q96 196 200 182Q304 196 274 300Z'),
      ...L('M136 300L264 300L254 320L146 320Z'),
      ...L('M158 184Q200 152 242 184'),
      ...L('M188 160L184 150Q200 138 216 150L212 160', 3),
      ...L(circle(200, 134, 9), 3),
      ...L('M118 250Q70 244 56 184L70 178Q86 222 120 222'),
      ...L('M278 210Q340 206 338 254Q336 296 282 288'),
      ...L('M290 226Q318 226 318 254Q316 274 286 272', 2.4),
      ...L('M118 238Q200 262 282 238', 2.4),
      ...dots([[150, 266, 3], [175, 272, 3], [200, 274, 3], [225, 272, 3], [250, 266, 3]]),
      ...sparks([[62, 120, 11], [336, 120, 9], [300, 60, 7]]),
      ...dots([[96, 340, 3], [330, 336, 3.5]]),
    ],
  },
  {
    id: 'ligne-bougie',
    viewBox: '0 0 400 420',
    kw: ['bougie', 'flamme', 'lumière', 'cocooning', 'soirée'],
    parts: () => {
      const glow: string[] = [];
      for (const deg of [-160, -125, -90, -55, -20]) {
        const a = onCircle(200, 132, 62, deg);
        const b = onCircle(200, 132, 82, deg);
        glow.push(...L(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, 2.8));
      }
      return [
        bg(200, 220, 120, 150, 151, P.peach),
        fill('M200 84Q232 128 216 160Q200 172 184 160Q168 128 200 84Z', P.mustard),
        ...L('M200 84Q232 128 216 160Q200 172 184 160Q168 128 200 84Z'),
        ...L('M200 110Q210 136 200 152Q190 136 200 110Z', 2.2),
        ...L('M200 166L200 184', 3),
        ...glow,
        ...L('M164 184L236 184L236 370L164 370Z'),
        ...L('M164 200Q172 236 180 204Q188 248 198 202Q210 230 222 202Q228 220 236 198', 2.8),
        ...L('M108 372Q200 400 292 372Q200 350 108 372Z'),
        ...L('M286 374Q316 372 318 384Q318 396 296 392', 2.6),
        ...sparks([[90, 120, 11], [320, 250, 9]]),
        ...dots([[330, 120, 3], [80, 280, 3.5]]),
      ];
    },
  },
  {
    id: 'ligne-vase-branches',
    viewBox: '0 0 400 420',
    kw: ['vase', 'branche', 'bouquet', 'déco', 'maison'],
    parts: () => [
      bg(200, 210, 130, 150, 161, '#e9ab92'),
      ...L('M170 400Q126 350 148 296Q162 266 174 246L174 214L226 214L226 246Q238 266 252 296Q274 350 230 400Z'),
      ...L('M168 214L232 214', 3),
      ...L('M144 320Q200 340 256 320', 2.4),
      ...L('M150 350Q200 368 250 350', 2.4),
      ...branch([196, 214], [170, 130], [100, 60], 5, 40, { k: 0.3, spread: 52, rib: false }),
      ...branch([204, 214], [214, 120], [220, 30], 5, 40, { k: 0.3, spread: 52, rib: false }),
      ...branch([206, 214], [262, 150], [320, 96], 4, 38, { k: 0.3, spread: 52, rib: false }),
      ...dots([[150, 92, 5], [318, 120, 5], [236, 60, 4.5]]),
      ...sparks([[340, 300, 11], [70, 260, 9]]),
    ],
  },
  {
    id: 'ligne-chapeau',
    viewBox: '0 0 400 340',
    kw: ['chapeau', 'paille', 'plage', 'été', 'soleil', 'vacances'],
    parts: () => [
      bg(200, 190, 160, 110, 171, P.sand),
      ...L('M120 230Q120 130 200 130Q280 130 280 230'),
      ...L('M122 204Q200 226 278 204', 3),
      ...L('M121 222Q200 244 279 222', 3),
      ...L('M124 228Q40 228 48 256Q66 300 200 300Q334 300 352 256Q360 228 276 228'),
      ...L('M246 226Q262 262 252 292M262 226Q292 252 292 282', 3),
      ...L('M244 218Q232 200 252 202Q262 206 258 222Q272 204 280 214Q282 226 262 226', 2.8),
      ...L('M150 170Q200 160 250 170M140 190Q200 180 260 190', 2),
      ...sparks([[330, 90, 13], [70, 120, 9]]),
      ...dots([[300, 50, 3], [110, 70, 3.5]]),
    ],
  },
  {
    id: 'ligne-appareil-photo',
    viewBox: '0 0 400 360',
    kw: ['appareil photo', 'photo', 'souvenir', 'voyage', 'vintage'],
    parts: () => [
      bg(200, 200, 150, 120, 181, P.peach),
      ...L('M90 140L310 140Q330 140 330 160L330 300Q330 320 310 320L90 320Q70 320 70 300L70 160Q70 140 90 140Z'),
      ...L('M148 140L164 110L236 110L252 140'),
      ...L('M70 180L136 180M264 180L330 180', 2.8),
      ...L(circle(200, 228, 64)),
      ...L(circle(200, 228, 44), 3),
      ...L(circle(200, 228, 18), 2.6),
      ...L('M176 206Q188 194 204 194', 2.4),
      ...L('M90 156L122 156L122 170L90 170Z', 2.6),
      ...L('M276 140L276 126L304 126L304 140', 3),
      ...L(circle(296, 160, 6), 2.4),
      ...sparks([[352, 70, 13], [50, 90, 9]]),
      ...dots([[340, 330, 3], [40, 300, 3.5]]),
    ],
  },
  {
    id: 'ligne-valise',
    viewBox: '0 0 400 400',
    kw: ['valise', 'bagage', 'voyage', 'départ', 'vacances'],
    parts: () => [
      bg(200, 230, 150, 130, 191, P.mustard),
      ...L('M80 160L320 160Q336 160 336 176L336 346Q336 362 320 362L80 362Q64 362 64 346L64 176Q64 160 80 160Z'),
      ...L('M162 160L162 128Q162 114 176 114L224 114Q238 114 238 128L238 160'),
      ...L('M176 160L176 132L224 132L224 160', 2.6),
      ...L('M126 160L126 362M274 160L274 362', 3),
      ...L('M116 250L136 250L136 272L116 272ZM264 250L284 250L284 272L264 272Z', 2.6),
      ...L('M64 186L336 186', 2.4),
      fill(circle(200, 286, 30), P.terracotta),
      ...L(circle(200, 286, 30), 2.6),
      g(L(heart(0, 0, 13), 2.4), 'translate(200 288)'),
      ...dots([[86, 342, 4], [314, 342, 4], [86, 180, 4], [314, 180, 4]]),
      ...sparks([[350, 90, 12], [60, 100, 9]]),
    ],
  },
  {
    id: 'ligne-coquillage',
    viewBox: '0 0 400 380',
    kw: ['coquillage', 'mer', 'plage', 'océan', 'été'],
    parts: () => {
      const base: Pt = [200, 330];
      const n = 7;
      const R = 200;
      const ps: Pt[] = [];
      for (let i = 0; i <= n; i++) ps.push(onCircle(base[0], base[1], R, -155 + (130 * i) / n));
      let edge = `M${ps[0]![0]} ${ps[0]![1]}`;
      for (let i = 0; i < n; i++) {
        const c = onCircle(base[0], base[1], R + 26, -155 + (130 * (i + 0.5)) / n);
        edge += `Q${c[0]} ${c[1]} ${ps[i + 1]![0]} ${ps[i + 1]![1]}`;
      }
      return [
        bg(200, 220, 150, 120, 201, P.apricot),
        ...L(`${edge}L${base[0]} ${base[1]}Z`),
        ...ps.slice(1, -1).flatMap((p) => L(`M${base[0]} ${base[1]}L${p[0]} ${p[1]}`, 2.6)),
        ...L('M170 334L146 356L254 356L230 334', 3),
        ...sparks([[340, 80, 12], [60, 90, 9]]),
        ...dots([[330, 330, 3.5], [70, 320, 3]]),
      ];
    },
  },
  {
    id: 'ligne-etoile-de-mer',
    viewBox: '0 0 400 400',
    kw: ['étoile de mer', 'mer', 'plage', 'océan', 'été'],
    parts: () => {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i++) pts.push(onCircle(200, 210, i % 2 === 0 ? 156 : 58, -90 + i * 36));
      const texture: [number, number, number][] = [];
      for (let i = 0; i < 5; i++) {
        for (const r of [42, 72, 102]) {
          const p = onCircle(200, 210, r, -90 + i * 72);
          texture.push([p[0], p[1], r === 102 ? 3.5 : 4.5]);
        }
      }
      return [
        bg(200, 210, 140, 130, 211, P.peach),
        ...L(smoothClosed(pts)),
        ...L(circle(200, 210, 12), 2.6),
        ...dots(texture),
        ...sparks([[340, 70, 12], [60, 360, 9]]),
        ...dots([[350, 330, 3], [56, 80, 3.5]]),
      ];
    },
  },
  {
    id: 'ligne-montgolfiere',
    viewBox: '0 0 400 420',
    kw: ['montgolfière', 'ballon', 'ciel', 'voyage', 'aventure'],
    parts: () => [
      bg(210, 170, 130, 140, 221, P.sand),
      fill('M114 150Q200 172 286 150L292 176Q200 198 108 176Z', P.coralLight),
      ...L('M200 50C292 50 324 132 292 204Q262 254 236 286L164 286Q138 254 108 204C76 132 108 50 200 50Z'),
      ...L('M200 50Q148 160 170 286M200 50Q252 160 230 286M200 50L200 286', 2.6),
      ...L('M114 150Q200 172 286 150M108 176Q200 198 292 176', 2.6),
      ...L('M168 286L180 328M232 286L220 328', 2.6),
      ...L('M176 328L224 328L220 366L180 366Z'),
      ...L('M178 346L222 346M192 328L190 366M208 328L210 366', 2),
      ...L('M40 300Q40 280 62 282Q70 264 92 272Q110 266 114 286Q132 290 126 304Z', 2.8),
      ...L('M300 360Q300 344 318 346Q326 332 344 340Q360 336 362 354Q374 358 368 368Z', 2.8),
      ...sparks([[350, 80, 12], [60, 90, 9]]),
      ...dots([[330, 230, 3.5], [74, 200, 3]]),
    ],
  },
  {
    id: 'ligne-soleil',
    viewBox: '0 0 400 400',
    kw: ['soleil', 'été', 'chaleur', 'ciel', 'bohème'],
    parts: () => {
      const rays: string[] = [];
      for (let i = 0; i < 16; i++) {
        const deg = i * 22.5;
        const a = onCircle(200, 200, 90, deg);
        const b = onCircle(200, 200, i % 2 === 0 ? 156 : 124, deg);
        rays.push(...L(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, i % 2 === 0 ? 3.2 : 2.6));
      }
      const ring: [number, number, number][] = [];
      for (let i = 0; i < 18; i++) {
        const p = onCircle(200, 200, 56, i * 20);
        ring.push([p[0], p[1], 2.6]);
      }
      return [
        bg(220, 190, 128, 124, 231, P.mustard),
        ...L(circle(200, 200, 74)),
        ...dots(ring),
        ...L(circle(200, 200, 34), 2.8),
        ...rays,
        ...sparks([[350, 60, 12], [52, 340, 9]]),
        ...dots([[60, 60, 3], [350, 350, 3.5]]),
      ];
    },
  },
  {
    id: 'ligne-lune-etoiles',
    viewBox: '0 0 400 400',
    kw: ['lune', 'croissant', 'nuit', 'étoile', 'rêve', 'ciel'],
    parts: () => [
      bg(190, 210, 130, 130, 241, P.sage),
      ...L('M230 70C130 64 74 150 96 240C118 330 230 356 300 296C220 306 158 252 158 186C158 134 190 92 230 70Z'),
      ...L('M120 170Q116 210 130 246', 2.2),
      ...sparks([[290, 140, 22], [330, 230, 12], [250, 210, 9], [320, 70, 8]]),
      g(L('M0 -24L8 -8L26 -6L12 6L16 24L0 14L-16 24L-12 6L-26 -6L-8 -8Z', 2.6), 'translate(340 334)'),
      ...dots([[220, 140, 3], [60, 330, 3.5], [70, 90, 3], [200, 372, 3]]),
    ],
  },
  {
    id: 'ligne-nuages',
    viewBox: '0 0 400 340',
    kw: ['nuage', 'ciel', 'météo', 'rêve', 'pluie'],
    parts: () => [
      bg(200, 170, 150, 110, 251, P.sand),
      ...L('M96 250Q70 250 70 228Q70 204 98 204Q100 168 140 170Q158 138 196 148Q226 132 244 166Q282 162 284 198Q308 204 306 228Q304 250 282 250Z'),
      ...L('M240 128Q226 128 226 114Q226 100 242 100Q246 78 270 82Q284 66 306 76Q330 74 332 98Q350 100 350 116Q350 128 334 128Z', 3),
      ...L('M110 228Q150 222 170 232', 2.2),
      ...L('M130 274L122 292M180 274L172 292M230 274L222 292', 2.8),
      ...sparks([[70, 110, 12], [360, 200, 9]]),
      ...dots([[150, 90, 3], [320, 290, 3.5]]),
    ],
  },
  {
    id: 'ligne-constellation',
    viewBox: '0 0 400 400',
    kw: ['constellation', 'étoile', 'ciel', 'nuit', 'astrologie', 'cosmos'],
    parts: () => {
      const stars: Pt[] = [[110, 150], [160, 120], [208, 160], [262, 132], [300, 196], [250, 260], [180, 290]];
      const path = `M${stars.map((p) => p.join(' ')).join('L')}M208 160L250 260`;
      return [
        bg(200, 200, 140, 140, 261, P.sage),
        ...L(circle(200, 200, 162), 2.4),
        ...L(path, 1.8),
        ...stars.map((p, i) => fill(sparkle(p[0], p[1], i % 3 === 0 ? 16 : 11), INK)),
        g([fill('M0 -26C-20 -20 -24 10 -6 22C-24 22 -36 4 -32 -10C-28 -22 -14 -28 0 -26Z', INK)], 'translate(110 270)'),
        ...dots([[150, 210, 3], [320, 120, 2.6], [230, 90, 2.6], [290, 310, 3], [100, 90, 2.6], [330, 260, 2.6]]),
      ];
    },
  },
  {
    id: 'ligne-oeil',
    viewBox: '0 0 400 360',
    kw: ['oeil', 'regard', 'bohème', 'mystique', 'protection'],
    parts: () => {
      const lashes: string[] = [];
      for (let i = 0; i < 7; i++) {
        const t = 0.2 + i * 0.1;
        const x = 80 + 240 * t;
        const y = 200 + Math.sin(t * Math.PI) * 56;
        lashes.push(...L(`M${x.toFixed(0)} ${y.toFixed(0)}L${(x + (t - 0.5) * 30).toFixed(0)} ${(y + 22).toFixed(0)}`, 2.8));
      }
      const rays: string[] = [];
      for (let i = 0; i < 7; i++) {
        const deg = -150 + i * 20;
        const a = onCircle(200, 200, 116, deg);
        const b = onCircle(200, 200, 146, deg);
        rays.push(...L(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, 2.8));
      }
      return [
        bg(200, 200, 150, 110, 271, P.peach),
        ...L('M80 200Q200 96 320 200Q200 304 80 200Z'),
        ...L(circle(200, 200, 46), 3),
        fill(circle(200, 200, 20), INK),
        fill(circle(208, 192, 5), '#ffffff'),
        ...lashes,
        ...rays,
        ...sparks([[60, 90, 11], [350, 300, 9]]),
        ...dots([[340, 90, 3], [60, 300, 3.5]]),
      ];
    },
  },
  {
    id: 'ligne-main-etoile',
    viewBox: '0 0 400 420',
    kw: ['main', 'étoile', 'magie', 'bohème', 'mystique'],
    parts: () => [
      bg(205, 250, 130, 140, 281, P.apricot),
      ...L(
        'M162 410L156 300Q120 274 104 236Q98 220 112 218Q124 218 136 236L158 262L160 150Q160 134 174 134Q188 134 188 150L190 240L190 124Q190 108 205 108Q220 108 220 124L220 240L222 136Q222 120 236 120Q250 120 250 136L250 252L254 168Q256 154 268 154Q280 154 280 168L276 282Q272 330 248 350L248 410',
      ),
      ...L('M176 318Q210 300 246 316M170 290Q200 280 220 286', 2.2),
      g(L(heart(0, 0, 14), 2.6), 'translate(212 262)'),
      ...sparks([[205, 56, 22], [140, 74, 9], [272, 80, 10]]),
      ...dots([[100, 140, 3], [320, 200, 3.5], [330, 100, 3]]),
    ],
  },
  {
    id: 'ligne-montagne-arche',
    viewBox: '0 0 400 420',
    kw: ['montagne', 'paysage', 'arche', 'randonnée', 'soleil', 'nature'],
    parts: () => [
      bg(200, 220, 140, 160, 291, P.sage),
      fill(circle(250, 158, 32), P.mustard),
      ...L(circle(250, 158, 32), 2.8),
      ...L('M90 390L90 190Q90 80 200 80Q310 80 310 190L310 390Z'),
      ...L('M90 320L156 214L190 266L240 198L310 296'),
      ...L('M144 234L156 252L166 236M228 216L240 234L252 216', 2.4),
      ...L('M90 352Q200 324 310 352', 3),
      ...L('M120 372Q200 356 280 372', 2.4),
      ...L('M140 140q7 -7 14 0q7 -7 14 0M168 168q5 -5 10 0q5 -5 10 0', 2.4),
      ...sparks([[350, 70, 12], [50, 120, 9]]),
      ...dots([[356, 300, 3.5], [44, 280, 3]]),
    ],
  },
  {
    id: 'ligne-vague-cercle',
    viewBox: '0 0 400 400',
    kw: ['vague', 'mer', 'océan', 'surf', 'plage'],
    parts: () => [
      bg(200, 200, 150, 140, 301, P.sage),
      ...L(circle(200, 200, 150)),
      ...L('M56 250Q110 170 180 176Q248 184 240 240Q234 280 196 272Q168 264 182 240Q194 226 210 236'),
      ...L('M68 280Q150 262 200 290Q260 318 340 280', 3),
      ...L('M84 320Q160 304 210 326Q260 346 318 322', 2.6),
      ...L('M130 196Q170 180 210 194M110 220Q150 200 196 208', 2.2),
      fill(circle(286, 140, 24), P.mustard),
      ...L(circle(286, 140, 24), 2.6),
      ...sparks([[370, 60, 11], [34, 350, 9]]),
    ],
  },
  {
    id: 'ligne-coucher-soleil',
    viewBox: '0 0 400 400',
    kw: ['coucher de soleil', 'soleil', 'mer', 'horizon', 'plage', 'soir'],
    parts: () => {
      const rays: string[] = [];
      for (let i = 0; i < 9; i++) {
        const deg = -180 + i * 22.5;
        const a = onCircle(200, 232, 70, deg);
        const b = onCircle(200, 232, 104, deg);
        rays.push(...L(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, 2.8));
      }
      return [
        bg(200, 200, 150, 146, 311, P.peach),
        ...L(circle(200, 200, 150)),
        fill('M140 232A60 60 0 0 1 260 232Z', P.mustard),
        ...L('M140 232A60 60 0 0 1 260 232'),
        ...rays,
        ...L('M50 232L350 232', 3),
        ...L('M90 262L170 262M210 262L310 262M120 290L280 290M160 318L240 318', 2.6),
        ...sparks([[370, 60, 11], [34, 350, 9]]),
      ];
    },
  },
  {
    id: 'ligne-plume',
    viewBox: '0 0 360 420',
    kw: ['plume', 'bohème', 'écriture', 'oiseau', 'légèreté'],
    parts: () => {
      const barbs: string[] = [];
      for (let i = 0; i < 8; i++) {
        const t = 0.18 + i * 0.09;
        const { p, deg } = quad([180, 400], [186, 250], [214, 50], t);
        const a = onCircle(p[0], p[1], 46 - Math.abs(t - 0.5) * 50, deg - 130);
        const b = onCircle(p[0], p[1], 46 - Math.abs(t - 0.5) * 50, deg + 130);
        barbs.push(...L(`M${p[0]} ${p[1]}L${a[0]} ${a[1]}M${p[0]} ${p[1]}L${b[0]} ${b[1]}`, 2));
      }
      return [
        bg(190, 210, 120, 160, 321, P.sage),
        ...L('M180 400Q186 250 214 50', 3),
        ...L('M184 330Q120 262 150 160Q174 92 214 50'),
        ...L('M214 50Q262 116 254 196Q244 270 186 330'),
        ...L('M152 212L176 220', 2.6),
        ...barbs,
        ...sparks([[300, 80, 12], [60, 340, 9]]),
        ...dots([[300, 300, 3.5], [60, 100, 3]]),
      ];
    },
  },
  {
    id: 'ligne-papillon',
    viewBox: '0 0 400 360',
    kw: ['papillon', 'insecte', 'printemps', 'jardin', 'liberté'],
    parts: () => {
      const up = 'M196 186Q130 70 82 104Q54 150 120 190Q170 204 196 196';
      const low = 'M196 200Q128 206 122 260Q132 300 168 284Q190 260 198 214';
      return [
        bg(200, 190, 150, 120, 331, P.apricot),
        ...L(up),
        ...L(mx(up)),
        ...L(low),
        ...L(mx(low)),
        ...L('M200 160Q190 200 200 270Q210 200 200 160Z', 3),
        ...L('M198 162Q180 120 160 110M202 162Q220 120 240 110', 2.4),
        ...dots([[160, 108, 4], [240, 108, 4]]),
        ...L(circle(126, 142, 14), 2.4),
        ...L(circle(274, 142, 14), 2.4),
        ...dots([[150, 250, 4], [250, 250, 4], [104, 170, 3], [296, 170, 3]]),
        ...sparks([[60, 300, 11], [350, 300, 9], [200, 60, 8]]),
      ];
    },
  },
];
