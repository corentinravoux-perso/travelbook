/** Bohème, travel theme (mer et plage, carnet de voyage, saveurs du monde). */
import {
  type Drawing,
  INK,
  blob,
  circle,
  fill,
  heart,
  smoothClosed,
  sparkle,
  star,
} from './core.ts';
import { P, leaf, line, ring, roundPetal } from './boheme-kit.ts';

type Pt = [number, number];

/** Main line width of the travel drawings. */
const W = 3.4;
const L = (d: string, w = W): string[] => line(d, w);
const g = (parts: string[], transform: string): string =>
  `<g transform="${transform}">${parts.join('')}</g>`;
const bg = (cx: number, cy: number, rx: number, ry: number, seed: number, colour: string): string =>
  fill(blob(cx, cy, rx, ry, seed), colour);
const sparks = (list: [number, number, number][]): string[] =>
  list.map(([x, y, s]) => fill(sparkle(x, y, s), INK));
const dots = (list: [number, number, number][], colour = INK): string[] =>
  list.map(([x, y, r]) => fill(circle(x, y, r), colour));

/** Extra soft colours for the travel drawings (no white anywhere). */
const C = {
  sky: '#bcd9dc',
  skyDeep: '#7fb6bd',
  cream: '#fbe8c4',
  rose: '#f7b9b4',
  lightTerra: '#e9ab92',
  dark: '#2d3b36',
  salmon: '#f39a7b',
  mint: '#bfdcc8',
  lemon: '#f7d65c',
};

const r1 = (n: number): number => Math.round(n * 10) / 10;
const ell = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rect = (x: number, y: number, w: number, h: number): string => `M${x} ${y}h${w}v${h}h${-w}Z`;
const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}h${w - 2 * r}q${r} 0 ${r} ${r}v${h - 2 * r}q0 ${r} ${-r} ${r}h${-(w - 2 * r)}q${-r} 0 ${-r} ${-r}v${-(h - 2 * r)}q0 ${-r} ${r} ${-r}Z`;
const poly = (pts: Pt[]): string => `M${pts.map((p) => p.join(' ')).join('L')}Z`;
/** A point at angle `deg` (0 up, clockwise) and radius r around (cx, cy). */
const pol = (cx: number, cy: number, r: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [r1(cx + Math.sin(a) * r), r1(cy - Math.cos(a) * r)];
};
/** A ring segment between radii r1 < r2 and angles a0 < a1 (less than 180 degrees). */
const wedge = (cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string => {
  const p1 = pol(cx, cy, ro, a0);
  const p2 = pol(cx, cy, ro, a1);
  const p3 = pol(cx, cy, ri, a1);
  const p4 = pol(cx, cy, ri, a0);
  return `M${p1.join(' ')}A${ro} ${ro} 0 0 1 ${p2.join(' ')}L${p3.join(' ')}A${ri} ${ri} 0 0 0 ${p4.join(' ')}Z`;
};
/** A wavy horizontal line. */
const wave = (x0: number, x1: number, y: number, amp = 8, len = 40): string => {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1 - 1; x += len) d += `q${len / 4} ${-amp} ${len / 2} 0t${len / 2} 0`;
  return d;
};
/** A leaf outline from (x, y) toward angle `deg` (0 up, clockwise), as an absolute path. */
const leafPath = (x: number, y: number, l: number, deg: number, k = 0.3): string => {
  const tip = pol(x, y, l, deg);
  const m1 = pol(x, y, l * 0.5, deg);
  const n1 = pol(m1[0], m1[1], l * k, deg + 90);
  const n2 = pol(m1[0], m1[1], l * k, deg - 90);
  return `M${x} ${y}Q${n1.join(' ')} ${tip.join(' ')}Q${n2.join(' ')} ${x} ${y}Z`;
};
/** A steam curl rising from (x, y). */
const steam = (x: number, y: number, h = 60): string =>
  `M${x} ${y}q-12 ${-h / 4} 0 ${-h / 2}t0 ${-h / 2}`;
/** A flat leaf with a vein (fill only, darker vein as a thin fill). */
const flatLeaf = (x: number, y: number, l: number, deg: number, colour: string, k = 0.32): string =>
  leaf(x, y, l, deg, colour, k);

// ------------------------------------------------------------------ mer et plage

const PLAGE: Drawing[] = [
  {
    id: 'plage-parasol-ballon',
    viewBox: '0 0 400 400',
    kw: ['parasol', 'plage', 'ballon', 'été', 'sable', 'vacances'],
    parts: () => [
      bg(205, 220, 155, 135, 201, C.sky),
      fill(
        'M60 150Q170 30 280 150q-22 18 -44 0q-22 18 -44 0q-22 18 -44 0q-22 18 -44 0q-22 18 -44 0Z',
        P.coralLight,
      ),
      fill('M170 72L104 150L148 150Z', P.coral),
      fill('M170 72L192 150L236 150Z', P.coral),
      ...L('M60 150Q170 30 280 150'),
      ...L('M60 150q22 18 44 0q22 18 44 0q22 18 44 0q22 18 44 0q22 18 44 0'),
      ...L('M170 72L104 150M170 72L148 150M170 72L192 150M170 72L236 150'),
      ...L('M170 72L170 56M170 150L198 362'),
      fill(wedge(292, 316, 0, 44, 0, 90), P.mustard),
      fill(wedge(292, 316, 0, 44, 180, 270), P.teal),
      ...L(circle(292, 316, 44)),
      ...L('M248 316Q292 296 336 316M292 272Q272 316 292 360'),
      ...L('M40 364Q200 340 370 364'),
      ...sparks([
        [330, 90, 14],
        [356, 140, 7],
      ]),
      ...dots([
        [300, 60, 3.5],
        [60, 300, 3],
      ]),
    ],
  },
  {
    id: 'plage-transat',
    viewBox: '0 0 400 380',
    kw: ['transat', 'chaise longue', 'plage', 'repos', 'été'],
    parts: () => [
      bg(200, 200, 150, 140, 204, P.sand),
      fill('M146 92L246 92L286 252L190 252Z', P.coral),
      fill('M168 92L190 92L230 252L208 252Z', P.mustard),
      fill('M214 92L236 92L276 252L254 252Z', P.mustard),
      ...L('M146 92L246 92L286 252L190 252Z'),
      ...L('M130 60L176 340M262 60L310 340'),
      ...L('M120 256L320 256M176 340L120 256M310 340L250 256'),
      ...L('M40 346Q200 326 362 346'),
      ...sparks([
        [76, 90, 14],
        [330, 110, 9],
      ]),
      ...dots([
        [100, 150, 3.5],
        [340, 190, 3],
      ]),
    ],
  },
  {
    id: 'plage-bouee',
    viewBox: '0 0 400 400',
    kw: ['bouée', 'plage', 'mer', 'nager', 'été'],
    parts: () => [
      bg(200, 200, 150, 140, 207, C.sky),
      ...[0, 90, 180, 270].map((a) => fill(wedge(200, 200, 58, 120, a + 15, a + 60), P.coral)),
      ...L(circle(200, 200, 120)),
      ...L(circle(200, 200, 58)),
      ...L('M80 200Q60 120 120 80'),
      ...L(wave(70, 330, 350, 8, 40)),
      ...sparks([
        [336, 70, 14],
        [70, 330, 8],
      ]),
      ...dots([
        [350, 120, 3.5],
        [50, 90, 3],
      ]),
    ],
  },
  {
    id: 'plage-coquillages',
    viewBox: '0 0 420 360',
    kw: ['coquillage', 'coquille', 'plage', 'mer', 'conque'],
    parts: () => {
      const fan: string[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = -60 + i * 20;
        const p = pol(120, 270, 110, a);
        fan.push(`M120 270L${p.join(' ')}`);
      }
      return [
        bg(210, 190, 175, 135, 210, P.apricot),
        // Scallop
        ...L('M120 270L26 214Q30 150 80 160Q90 150 120 158Q150 150 160 160Q210 150 214 214Z'),
        ...L(fan.join('')),
        ...L('M104 286L136 286L132 270L108 270Z'),
        // Conch
        fill('M260 300Q232 230 268 170Q300 120 330 150Q360 190 340 250Q330 290 300 304Z', C.rose),
        ...L('M260 300Q232 230 268 170Q300 120 330 150Q360 190 340 250Q330 290 300 304Z'),
        ...L('M276 200Q300 186 324 200M268 236Q300 220 336 236M270 270Q300 258 330 272'),
        ...L('M300 304L292 330'),
        // Cowrie
        ...L(ell(370, 300, 26, 40)),
        ...L('M370 266Q362 300 370 336'),
        ...sparks([
          [210, 60, 14],
          [380, 120, 8],
        ]),
        ...dots([
          [56, 100, 3.5],
          [240, 110, 3],
        ]),
      ];
    },
  },
  {
    id: 'plage-etoile-de-mer',
    viewBox: '0 0 400 400',
    kw: ['étoile de mer', 'plage', 'mer', 'océan'],
    parts: () => {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i++) pts.push(pol(200, 206, i % 2 ? 62 : 160, i * 36 + 4));
      const out = [fill(smoothClosed(pts), P.coral)];
      const inner: Pt[] = [];
      for (let i = 0; i < 10; i++) inner.push(pol(200, 206, i % 2 ? 40 : 118, i * 36 + 4));
      out.push(fill(smoothClosed(inner), P.coralLight));
      for (let k = 0; k < 5; k++) {
        for (let j = 1; j <= 4; j++) {
          const p = pol(200, 206, 20 + j * 24, k * 72 + 4);
          out.push(fill(circle(p[0], p[1], 6 - j * 0.6), '#c94a3a'));
        }
      }
      out.push(fill(circle(200, 206, 10), '#c94a3a'));
      return out;
    },
  },
  {
    id: 'plage-poisson',
    viewBox: '0 0 420 320',
    kw: ['poisson', 'mer', 'océan', 'pêche', 'aquarium'],
    parts: () => {
      const scales: string[] = [];
      for (let x = 170; x <= 270; x += 30) {
        for (let y = 130; y <= 200; y += 34) scales.push(`M${x} ${y}q14 14 0 28`);
      }
      return [
        bg(220, 170, 170, 120, 213, C.mint),
        fill('M320 120L392 80Q376 160 392 240L320 200Z', P.teal),
        ...L('M320 120L392 80Q376 160 392 240L320 200Z'),
        ...L('M90 160Q170 60 320 120Q340 160 320 200Q170 260 90 160Z'),
        ...L('M140 112Q160 160 140 210'),
        ...L(scales.join('')),
        fill(circle(118, 150, 9), INK),
        ...L('M200 96Q230 60 270 86M200 224Q226 250 256 232'),
        ...L(circle(60, 100, 10)),
        ...L(circle(40, 64, 6)),
        ...sparks([[300, 280, 12]]),
        ...dots([
          [80, 260, 3.5],
          [360, 290, 3],
        ]),
      ];
    },
  },
  {
    id: 'plage-tortue',
    viewBox: '0 0 400 420',
    kw: ['tortue', 'mer', 'océan', 'plongée', 'animal'],
    parts: () => {
      const hex: string[] = [];
      for (const [x, y] of [
        [200, 210],
        [200, 150],
        [200, 270],
        [150, 180],
        [250, 180],
        [150, 240],
        [250, 240],
      ] as Pt[]) {
        const pts: Pt[] = [];
        for (let i = 0; i < 6; i++) pts.push(pol(x, y, 26, i * 60 + 30));
        hex.push(fill(poly(pts), P.leaf));
      }
      return [
        flatLeaf(130, 140, 90, -140, P.leafLight, 0.36),
        flatLeaf(270, 140, 90, -40, P.leafLight, 0.36),
        flatLeaf(150, 300, 66, 140, P.leafLight, 0.36),
        flatLeaf(250, 300, 66, 40, P.leafLight, 0.36),
        fill(ell(200, 74, 32, 40), P.leafLight),
        fill(circle(186, 60, 5), C.dark),
        fill(circle(214, 60, 5), C.dark),
        fill('M200 330L212 376L188 376Z', P.leafLight),
        fill(ell(200, 210, 96, 124), P.leafDark),
        ...hex,
      ];
    },
  },
  {
    id: 'plage-baleine',
    viewBox: '0 0 440 340',
    kw: ['baleine', 'mer', 'océan', 'animal', 'jet d’eau'],
    parts: () => [
      bg(220, 190, 180, 120, 216, C.sky),
      ...L(
        'M60 200Q70 110 190 110Q300 110 330 190Q350 150 400 130Q384 180 410 230Q360 220 336 214Q300 270 190 270Q80 270 60 200Z',
      ),
      ...L('M70 210Q190 240 320 206'),
      ...L('M120 226L120 252M150 232L150 262M180 236L180 266M210 236L210 264M240 232L240 258'),
      fill(circle(110, 176, 7), INK),
      ...L('M180 106Q170 60 140 50M180 106Q186 56 220 46M180 106L178 40'),
      ...L(wave(40, 420, 304, 8, 38)),
      ...sparks([
        [370, 60, 13],
        [60, 70, 8],
      ]),
      ...dots([[300, 70, 3.5]]),
    ],
  },
  {
    id: 'plage-voilier',
    viewBox: '0 0 400 400',
    kw: ['voilier', 'bateau', 'voile', 'mer', 'navigation'],
    parts: () => [
      fill(circle(200, 200, 168), C.sky),
      fill('M206 70L206 270L320 270Z', P.coralLight),
      ...L('M206 70L206 270L320 270Z'),
      ...L('M196 96L196 270L110 270Z'),
      ...L('M206 56L206 70L230 62Z'),
      ...L('M96 284L320 284L292 318L124 318Z'),
      ...L(wave(110, 290, 340, 7, 36)),
      ...L(circle(200, 200, 168)),
      ...sparks([
        [120, 110, 12],
        [300, 120, 8],
      ]),
      ...dots([[90, 200, 3]]),
    ],
  },
  {
    id: 'plage-phare',
    viewBox: '0 0 360 440',
    kw: ['phare', 'mer', 'côte', 'bretagne', 'lumière'],
    parts: () => [
      fill('M40 420L40 160Q40 30 180 30Q320 30 320 160L320 420Z', C.sky),
      fill('M146 236L214 236L220 280L140 280Z', P.coral),
      fill('M136 320L224 320L230 364L130 364Z', P.coral),
      ...L('M150 160L210 160L232 380L128 380Z'),
      ...L('M146 236L214 236M140 280L220 280M136 320L224 320M130 364L230 364'),
      ...L('M140 160L220 160L220 150L140 150Z'),
      fill(rect(156, 108, 48, 42), P.mustard),
      ...L(rect(156, 108, 48, 42)),
      ...L('M150 108L180 80L210 108Z'),
      ...L('M156 120L80 96M156 136L80 150M204 120L280 96M204 136L280 150', 2.6),
      ...L('M60 410Q100 370 140 384L230 384Q270 368 300 410'),
      ...L('M40 420L40 160Q40 30 180 30Q320 30 320 160L320 420Z'),
      ...sparks([[280, 70, 10]]),
      ...dots([[80, 240, 3]]),
    ],
  },
  {
    id: 'plage-palmiers-hamac',
    viewBox: '0 0 440 380',
    kw: ['hamac', 'palmier', 'plage', 'repos', 'tropical', 'île'],
    parts: () => {
      const crown = (x: number, y: number, s: number): string[] =>
        [-150, -110, -70, -30, 10, 50].flatMap((a) => {
          const end = pol(x, y, 70 * s, a + 90);
          const mid = pol(x, y, 40 * s, a + 70);
          return L(`M${x} ${y}Q${mid.join(' ')} ${end.join(' ')}`);
        });
      return [
        bg(220, 170, 150, 130, 222, P.mustard),
        ...L('M90 340Q100 230 80 120'),
        ...L('M350 340Q340 240 362 140'),
        ...crown(80, 120, 1),
        ...crown(362, 140, 0.9),
        ...L('M92 220Q220 330 346 230'),
        ...L('M92 220Q220 300 346 230'),
        ...L(
          'M120 252L130 236M160 274L166 256M200 286L202 266M240 284L238 264M280 272L274 254M316 252L308 236',
          2.4,
        ),
        ...L('M30 350Q220 330 410 350'),
        ...sparks([[220, 80, 12]]),
        ...dots([
          [260, 120, 3.5],
          [180, 110, 3],
        ]),
      ];
    },
  },
  {
    id: 'plage-cabine',
    viewBox: '0 0 360 420',
    kw: ['cabine de plage', 'plage', 'normandie', 'rayures', 'bord de mer'],
    parts: () => [
      bg(180, 230, 140, 160, 225, P.apricot),
      ...[110, 160, 210].map((x) => fill(rect(x, 150, 25, 210), P.teal)),
      ...L('M96 150L264 150L264 360L96 360Z'),
      ...L('M80 154L180 80L280 154Z'),
      ...L('M180 80L180 44L214 54L180 64'),
      ...L(rrect(150, 230, 60, 90, 6)),
      ...L(circle(180, 120, 12)),
      ...L('M70 372L290 372M110 360L110 372M250 360L250 372'),
      ...sparks([
        [300, 90, 12],
        [56, 110, 7],
      ]),
      ...dots([[300, 300, 3]]),
    ],
  },
  {
    id: 'plage-surf',
    viewBox: '0 0 400 420',
    kw: ['surf', 'planche', 'vague', 'plage', 'sport'],
    parts: () => [
      bg(200, 220, 140, 170, 228, P.peach),
      g(
        [
          fill(ell(0, 0, 44, 170), P.mustard),
          fill('M-10 -168L10 -168L10 168L-10 168Z', P.coral),
          ...L(ell(0, 0, 44, 170)),
          ...L('M-6 120L0 150L6 120'),
        ],
        'translate(160 220) rotate(-12)',
      ),
      g(
        [
          fill(ell(0, 0, 40, 160), P.sage),
          fill(ell(0, -60, 40, 18), P.teal),
          ...L(ell(0, 0, 40, 160)),
          ...L('M-40 -60Q0 -50 40 -60M-38 -40Q0 -30 38 -40'),
        ],
        'translate(250 226) rotate(14)',
      ),
      ...sparks([
        [330, 60, 13],
        [70, 90, 8],
      ]),
      ...dots([[340, 360, 3.5]]),
    ],
  },
  {
    id: 'plage-seau-pelle',
    viewBox: '0 0 400 380',
    kw: ['seau', 'pelle', 'château de sable', 'plage', 'enfant'],
    parts: () => [
      bg(200, 200, 160, 130, 231, P.mustard),
      fill('M110 160L250 160L232 330L128 330Z', P.teal),
      fill('M114 196L246 196L242 230L118 230Z', P.tealDark),
      ...L('M110 160L250 160L232 330L128 330Z'),
      ...L('M114 196L246 196M118 230L242 230'),
      ...L('M110 166Q180 40 250 166'),
      ...L('M290 330L330 120'),
      fill('M322 120L352 60L360 64L340 132Z', P.coral),
      ...L('M318 128Q306 60 344 50Q378 70 344 136Z'),
      ...L('M40 340Q200 320 370 340'),
      ...sparks([[80, 90, 12]]),
      ...dots([
        [300, 220, 3.5],
        [60, 200, 3],
      ]),
    ],
  },
  {
    id: 'plage-chapeau-lunettes',
    viewBox: '0 0 420 340',
    kw: ['chapeau de paille', 'lunettes de soleil', 'plage', 'été', 'vacances'],
    parts: () => [
      bg(210, 170, 170, 120, 234, P.apricot),
      ...L('M40 180Q210 110 380 180Q300 220 210 214Q120 220 40 180Z'),
      ...L('M130 160Q140 70 210 70Q280 70 290 160'),
      fill('M134 144Q210 128 286 144L288 162Q210 146 132 162Z', P.coral),
      ...L('M134 144Q210 128 286 144M132 162Q210 146 288 162'),
      ...L('M140 110Q210 96 280 110M150 90Q210 80 270 90', 2.2),
      fill(ell(160, 270, 46, 34), INK),
      fill(ell(270, 270, 46, 34), INK),
      ...L('M206 262Q215 252 224 262'),
      ...L('M114 262L80 246M316 262L350 246'),
      ...sparks([
        [370, 80, 13],
        [50, 90, 8],
      ]),
    ],
  },
  {
    id: 'plage-vague',
    viewBox: '0 0 400 400',
    kw: ['vague', 'mer', 'océan', 'surf', 'japon'],
    parts: () => [
      fill(circle(200, 200, 168), C.sky),
      fill(circle(286, 120, 32), P.mustard),
      fill(
        'M90 300Q100 170 180 140Q260 130 270 200Q260 240 220 230Q200 200 220 186Q180 176 160 220Q140 280 200 320L90 316Z',
        P.teal,
      ),
      ...L(
        'M90 300Q100 170 180 140Q260 130 270 200Q260 240 220 230Q200 200 220 186Q180 176 160 220Q140 280 200 320',
      ),
      ...L('M80 260Q110 200 160 180M96 290Q120 240 150 226', 2.4),
      ...L(wave(170, 330, 300, 8, 40)),
      ...L(wave(110, 290, 336, 7, 36)),
      ...L(circle(200, 200, 168)),
      ...sparks([[110, 100, 10]]),
    ],
  },
  {
    id: 'plage-crabe',
    viewBox: '0 0 420 340',
    kw: ['crabe', 'plage', 'mer', 'animal'],
    parts: () => [
      `<path d="M150 190L100 124M270 190L320 124" stroke="${P.coral}" stroke-width="18" stroke-linecap="round"/>`,
      leaf(100, 126, 70, -125, P.coral, 0.42),
      leaf(100, 126, 56, -78, P.coral, 0.38),
      leaf(320, 126, 70, -55, P.coral, 0.42),
      leaf(320, 126, 56, -102, P.coral, 0.38),
      ...[0, 1, 2].flatMap((i) => [
        fill(
          `M130 ${210 + i * 26}L60 ${200 + i * 40}L56 ${212 + i * 40}L130 ${226 + i * 26}Z`,
          '#de5a48',
        ),
        fill(
          `M290 ${210 + i * 26}L360 ${200 + i * 40}L364 ${212 + i * 40}L290 ${226 + i * 26}Z`,
          '#de5a48',
        ),
      ]),
      fill(ell(210, 210, 100, 70), P.coral),
      fill(ell(210, 196, 70, 36), P.coralLight),
      fill('M180 150L176 120L184 120Z', '#de5a48'),
      fill('M240 150L236 120L244 120Z', '#de5a48'),
      fill(circle(180, 116, 9), C.dark),
      fill(circle(240, 116, 9), C.dark),
      ...dots(
        [
          [170, 230, 5],
          [210, 244, 5],
          [250, 230, 5],
        ],
        '#de5a48',
      ),
    ],
  },
  {
    id: 'plage-corail',
    viewBox: '0 0 400 400',
    kw: ['corail', 'mer', 'récif', 'plongée', 'océan'],
    parts: () => {
      const branch = (x: number, y: number, s: number, c: string): string[] => {
        const d = `M${x} ${y}L${x - 14 * s} ${y - 120 * s}L${x - 50 * s} ${y - 170 * s}M${x - 10 * s} ${y - 90 * s}L${x + 30 * s} ${y - 150 * s}L${x + 26 * s} ${y - 200 * s}M${x + 22 * s} ${y - 128 * s}L${x + 60 * s} ${y - 160 * s}M${x - 30 * s} ${y - 146 * s}L${x - 20 * s} ${y - 200 * s}`;
        return [
          `<path d="${d}" fill="none" stroke="${c}" stroke-width="${22 * s}" stroke-linecap="round" stroke-linejoin="round"/>`,
        ];
      };
      return [
        ...branch(150, 350, 1.2, P.pink),
        ...branch(270, 350, 0.9, P.coral),
        fill(ell(100, 340, 46, 26), P.mustard),
        ...dots(
          [
            [86, 334, 5],
            [108, 328, 4],
            [118, 346, 5],
          ],
          '#d8a43a',
        ),
        fill(ell(320, 344, 40, 22), P.sage),
        fill('M50 360Q200 340 360 360L360 372L50 372Z', P.sand),
        fill(ell(320, 110, 24, 13), P.teal),
        fill('M300 110L284 98L284 122Z', P.teal),
      ];
    },
  },
  {
    id: 'plage-flamant-rose',
    viewBox: '0 0 360 440',
    kw: ['flamant rose', 'oiseau', 'tropical', 'exotique', 'été'],
    parts: () => [
      bg(180, 230, 140, 170, 240, P.apricot),
      fill('M110 210Q110 150 180 150Q260 160 250 220Q240 260 180 256Q120 254 110 210Z', P.pink),
      fill('M150 170Q200 150 240 200Q210 196 150 170Z', '#f48aa0'),
      ...L('M120 200Q120 120 150 90Q170 50 130 40Q100 36 96 60'),
      fill('M96 54L70 74L92 76Z', INK),
      fill(circle(124, 50, 4), INK),
      ...L('M180 256L180 410M196 254L210 330L176 340'),
      ...L('M164 410L196 410'),
      ...L('M60 414Q180 400 300 414'),
      ...sparks([
        [290, 90, 12],
        [70, 300, 7],
      ]),
      ...dots([[290, 330, 3.5]]),
    ],
  },
  {
    id: 'plage-chateau-de-sable',
    viewBox: '0 0 420 360',
    kw: ['château de sable', 'plage', 'enfant', 'sable', 'été'],
    parts: () => [
      bg(210, 200, 180, 130, 243, P.sand),
      ...L(
        'M80 320L80 200L100 200L100 186L120 186L120 200L140 200L140 186L160 186L160 200L180 200L180 320',
      ),
      ...L(
        'M180 320L180 150L200 150L200 136L220 136L220 150L240 150L240 136L260 136L260 150L280 150L280 320',
      ),
      ...L('M280 320L280 210L300 210L300 196L320 196L320 210L340 210L340 320'),
      ...L('M210 320L210 280Q230 256 250 280L250 320'),
      ...L('M110 240L110 260M150 240L150 260M310 246L310 266'),
      ...L('M230 136L230 80'),
      fill('M230 80L270 92L230 104Z', P.coral),
      ...L('M230 80L270 92L230 104'),
      ...L('M40 324Q210 300 380 324'),
      ...sparks([
        [350, 90, 12],
        [70, 110, 8],
      ]),
      ...dots([[130, 340, 3]]),
    ],
  },
  {
    id: 'plage-mouettes',
    viewBox: '0 0 420 320',
    kw: ['mouette', 'oiseau', 'mer', 'ciel', 'côte'],
    parts: () => [
      bg(210, 160, 170, 120, 246, C.sky),
      fill(circle(290, 200, 54), P.mustard),
      ...L('M110 120Q130 96 150 120Q170 96 190 120'),
      ...L('M200 80Q216 62 232 80Q248 62 264 80'),
      ...L('M280 130Q292 116 304 130Q316 116 328 130'),
      ...L(wave(50, 380, 252, 8, 40)),
      ...L(wave(80, 350, 284, 7, 38)),
      ...sparks([[90, 220, 9]]),
      ...dots([[360, 70, 3.5]]),
    ],
  },
];

// ------------------------------------------------------------------ carnet de voyage

const CARNET: Drawing[] = [
  {
    id: 'carnet-valise-vintage',
    viewBox: '0 0 420 380',
    kw: ['valise', 'vintage', 'bagage', 'voyage', 'autocollants'],
    parts: () => [
      bg(210, 210, 175, 140, 301, C.lightTerra),
      ...L(rrect(70, 120, 280, 200, 18)),
      ...L(rrect(170, 84, 80, 36, 10)),
      ...L('M130 120L130 320M290 120L290 320'),
      ...L('M120 200L140 200M280 200L300 200'),
      fill(circle(200, 200, 26), P.mustard),
      ...L(circle(200, 200, 26)),
      fill(heart(244, 268, 16), P.coral),
      fill(rect(170, 250, 34, 26), P.teal),
      ...L(rect(170, 250, 34, 26)),
      ...L('M90 320L90 336M330 320L330 336'),
      ...sparks([
        [370, 80, 13],
        [50, 100, 8],
      ]),
      ...dots([[60, 300, 3]]),
    ],
  },
  {
    id: 'carnet-sac-a-dos',
    viewBox: '0 0 360 420',
    kw: ['sac à dos', 'randonnée', 'aventure', 'voyage', 'backpack'],
    parts: () => [
      bg(180, 220, 140, 170, 304, P.sage),
      ...L('M96 150Q96 90 180 90Q264 90 264 150L264 360Q264 380 244 380L116 380Q96 380 96 360Z'),
      fill('M96 150Q96 100 180 100Q264 100 264 150L264 196L96 196Z', P.terracotta),
      ...L('M96 150Q96 100 180 100Q264 100 264 150L264 196L96 196Z'),
      ...L(rrect(126, 250, 108, 90, 12)),
      ...L('M126 280L234 280'),
      ...L('M150 90Q150 50 180 50Q210 50 210 90'),
      ...L('M170 196L170 222M190 196L190 222'),
      ...L('M96 230L70 236L70 320L96 326'),
      ...sparks([
        [310, 80, 12],
        [50, 120, 8],
      ]),
    ],
  },
  {
    id: 'carnet-passeport',
    viewBox: '0 0 400 420',
    kw: ['passeport', 'voyage', 'frontière', 'visa', 'papiers'],
    parts: () => [
      fill(rrect(110, 70, 200, 280, 14), P.tealDark),
      fill(rect(110, 70, 20, 280), C.dark),
      `<g fill="none" stroke="${P.mustard}" stroke-width="5">`,
      `<circle cx="220" cy="190" r="50"/>`,
      `<ellipse cx="220" cy="190" rx="22" ry="50"/>`,
      `<path d="M170 190H270M178 164H262M178 216H262"/>`,
      '</g>',
      fill(rect(170, 280, 100, 8), P.mustard),
      fill(rect(186, 300, 68, 6), P.mustard),
      flatLeaf(300, 360, 70, -60, P.sage, 0.34),
      flatLeaf(300, 360, 60, -110, P.leafLight, 0.34),
      flatLeaf(300, 360, 50, -20, P.sage, 0.34),
      fill(sparkle(80, 110, 14), INK),
      fill(sparkle(330, 60, 8), INK),
    ],
  },
  {
    id: 'carnet-billets-avion',
    viewBox: '0 0 440 360',
    kw: ['billet', 'avion', 'vol', 'embarquement', 'voyage'],
    parts: () => {
      const ticket = (accent: string): string[] => [
        fill('M-130 -50H130V-14A14 14 0 0 0 130 14V50H-130V14A14 14 0 0 0 -130 -14Z', C.cream),
        fill('M60 -50H130V-14A14 14 0 0 0 130 14V50H60Z', accent),
        ...L('M-130 -50H130V-14A14 14 0 0 0 130 14V50H-130V14A14 14 0 0 0 -130 -14Z'),
        ...L('M60 -44L60 44', 2),
        ...L('M-110 -20L-10 -20M-110 0L-40 0M-110 20L-60 20', 2.4),
        fill(
          'M-4 2L18 -2L30 -22L36 -22L30 -2L44 -2L50 -10L54 -10L51 2L54 14L50 14L44 6L30 6L36 26L30 26L18 6L-4 2Z',
          INK,
        ),
      ];
      return [
        bg(220, 180, 180, 130, 307, P.peach),
        g(ticket(P.coral), 'translate(200 140) rotate(-8)'),
        g(ticket(P.mustard), 'translate(240 230) rotate(6)'),
        ...sparks([
          [380, 60, 13],
          [50, 300, 8],
        ]),
      ];
    },
  },
  {
    id: 'carnet-carte-boussole',
    viewBox: '0 0 440 380',
    kw: ['carte', 'boussole', 'itinéraire', 'aventure', 'voyage'],
    parts: () => [
      bg(220, 190, 180, 140, 310, P.sand),
      fill('M50 90L150 60L250 90L350 60L350 300L250 330L150 300L50 330Z', C.cream),
      fill('M150 60L250 90L250 330L150 300Z', P.apricot),
      ...L('M50 90L150 60L250 90L350 60L350 300L250 330L150 300L50 330Z'),
      ...L('M150 60L150 300M250 90L250 330'),
      `<path d="M80 280Q120 200 180 220Q240 240 230 160Q226 110 300 110" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="8 8" stroke-linecap="round"/>`,
      ...L('M290 100L310 120M310 100L290 120'),
      fill(circle(80, 280, 8), P.coral),
      fill(circle(350, 290, 52), P.mustard),
      ...L(circle(350, 290, 52)),
      ...L(circle(350, 290, 40), 2),
      fill('M350 254L360 290L350 326L340 290Z', P.coral),
      fill('M350 290L360 290L350 326L340 290Z', INK),
      ...sparks([[400, 80, 10]]),
    ],
  },
  {
    id: 'carnet-globe',
    viewBox: '0 0 360 420',
    kw: ['globe', 'terre', 'monde', 'voyage', 'tour du monde'],
    parts: () => [
      bg(180, 200, 150, 160, 313, P.sage),
      fill(circle(180, 180, 110), C.sky),
      fill('M120 110Q150 100 160 130Q140 150 150 180Q120 190 110 160Q90 140 120 110Z', P.leafLight),
      fill('M200 200Q240 190 250 220Q240 260 210 270Q190 240 200 200Z', P.leafLight),
      fill('M210 100Q240 96 250 120Q230 130 214 122Z', P.leafLight),
      ...L(circle(180, 180, 110)),
      ...L(ell(180, 180, 44, 110), 2.4),
      ...L('M70 180L290 180M86 124L274 124M86 236L274 236', 2.4),
      ...L('M60 180Q60 310 180 310Q300 310 300 180', 3.6),
      ...L('M180 310L180 350M120 370L240 370M180 350L180 370'),
      ...sparks([
        [310, 60, 12],
        [50, 80, 8],
      ]),
    ],
  },
  {
    id: 'carnet-appareil-argentique',
    viewBox: '0 0 420 340',
    kw: ['appareil photo', 'argentique', 'photo', 'vintage', 'souvenir'],
    parts: () => [
      bg(210, 180, 170, 130, 316, P.apricot),
      fill(rect(70, 110, 280, 50), P.terracotta),
      fill(rect(70, 220, 280, 60), P.terracotta),
      ...L(rrect(70, 100, 280, 180, 14)),
      ...L('M70 160L350 160M70 220L350 220'),
      ...L('M100 100L100 80L150 80L150 100'),
      ...L(rect(280, 120, 46, 26)),
      fill(circle(210, 190, 64), C.cream),
      ...L(circle(210, 190, 64)),
      ...L(circle(210, 190, 44)),
      fill(circle(210, 190, 24), C.dark),
      fill(circle(200, 180, 7), C.cream),
      ...L('M70 120Q30 160 70 200', 2.6),
      ...sparks([
        [370, 60, 12],
        [50, 290, 8],
      ]),
    ],
  },
  {
    id: 'carnet-polaroid',
    viewBox: '0 0 380 420',
    kw: ['polaroid', 'photo', 'souvenir', 'instantané', 'washi'],
    parts: () => [
      g(
        [
          fill(rect(-120, -150, 240, 290), C.cream),
          fill(rect(-100, -130, 200, 190), C.sky),
          fill(circle(50, -80, 24), P.mustard),
          fill('M-100 60L-40 -40L10 30L40 0L100 60Z', P.teal),
          fill('M-100 60L-40 -40L-20 -6L-60 60Z', P.tealDark),
          ...L(rect(-120, -150, 240, 290)),
          ...L(rect(-100, -130, 200, 190), 2.4),
        ],
        'translate(190 220) rotate(-5)',
      ),
      fill('M140 60L250 70L246 108L136 98Z', '#f7d27acc'),
      ...sparks([
        [330, 90, 12],
        [50, 360, 8],
      ]),
    ],
  },
  {
    id: 'carnet-carnet-stylo',
    viewBox: '0 0 400 400',
    kw: ['carnet', 'stylo', 'journal', 'écrire', 'notes'],
    parts: () => [
      bg(200, 210, 160, 150, 319, P.sage),
      fill(rrect(100, 80, 190, 250, 10), P.terracotta),
      ...L(rrect(100, 80, 190, 250, 10)),
      ...L('M126 80L126 330'),
      fill(rect(256, 80, 14, 250), P.mustard),
      ...L('M150 140L240 140M150 170L230 170M150 200L210 200', 2.4),
      g(
        [
          fill(rect(-10, -120, 20, 220), P.teal),
          fill('M-10 100L10 100L0 130Z', C.cream),
          ...L('M-10 -120L10 -120L10 100L0 130L-10 100Z'),
        ],
        'translate(320 230) rotate(22)',
      ),
      ...sparks([
        [70, 90, 12],
        [340, 60, 8],
      ]),
    ],
  },
  {
    id: 'carnet-carte-postale',
    viewBox: '0 0 440 340',
    kw: ['carte postale', 'courrier', 'souvenir', 'timbre', 'lettre'],
    parts: () => [
      bg(220, 170, 180, 120, 322, P.peach),
      fill(rect(60, 70, 320, 200), C.cream),
      ...L(rect(60, 70, 320, 200)),
      ...L('M220 90L220 250'),
      ...L('M240 180L350 180M240 210L350 210M240 240L330 240', 2.4),
      ...L('M90 120Q130 100 160 130T200 140M90 160Q130 140 170 170M90 200L180 200', 2.4),
      fill(rect(300, 90, 56, 64), P.coral),
      ...L(rect(300, 90, 56, 64)),
      ...L(circle(300, 150, 26), 2),
      ...L(wave(270, 340, 150, 5, 24), 2),
      ...sparks([[400, 300, 10]]),
    ],
  },
  {
    id: 'carnet-timbre',
    viewBox: '0 0 360 400',
    kw: ['timbre', 'poste', 'courrier', 'palmier', 'collection'],
    parts: () => {
      let d = 'M70 60';
      for (let x = 70; x < 290; x += 22) d += `H${x + 5}a6 6 0 0 0 12 0`;
      d += 'H290';
      for (let y = 60; y < 340; y += 22) d += `V${y + 5}a6 6 0 0 0 0 12`;
      d += 'V340';
      for (let x = 290; x > 70; x -= 22) d += `H${x - 5}a6 6 0 0 0 -12 0`;
      d += 'H70';
      for (let y = 340; y > 60; y -= 22) d += `V${y - 5}a6 6 0 0 0 0 -12`;
      d += 'Z';
      return [
        fill(d, C.cream),
        fill(rect(96, 86, 168, 228), P.apricot),
        fill(circle(210, 150, 28), P.mustard),
        fill('M96 260Q180 240 264 260V314H96Z', P.teal),
        ...L('M150 270Q146 200 130 150'),
        ...[-70, -30, 10, 50, 90].flatMap((a) => {
          const e = pol(130, 150, 46, a);
          const m = pol(130, 150, 26, a - 18);
          return L(`M130 150Q${m.join(' ')} ${e.join(' ')}`);
        }),
        ...L(d, 2.4),
      ];
    },
  },
  {
    id: 'carnet-enveloppe',
    viewBox: '0 0 420 340',
    kw: ['enveloppe', 'lettre', 'courrier', 'amour', 'cachet'],
    parts: () => [
      bg(210, 170, 170, 120, 325, P.apricot),
      ...L(rect(70, 90, 280, 180)),
      ...L('M70 90L210 196L350 90M70 270L176 170M350 270L244 170'),
      fill(circle(210, 196, 28), P.red),
      fill(heart(210, 198, 13), '#b83a2c'),
      ...L('M360 80Q390 60 380 30', 2.4),
      ...sparks([
        [60, 70, 12],
        [380, 290, 8],
      ]),
      ...dots([[40, 220, 3]]),
    ],
  },
  {
    id: 'carnet-chapeau-explorateur',
    viewBox: '0 0 420 300',
    kw: ['chapeau', 'explorateur', 'aventure', 'safari', 'voyage'],
    parts: () => [
      bg(210, 160, 170, 110, 328, P.mustard),
      ...L('M40 200Q210 150 380 200Q300 236 210 232Q120 236 40 200Z'),
      ...L('M120 186Q130 80 210 76Q290 80 300 186'),
      fill('M124 160Q210 144 296 160L298 184Q210 168 122 184Z', P.terracotta),
      ...L('M124 160Q210 144 296 160M122 184Q210 168 298 184'),
      ...L('M210 78Q200 110 210 140'),
      ...sparks([
        [360, 70, 12],
        [60, 90, 7],
      ]),
      ...dots([[340, 260, 3]]),
    ],
  },
  {
    id: 'carnet-jumelles',
    viewBox: '0 0 400 340',
    kw: ['jumelles', 'observer', 'aventure', 'safari', 'oiseaux'],
    parts: () => [
      bg(200, 180, 160, 130, 331, P.sage),
      ...L(rrect(80, 120, 90, 150, 22)),
      ...L(rrect(230, 120, 90, 150, 22)),
      fill(circle(125, 260, 44), C.dark),
      fill(circle(275, 260, 44), C.dark),
      fill(circle(112, 248, 10), C.sky),
      fill(circle(262, 248, 10), C.sky),
      ...L(rect(170, 150, 60, 50)),
      ...L(rrect(96, 90, 58, 30, 8)),
      ...L(rrect(246, 90, 58, 30, 8)),
      ...sparks([
        [350, 70, 12],
        [50, 80, 7],
      ]),
    ],
  },
  {
    id: 'carnet-tente-feu',
    viewBox: '0 0 400 420',
    kw: ['tente', 'camping', 'feu de camp', 'nuit', 'aventure'],
    parts: () => [
      fill('M40 400L40 170Q40 40 200 40Q360 40 360 170L360 400Z', '#c9d6dc'),
      fill('M150 120L50 330L250 330Z', P.mustard),
      fill('M150 120L190 330L250 330Z', P.terracotta),
      ...L('M150 120L50 330L250 330Z'),
      ...L('M150 120L150 100M150 120L190 330M128 330L150 250L172 330'),
      fill('M300 330Q270 300 290 260Q300 280 306 250Q330 290 312 330Z', P.coral),
      fill('M302 330Q290 310 300 290Q306 300 310 290Q318 312 310 330Z', P.mustard),
      ...L('M270 340L340 320M270 320L340 340'),
      ...L('M40 400L40 170Q40 40 200 40Q360 40 360 170L360 400Z'),
      ...L('M60 360Q200 344 340 360'),
      fill('M260 90C246 106 252 130 274 134C258 140 238 128 238 110C238 98 248 90 260 90Z', INK),
      ...sparks([
        [110, 90, 9],
        [320, 150, 7],
      ]),
      ...dots([[200, 80, 3]]),
    ],
  },
  {
    id: 'carnet-lanterne',
    viewBox: '0 0 340 440',
    kw: ['lanterne', 'maroc', 'lumière', 'orient', 'soirée'],
    parts: () => [
      bg(170, 240, 130, 160, 337, P.mustard),
      ...L('M170 40L170 80'),
      ...L(circle(170, 32, 10)),
      ...L('M130 80L210 80L240 140L100 140Z'),
      ...L('M100 140L240 140L220 330L120 330Z'),
      ...L('M120 330L220 330L200 370L140 370Z'),
      ...L('M170 140L170 330M134 140L144 330M206 140L196 330', 2.4),
      fill('M150 220Q170 180 190 220Q170 260 150 220Z', P.coral),
      ...L('M110 180Q170 200 230 180M114 280Q170 300 226 280', 2.2),
      ...L('M170 370L170 400'),
      ...sparks([
        [280, 90, 12],
        [60, 120, 7],
        [270, 330, 8],
      ]),
    ],
  },
  {
    id: 'carnet-epingle-carte',
    viewBox: '0 0 400 400',
    kw: ['épingle', 'carte', 'destination', 'localisation', 'itinéraire'],
    parts: () => [
      bg(200, 240, 160, 120, 340, P.sand),
      `<path d="M60 330Q120 260 200 300Q280 340 340 280" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="8 9" stroke-linecap="round"/>`,
      fill('M200 290Q120 190 120 140Q120 60 200 60Q280 60 280 140Q280 190 200 290Z', P.coral),
      fill(circle(200, 140, 40), C.cream),
      fill(heart(200, 142, 20), P.coral),
      fill(circle(60, 330, 9), INK),
      ...L('M330 290L350 270M330 270L350 290'),
      ...sparks([
        [320, 90, 12],
        [80, 120, 7],
      ]),
    ],
  },
  {
    id: 'carnet-horloges',
    viewBox: '0 0 440 320',
    kw: ['horloge', 'fuseau horaire', 'heure', 'décalage', 'voyage'],
    parts: () => {
      const clock = (
        cx: number,
        cy: number,
        r: number,
        h: number,
        m: number,
        col: string,
      ): string[] => {
        const ticks: string[] = [];
        for (let i = 0; i < 12; i++) {
          const a = pol(cx, cy, r - 8, i * 30);
          const b = pol(cx, cy, r - (i % 3 ? 14 : 20), i * 30);
          ticks.push(`M${a.join(' ')}L${b.join(' ')}`);
        }
        const hh = pol(cx, cy, r * 0.45, h * 30);
        const mm = pol(cx, cy, r * 0.7, m * 6);
        return [
          fill(circle(cx, cy, r), col),
          ...L(circle(cx, cy, r)),
          ...L(ticks.join(''), 2.2),
          ...L(`M${cx} ${cy}L${hh.join(' ')}M${cx} ${cy}L${mm.join(' ')}`),
          fill(circle(cx, cy, 5), INK),
        ];
      };
      return [
        bg(220, 170, 190, 120, 343, P.peach),
        ...clock(140, 170, 90, 10, 10, C.cream),
        ...clock(310, 190, 70, 4, 40, P.sage),
        ...sparks([[400, 60, 11]]),
        ...dots([[50, 290, 3]]),
      ];
    },
  },
  {
    id: 'carnet-boussole',
    viewBox: '0 0 400 400',
    kw: ['boussole', 'rose des vents', 'nord', 'orientation', 'aventure'],
    parts: () => [
      bg(200, 200, 160, 150, 346, P.apricot),
      ...L(circle(200, 200, 130)),
      ...L(circle(200, 200, 112), 2),
      fill(star(200, 200, 100, 4, 0.2), P.terracotta),
      fill(star(200, 200, 66, 4, 0.25, -Math.PI / 4), P.mustard),
      ...L(star(200, 200, 100, 4, 0.2), 2.4),
      fill(circle(200, 200, 10), INK),
      ...L('M192 50L192 30L208 50L208 30', 2.6),
      ...sparks([
        [350, 70, 12],
        [50, 340, 8],
      ]),
    ],
  },
  {
    id: 'carnet-appareil-photo-fleurs',
    viewBox: '0 0 420 360',
    kw: ['appareil photo', 'photo', 'fleurs', 'souvenir', 'voyage'],
    parts: () => [
      fill(rrect(90, 130, 240, 160, 18), P.sage),
      fill(rect(90, 170, 240, 20), P.leafDark),
      fill(rrect(130, 104, 70, 34, 8), P.leafDark),
      fill(circle(210, 220, 58), C.cream),
      fill(circle(210, 220, 40), C.dark),
      fill(circle(196, 206, 9), C.cream),
      fill(rect(286, 146, 28, 16), C.cream),
      ...ring(330, 120, 5, roundPetal(30, 0.6), P.pink, 0),
      fill(circle(330, 120, 9), P.mustard),
      ...ring(96, 290, 5, roundPetal(24, 0.6), P.coral, 20),
      fill(circle(96, 290, 7), P.mustard),
      flatLeaf(340, 140, 50, 70, P.leafLight),
      flatLeaf(110, 300, 44, 30, P.leafLight),
      flatLeaf(80, 280, 44, -150, P.leafLight),
    ],
  },
];

// ------------------------------------------------------------------ saveurs du monde

const SAVEUR: Drawing[] = [
  {
    id: 'saveur-cafe',
    viewBox: '0 0 400 380',
    kw: ['café', 'expresso', 'tasse', 'pause', 'italie'],
    parts: () => [
      bg(200, 210, 160, 140, 404, P.peach),
      fill('M120 170L270 170Q266 270 196 280Q130 270 120 170Z', C.cream),
      ...L('M120 170L270 170Q266 270 196 280Q130 270 120 170Z'),
      ...L('M266 190Q310 186 304 220Q298 250 256 244'),
      ...L('M90 290Q196 316 300 290'),
      fill(ell(196, 172, 74, 10), P.clay),
      ...L(steam(170, 150, 70)),
      ...L(steam(214, 140, 80)),
      ...[
        [80, 330, -30],
        [330, 330, 20],
        [340, 120, 60],
      ].flatMap(([x, y, a]) => [
        `<g transform="translate(${x} ${y}) rotate(${a})">${fill(ell(0, 0, 14, 20), P.clay)}${fill('M0 -18Q-6 0 0 18Q6 0 0 -18Z', P.peach)}</g>`,
      ]),
      ...sparks([[70, 110, 10]]),
    ],
  },
  {
    id: 'saveur-the-menthe',
    viewBox: '0 0 440 380',
    kw: ['thé à la menthe', 'maroc', 'théière', 'verre', 'orient'],
    parts: () => [
      bg(220, 200, 180, 140, 407, P.sand),
      ...L('M120 160Q90 220 120 290L240 290Q270 220 240 160Z'),
      ...L('M140 160Q180 120 220 160'),
      ...L('M180 130L180 106M168 106L192 106'),
      ...L('M120 200Q70 160 60 120'),
      ...L('M240 190Q290 200 280 250Q270 280 240 270'),
      ...L('M110 300L250 300'),
      fill('M300 210L370 210L362 320L308 320Z', '#f6c86ccc'),
      ...L('M300 210L370 210L362 320L308 320Z'),
      flatLeaf(334, 214, 36, -80, P.leaf),
      flatLeaf(334, 214, 32, -130, P.leafLight),
      flatLeaf(334, 214, 30, -30, P.leafLight),
      ...L('M314 250Q336 240 358 250', 2),
      ...sparks([
        [380, 80, 12],
        [60, 330, 7],
      ]),
    ],
  },
  {
    id: 'saveur-sushis',
    viewBox: '0 0 440 320',
    kw: ['sushi', 'maki', 'japon', 'poisson', 'riz'],
    parts: () => {
      const maki = (x: number, y: number): string[] => [
        fill(circle(x, y, 44), C.dark),
        fill(circle(x, y, 34), C.cream),
        fill(circle(x, y, 16), C.salmon),
        fill(circle(x - 4, y + 2, 6), P.leafLight),
      ];
      return [
        ...maki(100, 150),
        ...maki(200, 120),
        fill(ell(310, 190, 76, 30), C.cream),
        fill('M236 176Q310 120 390 176Q390 196 370 196Q310 160 250 196Q236 196 236 176Z', C.salmon),
        fill('M266 160Q310 140 356 160', C.salmon),
        `<path d="M264 154Q300 142 340 152M276 172Q310 160 350 170" fill="none" stroke="${C.cream}" stroke-width="4" stroke-linecap="round"/>`,
        fill(rect(296, 160, 26, 50), C.dark),
        `<path d="M50 260L400 220M60 280L404 244" stroke="${P.terracotta}" stroke-width="9" stroke-linecap="round"/>`,
      ];
    },
  },
  {
    id: 'saveur-ramen',
    viewBox: '0 0 420 380',
    kw: ['ramen', 'nouilles', 'japon', 'bol', 'soupe'],
    parts: () => [
      bg(210, 210, 170, 140, 413, C.lightTerra),
      fill('M70 190L350 190Q340 320 210 320Q80 320 70 190Z', C.cream),
      fill(ell(210, 190, 140, 22), P.mustard),
      ...L('M70 190L350 190Q340 320 210 320Q80 320 70 190Z'),
      ...L(ell(210, 190, 140, 22)),
      ...L('M150 320L270 320L262 340L158 340Z'),
      ...L(wave(110, 300, 236, 6, 30), 2.4),
      ...L(wave(120, 300, 262, 6, 30), 2.4),
      fill(ell(250, 186, 26, 16), C.cream),
      fill(circle(250, 186, 10), '#f2a43a'),
      fill(circle(170, 186, 18), '#f1d7c4'),
      fill(circle(170, 186, 8), P.pink),
      ...L('M260 170L340 60M280 176L360 74'),
      ...L(steam(130, 160, 60)),
      ...sparks([[60, 90, 11]]),
    ],
  },
  {
    id: 'saveur-pizza',
    viewBox: '0 0 400 400',
    kw: ['pizza', 'italie', 'part', 'fromage', 'basilic'],
    parts: () => [
      fill('M200 360L70 90Q200 40 330 90Z', P.mustard),
      fill('M70 90Q200 40 330 90L320 116Q200 70 80 116Z', P.terracotta),
      ...dots(
        [
          [160, 150, 22],
          [240, 160, 20],
          [200, 230, 20],
          [190, 300, 14],
        ],
        P.red,
      ),
      ...dots(
        [
          [156, 146, 4],
          [244, 156, 4],
          [196, 226, 4],
        ],
        '#b83a2c',
      ),
      flatLeaf(130, 200, 40, 40, P.leaf),
      flatLeaf(250, 210, 36, 120, P.leaf),
      flatLeaf(200, 120, 30, 80, P.leafDark),
      fill('M150 260Q160 290 170 296Q174 270 150 260Z', '#f2d06b'),
    ],
  },
  {
    id: 'saveur-pates',
    viewBox: '0 0 420 340',
    kw: ['pâtes', 'spaghetti', 'italie', 'assiette', 'fourchette'],
    parts: () => [
      bg(210, 180, 180, 130, 419, P.mustard),
      ...L(ell(200, 210, 150, 60)),
      ...L(ell(200, 206, 110, 40)),
      ...L(
        'M120 200Q160 170 200 196Q240 220 270 190Q250 230 200 226Q150 222 140 196Q180 180 220 204Q250 214 260 200M150 214Q190 236 230 220',
        2.4,
      ),
      fill(circle(190, 196, 18), P.red),
      fill(circle(222, 210, 14), P.red),
      flatLeaf(206, 190, 22, -40, P.leaf),
      ...L('M330 280L370 90M350 92L346 70M362 94L360 70M374 98L374 74'),
      ...sparks([[60, 80, 11]]),
    ],
  },
  {
    id: 'saveur-paella',
    viewBox: '0 0 440 340',
    kw: ['paella', 'espagne', 'riz', 'crevette', 'fruits de mer'],
    parts: () => [
      fill(ell(210, 190, 170, 100), C.dark),
      fill(ell(210, 186, 150, 84), '#f2b84b'),
      ...dots(
        [
          [140, 170, 6],
          [180, 220, 6],
          [260, 150, 6],
          [290, 210, 6],
          [220, 130, 6],
          [120, 210, 6],
        ],
        P.leafLight,
      ),
      ...dots(
        [
          [200, 180, 9],
          [250, 230, 9],
          [160, 140, 8],
        ],
        P.red,
      ),
      ...[
        [130, 190, 20],
        [230, 160, -30],
        [300, 180, 60],
      ].map(
        ([x, y, a]) =>
          `<g transform="translate(${x} ${y}) rotate(${a})">${fill('M-26 0Q-24 -26 0 -26Q26 -24 26 0Q14 -12 0 -12Q-12 -12 -14 0Z', P.coral)}</g>`,
      ),
      fill('M170 230L230 230L200 270Z', C.lemon),
      fill('M26 190Q26 160 40 150L50 156Q40 170 42 190Z', C.dark),
      fill('M394 190Q394 160 380 150L370 156Q380 170 378 190Z', C.dark),
    ],
  },
  {
    id: 'saveur-cocktail-tropical',
    viewBox: '0 0 380 440',
    kw: ['cocktail', 'tropical', 'ombrelle', 'apéro', 'été'],
    parts: () => [
      bg(190, 240, 150, 170, 425, P.coralLight),
      fill('M110 150L270 150L240 330Q190 350 140 330Z', P.mustard),
      fill('M118 200L262 200L240 330Q190 350 140 330Z', P.coral),
      ...L('M110 150L270 150L240 330Q190 350 140 330Z'),
      ...L('M190 340L190 400M140 404L240 404'),
      ...L('M230 150L290 40'),
      fill('M210 90Q260 30 320 70Z', P.teal),
      ...L('M210 90Q260 30 320 70Z'),
      ...L('M265 56L265 104'),
      fill('M100 160Q100 120 140 120L150 150Z', C.lemon),
      ...L('M100 160Q100 120 140 120L150 150Z'),
      flatLeaf(140, 140, 40, -120, P.leaf),
      ...sparks([
        [320, 140, 12],
        [60, 330, 8],
      ]),
    ],
  },
  {
    id: 'saveur-fruits-tropicaux',
    viewBox: '0 0 440 340',
    kw: ['fruits', 'tropical', 'mangue', 'papaye', 'banane', 'exotique'],
    parts: () => [
      // Papaya half
      fill(ell(120, 200, 80, 110), P.leaf),
      fill(ell(120, 200, 68, 98), '#f6955f'),
      fill(ell(120, 210, 30, 50), '#e8703f'),
      ...dots(
        [
          [112, 190, 5],
          [128, 200, 5],
          [114, 214, 5],
          [128, 226, 5],
          [118, 240, 5],
          [124, 178, 5],
        ],
        C.dark,
      ),
      // Mango
      fill('M240 120Q330 90 350 180Q360 270 270 290Q200 290 210 200Q214 140 240 120Z', '#f5b941'),
      fill('M240 120Q300 110 330 160Q280 140 240 170Z', '#f08a3e'),
      flatLeaf(250, 120, 60, -60, P.leaf),
      // Banana
      fill('M300 300Q390 300 420 210Q410 200 400 214Q380 280 300 280Z', C.lemon),
      fill('M300 290L290 296L296 278Z', C.dark),
      fill(sparkle(400, 80, 12), INK),
    ],
  },
  {
    id: 'saveur-vin-fromage',
    viewBox: '0 0 440 380',
    kw: ['vin', 'fromage', 'raisin', 'apéritif', 'france'],
    parts: () => [
      bg(220, 210, 180, 140, 434, P.sand),
      fill('M80 360L80 190Q80 160 100 150L104 80L124 80L128 150Q148 160 148 190L148 360Z', P.plum),
      ...L('M80 360L80 190Q80 160 100 150L104 80L124 80L128 150Q148 160 148 190L148 360Z'),
      fill(rect(88, 240, 52, 50), C.cream),
      ...L(rect(88, 240, 52, 50)),
      fill('M180 170Q176 240 220 248Q264 240 260 170Z', '#a8325c'),
      ...L('M176 140Q172 240 220 248Q268 240 264 140Z'),
      ...L('M220 248L220 330M186 338Q220 326 254 338'),
      fill('M270 330L390 330L390 280L300 250Z', P.mustard),
      fill('M300 250L390 280L380 270Z', '#f2d06b'),
      ...dots(
        [
          [320, 300, 9],
          [356, 312, 7],
          [374, 292, 5],
        ],
        '#d9a93a',
      ),
      ...dots(
        [
          [330, 180, 14],
          [356, 180, 14],
          [342, 204, 14],
          [370, 204, 14],
          [356, 228, 14],
        ],
        P.plum,
      ),
      flatLeaf(344, 160, 40, -60, P.leaf),
      ...sparks([[400, 80, 10]]),
    ],
  },
  {
    id: 'saveur-macarons',
    viewBox: '0 0 400 380',
    kw: ['macaron', 'pâtisserie', 'paris', 'dessert', 'sucré'],
    parts: () => {
      const mac = (x: number, y: number, c: string, filling: string): string[] => [
        fill(rrect(x - 70, y - 40, 140, 30, 15), c),
        fill(rect(x - 64, y - 12, 128, 14), filling),
        fill(rrect(x - 70, y, 140, 30, 15), c),
      ];
      return [
        ...mac(200, 320, P.pink, C.cream),
        ...mac(200, 244, P.sage, '#f7e3b8'),
        ...mac(200, 168, P.mustard, C.cream),
        ...mac(200, 92, P.apricot, '#e9ab92'),
        fill(sparkle(330, 60, 14), INK),
        fill(sparkle(70, 120, 8), INK),
      ];
    },
  },
  {
    id: 'saveur-glace',
    viewBox: '0 0 340 440',
    kw: ['glace', 'cornet', 'été', 'dessert', 'italie'],
    parts: () => [
      bg(170, 220, 130, 170, 440, P.apricot),
      fill('M110 220L230 220L170 410Z', P.mustard),
      ...L('M110 220L230 220L170 410Z'),
      ...L('M128 260L212 260M144 310L196 310M126 228L196 330M214 228L150 340', 2),
      fill(circle(138, 196, 46), P.pink),
      fill(circle(202, 196, 46), P.sage),
      fill(circle(170, 130, 50), C.cream),
      fill('M150 230Q156 256 162 236Z', P.pink),
      fill(circle(170, 80, 14), P.red),
      ...L('M170 66Q176 46 190 40'),
      ...sparks([
        [290, 90, 12],
        [50, 320, 7],
      ]),
    ],
  },
  {
    id: 'saveur-pasteque',
    viewBox: '0 0 440 300',
    kw: ['pastèque', 'fruit', 'été', 'frais', 'melon'],
    parts: () => {
      const seeds: string[] = [];
      for (let i = 0; i < 9; i++) {
        const p = pol(220, 70, 90 + (i % 2) * 40, 112 + i * 17);
        seeds.push(
          `<g transform="translate(${p[0]} ${p[1]}) rotate(${112 + i * 17})">${fill(ell(0, 0, 5, 10), C.dark)}</g>`,
        );
      }
      return [
        fill('M40 70A180 180 0 0 0 400 70Z', P.leafDark),
        fill('M56 70A164 164 0 0 0 384 70Z', P.leafLight),
        fill('M70 70A150 150 0 0 0 370 70Z', P.pink),
        ...seeds,
        fill(sparkle(400, 230, 12), INK),
      ];
    },
  },
  {
    id: 'saveur-citrons',
    viewBox: '0 0 440 340',
    kw: ['citron', 'agrume', 'sicile', 'frais', 'fruit'],
    parts: () => {
      const segs: string[] = [];
      for (let i = 0; i < 8; i++)
        segs.push(fill(wedge(300, 220, 10, 62, i * 45 + 4, i * 45 + 41), C.lemon));
      return [
        fill(ell(140, 200, 96, 72), C.lemon),
        fill('M44 200Q30 196 34 186Q40 190 50 192Z', '#e6b93a'),
        fill('M236 200Q250 196 246 186Q240 190 230 192Z', '#e6b93a'),
        fill(ell(110, 180, 30, 14), '#fbe58a'),
        fill(circle(300, 220, 82), '#e6b93a'),
        fill(circle(300, 220, 72), '#fbe8a6'),
        ...segs,
        flatLeaf(150, 130, 90, -60, P.leaf),
        flatLeaf(150, 130, 80, -120, P.leafLight),
        fill(sparkle(400, 70, 12), INK),
      ];
    },
  },
  {
    id: 'saveur-olives',
    viewBox: '0 0 440 340',
    kw: ['olive', 'huile', 'méditerranée', 'grèce', 'provence'],
    parts: () => [
      bg(220, 180, 180, 130, 446, P.sage),
      ...L('M40 260Q160 220 260 120'),
      ...[
        [80, 248, -60],
        [120, 234, 30],
        [160, 214, -50],
        [200, 182, 40],
        [230, 152, -40],
      ].flatMap(([x, y, a]) => L(leafPath(x!, y!, 50, a!, 0.22), 2.4)),
      ...dots(
        [
          [140, 250, 14],
          [210, 206, 13],
        ],
        P.leafDark,
      ),
      fill(ell(178, 196, 11, 14), P.plum),
      ...L('M320 300L320 200Q300 170 316 140L316 110L340 110L340 140Q356 170 336 200L336 300Z'),
      fill('M322 300L322 230L334 230L334 300Z', '#e2c25a'),
      ...L('M312 300L344 300'),
      ...sparks([[380, 80, 12]]),
    ],
  },
  {
    id: 'saveur-cafe-croissant',
    viewBox: '0 0 400 400',
    kw: ['café', 'croissant', 'petit déjeuner', 'matin', 'terrasse'],
    parts: () => [
      fill(circle(200, 200, 168), P.apricot),
      ...L(circle(200, 200, 168)),
      ...L('M110 200L230 200Q226 290 170 296Q116 290 110 200Z'),
      ...L('M226 220Q262 218 258 246Q254 268 222 262'),
      ...L('M80 306Q170 330 260 306'),
      ...L(steam(150, 180, 60)),
      ...L(steam(186, 176, 64)),
      fill('M250 300Q256 250 310 240Q350 250 340 300Q320 290 300 296Q280 280 266 300Z', P.mustard),
      ...L('M250 300Q256 250 310 240Q350 250 340 300Q320 290 300 296Q280 280 266 300Z'),
      ...sparks([
        [300, 100, 12],
        [90, 120, 7],
      ]),
    ],
  },
];

export const VOYAGE_B: Drawing[] = [...PLAGE, ...CARNET, ...SAVEUR];
