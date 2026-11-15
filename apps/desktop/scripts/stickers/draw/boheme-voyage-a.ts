/**
 * Bohème, travel theme (monuments, transports, paysages). Same family as `boheme-ligne.ts` and
 * `boheme-fleurs.ts`: thin black line over one soft blob, sparkles and dots; line art with one or
 * two flat colour accents; flat colour scenes inside an arch or a circle (clipped), no white.
 */
import { type Drawing, INK, blob, circle, fill, sparkle, star } from './core.ts';
import { P, leaf, line } from './boheme-kit.ts';

/** Main line width of the set. */
const W = 3.4;
const L = (d: string, w = W): string[] => line(d, w);
const g = (parts: string[], transform: string): string =>
  `<g transform="${transform}">${parts.join('')}</g>`;
const bg = (cx: number, cy: number, rx: number, ry: number, seed: number, colour: string): string =>
  fill(blob(cx, cy, rx, ry, seed), colour);
const sparks = (list: [number, number, number][]): string[] =>
  list.map(([x, y, s]) => fill(sparkle(x, y, s), INK));
const dots = (list: [number, number, number][]): string[] =>
  list.map(([x, y, r]) => fill(circle(x, y, r), INK));
const rect = (x: number, y: number, w: number, h: number): string =>
  `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
/** An arch window or frame: straight sides, round top, open or closed at the bottom. */
const arch = (cx: number, top: number, w: number, bottom: number, close = true): string =>
  `M${cx - w / 2} ${bottom}V${top + w / 2}A${w / 2} ${w / 2} 0 0 1 ${cx + w / 2} ${top + w / 2}V${bottom}${close ? 'Z' : ''}`;
/** Flat shapes clipped to a path (an arch or a circle), drawn without outline. */
const clipped = (id: string, d: string, parts: string[]): string[] => [
  `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>`,
  `<g clip-path="url(#${id})">${parts.join('')}</g>`,
];
/** Water lines: short waves `[x, y, width]`. */
const waves = (list: [number, number, number][], w = 2.6): string[] =>
  list.flatMap(([x, y, l]) => {
    let d = `M${x} ${y}`;
    for (let k = 0; k < l; k += 20) d += `q5 -5 10 0t10 0`;
    return L(d, w);
  });
/** Little seagulls `[x, y, size]`. */
const birds = (list: [number, number, number][]): string[] =>
  list.flatMap(([x, y, s]) =>
    L(`M${x} ${y}q${s / 2} ${-s / 2} ${s} 0q${s / 2} ${-s / 2} ${s} 0`, 2.4),
  );

const SKY = '#cfe3e0';
const PEACH_L = '#fbd9c2';
const SAND_D = '#e7c48a';

export const VOYAGE_A: Drawing[] = [
  // ---------------------------------------------------------------- monuments
  {
    id: 'monument-tour-eiffel',
    viewBox: '0 0 400 420',
    kw: ['tour eiffel', 'paris', 'france', 'monument', 'voyage'],
    parts: () => [
      bg(200, 240, 140, 150, 501, P.peach),
      ...L('M200 22V48'),
      ...L('M192 48H208L210 64H190Z', 3),
      ...L('M192 64Q182 190 112 396M208 64Q218 190 288 396'),
      ...L('M170 160H230M176 150H224', 3),
      ...L('M146 262H254M140 276H260', 3),
      ...L('M150 396Q200 300 250 396'),
      ...L('M196 76L204 92L196 108L204 124L196 140', 2),
      ...L('M184 172L216 196L182 220L218 244L178 262', 2),
      ...L('M216 172L184 196L218 220L182 244L222 262', 2),
      ...L('M132 316L268 316', 2.4),
      ...sparks([
        [312, 92, 14],
        [84, 150, 9],
        [330, 200, 7],
      ]),
      ...dots([
        [100, 92, 3.5],
        [300, 300, 3],
      ]),
    ],
  },
  {
    id: 'monument-arc-de-triomphe',
    viewBox: '0 0 420 380',
    kw: ['arc de triomphe', 'paris', 'france', 'monument'],
    parts: () => [
      bg(210, 200, 170, 140, 502, P.sand),
      ...L(rect(92, 96, 236, 26), 3),
      ...L(rect(100, 122, 220, 22), 3),
      ...L('M100 144H320V350H100Z'),
      ...L(arch(210, 200, 84, 350, false)),
      ...L(arch(132, 236, 30, 300), 2.6),
      ...L(arch(288, 236, 30, 300), 2.6),
      ...L('M100 176H168M252 176H320', 2.4),
      ...L('M112 316H156M264 316H308', 2.4),
      ...L('M80 350H340', 3),
      ...sparks([
        [366, 70, 12],
        [56, 110, 8],
      ]),
      ...dots([[370, 300, 3.5]]),
    ],
  },
  {
    id: 'monument-colisee',
    viewBox: '0 0 440 340',
    kw: ['colisée', 'rome', 'italie', 'monument', 'antique'],
    parts: () => {
      const out: string[] = [bg(220, 180, 190, 130, 503, P.apricot)];
      out.push(...L('M50 300V150Q220 96 390 150V230L360 236V212L330 218V300Z'));
      out.push(...L('M50 300H330', 3));
      for (const [y0, h] of [
        [250, 40],
        [196, 36],
      ] as [number, number][]) {
        for (let k = 0; k < 7; k++) {
          const x = 68 + k * 38;
          const lift = Math.abs(k - 3.4) * 4;
          out.push(...L(arch(x + 10, y0 - h - 8 + lift, 22, y0 + lift * 0.2, false), 2.4));
        }
      }
      out.push(...L('M50 196Q220 152 360 194M50 246Q220 210 330 242', 2.4));
      out.push(...L('M60 158Q220 112 380 156', 2.2));
      out.push(
        ...sparks([
          [400, 70, 12],
          [40, 92, 8],
        ]),
        ...dots([[410, 290, 3.5]]),
      );
      return out;
    },
  },
  {
    id: 'monument-tour-de-pise',
    viewBox: '0 0 360 440',
    kw: ['tour de pise', 'pise', 'italie', 'monument', 'penchée'],
    parts: () => {
      const tower: string[] = [];
      tower.push(...L('M140 400V96H220V400'));
      for (let k = 0; k < 7; k++) {
        const y = 400 - k * 42;
        tower.push(...L(`M134 ${y}H226`, 3));
        for (let c = 0; c < 4; c++)
          tower.push(...L(arch(150 + c * 20, y - 34, 12, y - 6, false), 2));
      }
      tower.push(...L('M150 96V72H210V96', 3), ...L(arch(180, 40, 30, 72), 3));
      return [
        bg(180, 250, 130, 170, 504, P.mustard),
        g(tower, 'rotate(6 180 400)'),
        ...L('M90 410H290', 3),
        ...sparks([
          [300, 90, 13],
          [64, 160, 9],
        ]),
        ...dots([[290, 300, 3.5]]),
      ];
    },
  },
  {
    id: 'monument-big-ben',
    viewBox: '0 0 300 460',
    kw: ['big ben', 'londres', 'angleterre', 'royaume-uni', 'horloge', 'monument'],
    parts: () => [
      bg(150, 260, 110, 180, 505, P.sage),
      ...L('M150 18L130 86H170Z', 3),
      ...L('M124 86H176V120H124Z', 3),
      ...L('M116 120H184V210H116Z'),
      ...L(circle(150, 165, 30), 3),
      ...L('M150 165V146M150 165L164 172', 2.6),
      ...dots([[150, 165, 3]]),
      ...L('M120 210H180V440H120Z'),
      ...L('M140 236V420M160 236V420', 2),
      ...L('M120 280H180M120 340H180M120 400H180', 2.2),
      ...L('M96 440H204', 3),
      ...sparks([
        [240, 80, 12],
        [56, 150, 8],
      ]),
      ...dots([[248, 330, 3.5]]),
    ],
  },
  {
    id: 'monument-sagrada-familia',
    viewBox: '0 0 420 420',
    kw: ['sagrada familia', 'barcelone', 'espagne', 'gaudí', 'monument', 'cathédrale'],
    parts: () => {
      const out: string[] = [bg(210, 230, 170, 160, 506, P.peach)];
      const spires: [number, number, number][] = [
        [110, 150, 26],
        [160, 90, 30],
        [250, 90, 30],
        [300, 150, 26],
      ];
      for (const [x, top, w] of spires) {
        out.push(
          ...L(
            `M${x - w / 2} 300Q${x - w / 2} ${top + 60} ${x} ${top}Q${x + w / 2} ${top + 60} ${x + w / 2} 300`,
          ),
        );
        for (let y = top + 50; y < 290; y += 30) out.push(...dots([[x, y, 2.6]]));
        out.push(...L(circle(x, top - 8, 6), 2.4));
      }
      out.push(...L('M80 300H330V390H80Z'));
      out.push(...L(arch(205, 316, 40, 390, false), 2.8));
      out.push(...L(arch(130, 326, 22, 370), 2.2), ...L(arch(280, 326, 22, 370), 2.2));
      out.push(...L('M60 390H350', 3));
      out.push(
        ...sparks([
          [360, 70, 12],
          [60, 110, 8],
        ]),
      );
      return out;
    },
  },
  {
    id: 'monument-pyramides',
    viewBox: '0 0 440 320',
    kw: ['pyramides', 'égypte', 'désert', 'gizeh', 'monument'],
    parts: () => [
      bg(220, 170, 190, 130, 507, P.mustard),
      ...L(circle(330, 82, 28), 3),
      fill('M150 280L250 120L300 200L340 280Z', SAND_D),
      fill('M250 120L270 280H340L300 200Z', '#d6a762'),
      ...L('M150 280L250 120L350 280'),
      ...L('M250 120L272 280', 2.4),
      fill('M60 280L130 170L200 280Z', SAND_D),
      ...L('M60 280L130 170L200 280'),
      ...L('M130 170L142 280', 2.4),
      ...L('M300 280L340 216L380 280', 3),
      ...L('M30 280H410', 3),
      ...L('M60 300Q140 292 220 300T380 300', 2.4),
      ...sparks([
        [80, 80, 11],
        [180, 60, 7],
      ]),
      ...dots([[400, 150, 3.5]]),
    ],
  },
  {
    id: 'monument-taj-mahal',
    viewBox: '0 0 440 400',
    kw: ['taj mahal', 'inde', 'agra', 'monument', 'dôme'],
    parts: () => [
      bg(220, 210, 180, 160, 508, P.apricot),
      ...L('M220 46V68', 2.6),
      ...dots([[220, 42, 4]]),
      ...L('M170 170Q166 110 220 72Q274 110 270 170Z'),
      ...L('M160 170H280V184H160Z', 3),
      ...L('M120 184H320V320H120Z'),
      ...L(arch(220, 210, 52, 320, false)),
      ...L(arch(150, 220, 26, 268), 2.4),
      ...L(arch(290, 220, 26, 268), 2.4),
      ...L(arch(150, 280, 26, 320, false), 2.4),
      ...L(arch(290, 280, 26, 320, false), 2.4),
      ...L('M134 184Q130 150 150 136Q170 150 166 184', 2.6),
      ...L('M274 184Q270 150 290 136Q310 150 306 184', 2.6),
      ...L('M76 320V150M92 320V150M76 150Q84 130 92 150', 2.6),
      ...L('M348 320V150M364 320V150M348 150Q356 130 364 150', 2.6),
      ...L('M50 320H390', 3),
      ...L('M180 340H260M196 356H244', 2.4),
      ...sparks([
        [392, 80, 12],
        [48, 100, 8],
      ]),
    ],
  },
  {
    id: 'monument-torii',
    viewBox: '0 0 420 380',
    kw: ['torii', 'japon', 'temple', 'shinto', 'monument'],
    parts: () => [
      bg(230, 170, 150, 130, 509, P.sand),
      ...L('M30 330L130 200L180 250L250 150L390 330', 2.6),
      ...L('M226 182L250 150L274 182', 2.2),
      fill('M60 92Q210 118 360 92L354 120Q210 140 66 120Z', P.red),
      fill(rect(100, 154, 220, 16), P.red),
      fill(rect(122, 120, 22, 228), P.red),
      fill(rect(276, 120, 22, 228), P.red),
      fill(rect(198, 120, 24, 34), P.red),
      fill(rect(116, 340, 34, 12), INK),
      fill(rect(270, 340, 34, 12), INK),
      ...L('M40 352H380', 3),
      ...sparks([
        [366, 60, 12],
        [52, 60, 8],
      ]),
      ...dots([[380, 200, 3.5]]),
    ],
  },
  {
    id: 'monument-pagode',
    viewBox: '0 0 360 440',
    kw: ['pagode', 'chine', 'japon', 'asie', 'temple', 'monument'],
    parts: () => {
      const out: string[] = [bg(180, 240, 140, 180, 510, P.sage)];
      out.push(
        ...L('M180 26V70', 2.6),
        ...dots([
          [180, 40, 4],
          [180, 54, 4],
        ]),
      );
      const tiers: [number, number, number][] = [
        [70, 60, 120],
        [140, 80, 190],
        [210, 100, 260],
        [290, 120, 340],
      ];
      let prev = 70;
      for (const [top, half, bottom] of tiers) {
        out.push(
          ...L(
            `M${180 - half - 20} ${top + 30}Q${180 - half} ${top + 22} ${180 - half + 10} ${top + 10}H${180 + half - 10}Q${180 + half} ${top + 22} ${180 + half + 20} ${top + 30}Q180 ${top + 18} ${180 - half - 20} ${top + 30}Z`,
            3,
          ),
        );
        const w = half - 20;
        out.push(
          ...L(
            `M${180 - w} ${top + 26}V${bottom - (top === 290 ? -70 : 10)}M${180 + w} ${top + 26}V${bottom - (top === 290 ? -70 : 10)}`,
            2.8,
          ),
        );
        if (top !== 290)
          out.push(...L(`M${180 - 12} ${top + 40}h24v${bottom - top - 54}h-24Z`, 2.2));
        prev = bottom;
      }
      void prev;
      out.push(...L(arch(180, 350, 40, 410, false), 2.8));
      out.push(...L('M60 410H300', 3));
      out.push(
        ...sparks([
          [300, 80, 12],
          [56, 120, 8],
        ]),
      );
      return out;
    },
  },
  {
    id: 'monument-statue-de-la-liberte',
    viewBox: '0 0 340 460',
    kw: ['statue de la liberté', 'new york', 'états-unis', 'amérique', 'monument'],
    parts: () => [
      bg(170, 230, 130, 190, 511, '#bfe0d5'),
      fill('M212 36Q226 52 216 70Q200 62 212 36Z', P.mustard),
      ...L('M206 72H224L220 84H210Z', 2.6),
      ...L('M214 84L196 168', 3),
      ...L(circle(160, 150, 20), 3),
      ...L('M142 136L128 116M152 130L148 106M166 130L172 106M178 136L194 120M140 146L120 140', 2.4),
      ...L('M196 168Q190 196 184 214M128 176Q112 200 116 232', 3),
      ...L('M136 168Q160 182 190 166L198 330H118Z'),
      ...L('M150 190Q144 260 140 330M172 190Q176 260 180 330', 2.2),
      ...L('M114 214H140V240H114Z', 2.4),
      ...L('M100 330H220L230 380H90Z'),
      ...L('M80 380H240V430H80Z'),
      ...L('M104 396H216', 2.2),
      ...sparks([
        [270, 70, 12],
        [56, 120, 8],
        [276, 200, 7],
      ]),
      ...dots([[60, 300, 3.5]]),
    ],
  },
  {
    id: 'monument-golden-gate',
    viewBox: '0 0 460 320',
    kw: ['golden gate', 'san francisco', 'californie', 'pont', 'monument'],
    parts: () => [
      bg(230, 160, 200, 120, 512, P.apricot),
      ...L('M20 190Q80 230 130 100Q230 230 330 100Q380 230 440 190', 2.6),
      fill(rect(120, 70, 18, 180), P.red),
      fill(rect(320, 70, 18, 180), P.red),
      fill(rect(116, 100, 26, 8), '#b8382a'),
      fill(rect(316, 100, 26, 8), '#b8382a'),
      fill(rect(116, 150, 26, 8), '#b8382a'),
      fill(rect(316, 150, 26, 8), '#b8382a'),
      ...L('M20 200H440', 3),
      ...L('M160 150V198M190 170V198M220 182V198M250 182V198M280 170V198M300 150V198', 1.8),
      ...waves([
        [60, 270, 120],
        [250, 284, 140],
        [150, 300, 100],
      ]),
      ...birds([
        [390, 70, 14],
        [410, 90, 10],
      ]),
      ...sparks([[60, 70, 11]]),
    ],
  },
  {
    id: 'monument-opera-de-sydney',
    viewBox: '0 0 460 320',
    kw: ['opéra de sydney', 'sydney', 'australie', 'monument'],
    parts: () => [
      bg(230, 170, 200, 120, 513, P.sage),
      ...L('M90 230Q110 120 190 80Q170 150 180 230'),
      ...L('M150 230Q170 140 250 110Q230 170 240 230'),
      ...L('M220 230Q250 150 320 130Q300 180 310 230'),
      ...L('M290 230Q320 170 370 160Q352 200 360 230'),
      ...L('M130 200Q160 130 190 80M200 200Q220 150 250 110M270 206Q290 160 320 130', 2),
      ...L('M60 230H400V250H60Z', 3),
      ...waves([
        [70, 280, 140],
        [240, 290, 140],
      ]),
      ...birds([[380, 80, 14]]),
      ...sparks([
        [80, 80, 11],
        [400, 120, 7],
      ]),
    ],
  },
  {
    id: 'monument-moulin-a-vent',
    viewBox: '0 0 400 440',
    kw: ['moulin', 'moulin à vent', 'pays-bas', 'hollande', 'campagne'],
    parts: () => {
      const blades: string[] = [];
      for (let k = 0; k < 4; k++) {
        blades.push(
          g(
            [
              ...L('M0 0V-150', 3),
              ...L('M6 -30H40V-146H6Z', 2.6),
              ...L('M6 -60H40M6 -90H40M6 -120H40M23 -30V-146', 1.8),
            ],
            `translate(200 150) rotate(${20 + k * 90})`,
          ),
        );
      }
      return [
        bg(200, 240, 160, 170, 514, P.mustard),
        ...L('M150 400L166 170H234L250 400'),
        ...L('M156 176L200 120L244 176', 3),
        ...L(arch(200, 330, 34, 400, false), 2.8),
        ...L(rect(188, 230, 24, 30), 2.4),
        ...blades,
        ...L(circle(200, 150, 8), 3),
        ...L('M60 400H340', 3),
        ...L('M80 420Q200 410 320 420', 2.4),
        ...sparks([[350, 70, 11]]),
      ];
    },
  },
  {
    id: 'monument-phare',
    viewBox: '0 0 360 460',
    kw: ['phare', 'bretagne', 'mer', 'côte', 'océan'],
    parts: () => [
      bg(180, 240, 140, 190, 515, P.sand),
      fill('M146 190H214L218 240H142Z', P.red),
      fill('M138 290H222L226 340H134Z', P.red),
      ...L('M150 190L130 390H230L210 190'),
      ...L('M142 240H218M138 290H222M134 340H226', 2.4),
      ...L('M140 190H220V176H140Z', 3),
      ...L('M152 176V136H208V176', 3),
      ...L('M152 150H208', 2.2),
      ...L('M144 136Q180 100 216 136Z', 3),
      ...L('M180 106V92', 2.6),
      ...L('M120 150L60 130M120 162L60 170M240 150L300 130M240 162L300 170', 2.4),
      ...L(arch(180, 352, 22, 390, false), 2.4),
      ...L('M80 390Q100 370 130 390M230 390Q260 366 290 390', 3),
      ...waves([
        [50, 416, 120],
        [200, 430, 120],
      ]),
      ...birds([
        [280, 70, 14],
        [76, 80, 10],
      ]),
    ],
  },
  {
    id: 'monument-chateau',
    viewBox: '0 0 440 400',
    kw: ['château', 'conte', 'princesse', 'loire', 'monument'],
    parts: () => {
      const tower = (x: number, top: number, w: number, bottom: number): string[] => [
        ...L(`M${x - w / 2} ${bottom}V${top}H${x + w / 2}V${bottom}`),
        ...L(`M${x - w / 2 - 8} ${top}L${x} ${top - w * 1.3}L${x + w / 2 + 8} ${top}Z`, 3),
        ...L(`M${x} ${top - w * 1.3}V${top - w * 1.3 - 22}l18 6l-18 6`, 2.4),
        ...L(arch(x, top + 24, 12, top + 50), 2.2),
      ];
      return [
        bg(220, 220, 180, 160, 516, P.peach),
        ...tower(110, 180, 48, 350),
        ...tower(330, 180, 48, 350),
        ...tower(220, 110, 60, 220),
        ...L('M134 350V230H306V350'),
        ...L('M134 230v-14h20v14h20v-14h20v14h20v-14h20v14h20v-14h20v14h20v-14h12', 2.6),
        ...L(arch(220, 280, 50, 350, false)),
        ...L('M196 300H244M196 320H244', 1.8),
        ...L('M60 350H380', 3),
        ...sparks([
          [390, 80, 12],
          [44, 100, 8],
        ]),
        ...dots([[60, 220, 3.5]]),
      ];
    },
  },
  {
    id: 'monument-mont-saint-michel',
    viewBox: '0 0 400 400',
    kw: ['mont-saint-michel', 'normandie', 'bretagne', 'abbaye', 'france'],
    parts: () => [
      bg(200, 200, 150, 140, 517, P.apricot),
      ...L(circle(200, 200, 150)),
      ...L('M200 74V112', 2.6),
      ...L('M194 112H206L210 150H190Z', 2.6),
      ...L('M170 150H230V180H170Z', 2.8),
      ...L('M176 150L200 130L224 150', 2.4),
      ...L('M90 270Q120 236 150 220L160 180H240L250 220Q280 236 310 270'),
      ...L('M120 248H280M140 230H260', 2),
      ...L('M150 200h10v14h-10zM180 196h10v14h-10zM210 196h10v14h-10zM240 200h10v14h-10z', 1.8),
      ...L('M56 270H344', 3),
      ...waves([
        [90, 300, 100],
        [200, 314, 100],
        [130, 330, 120],
      ]),
      ...birds([
        [110, 120, 14],
        [290, 110, 10],
      ]),
      ...sparks([[370, 60, 11]]),
    ],
  },
  {
    id: 'monument-acropole',
    viewBox: '0 0 440 340',
    kw: ['acropole', 'parthénon', 'athènes', 'grèce', 'antique', 'monument'],
    parts: () => {
      const out: string[] = [bg(220, 180, 190, 130, 518, P.sand)];
      out.push(...L('M100 140L220 86L340 140Z'));
      out.push(...L('M96 140H344V156H96Z', 3));
      for (let k = 0; k < 8; k++) {
        const x = 112 + k * 31;
        out.push(...L(`M${x} 156V250M${x + 14} 156V250`, 2.4));
      }
      out.push(...L('M90 250H350V262H90ZM80 262H360V274H80Z', 3));
      out.push(...L('M30 300Q120 268 200 284Q300 262 410 300', 3));
      out.push(...L('M196 120h48', 2));
      out.push(...leafSprig(370, 300));
      out.push(
        ...sparks([
          [390, 80, 12],
          [50, 90, 8],
        ]),
      );
      return out;
    },
  },
  {
    id: 'monument-machu-picchu',
    viewBox: '0 0 400 440',
    kw: ['machu picchu', 'pérou', 'inca', 'andes', 'montagne', 'monument'],
    parts: () => {
      const frame = arch(200, 40, 280, 420);
      return [
        bg(200, 240, 160, 190, 520, P.sage),
        ...clipped('c-machu', frame, [
          fill('M40 420V20H360V420Z', '#dcebe3'),
          fill('M180 420L250 140L290 190L330 420Z', P.leaf),
          fill('M250 140L270 160L262 420H330L290 190Z', P.leafDark),
          fill('M60 420L120 240L190 300L230 420Z', P.leafLight),
          fill('M60 330H210V420H60Z', '#8fb98a'),
        ]),
        ...L('M70 330H210M74 350H200M78 370H196M82 390H194', 2),
        ...L('M96 316v-14h18v14M130 316v-18h22v18M168 316v-14h18v14', 2.2),
        ...L(frame),
        ...birds([
          [110, 110, 14],
          [140, 90, 10],
        ]),
        ...sparks([
          [360, 60, 11],
          [40, 140, 8],
        ]),
      ];
    },
  },
  {
    id: 'monument-christ-redempteur',
    viewBox: '0 0 400 440',
    kw: ['christ rédempteur', 'rio', 'brésil', 'corcovado', 'monument'],
    parts: () => [
      bg(200, 220, 160, 170, 521, P.apricot),
      ...L(circle(200, 92, 14), 3),
      ...L('M200 106V120'),
      ...L('M80 136H320L316 148H220L226 300H174L180 148H84Z'),
      ...L('M200 150V300M190 170L210 170', 2),
      ...L('M186 300L180 324H220L214 300', 3),
      ...L('M40 420Q120 340 170 324H230Q280 340 360 420'),
      ...L('M110 380Q140 360 170 360M300 390Q270 370 240 366', 2.2),
      ...birds([
        [300, 220, 14],
        [330, 240, 10],
      ]),
      ...sparks([
        [340, 70, 12],
        [60, 80, 8],
      ]),
      ...dots([[70, 260, 3.5]]),
    ],
  },
  {
    id: 'monument-dome-mosquee',
    viewBox: '0 0 420 400',
    kw: ['mosquée', 'dôme', 'orient', 'istanbul', 'maroc', 'monument'],
    parts: () => [
      bg(210, 210, 170, 160, 522, P.sand),
      fill('M150 180Q146 110 210 80Q274 110 270 180Z', P.teal),
      ...L('M150 180Q146 110 210 80Q274 110 270 180Z'),
      ...L('M210 80V58', 2.6),
      ...L('M216 40A12 12 0 1 0 216 58A9 9 0 1 1 216 40Z', 2.4),
      ...L('M130 180H290V340H130Z'),
      ...L(arch(210, 230, 50, 340, false)),
      ...L(arch(160, 236, 24, 290), 2.4),
      ...L(arch(260, 236, 24, 290), 2.4),
      ...L('M70 340V140M90 340V140M70 140L80 108L90 140', 2.6),
      ...L('M330 340V140M350 340V140M330 140L340 108L350 140', 2.6),
      ...L('M70 200H90M330 200H350', 2),
      ...L('M50 340H370', 3),
      ...sparks([
        [380, 70, 12],
        [44, 80, 8],
        [300, 60, 7],
      ]),
    ],
  },
  {
    id: 'monument-maisons-colorees',
    viewBox: '0 0 460 360',
    kw: ['maisons', 'colorées', 'village', 'burano', 'ville', 'façades'],
    parts: () => {
      const houses: [number, number, number, string, string][] = [
        [40, 70, 130, P.coral, '#c95543'],
        [110, 80, 100, P.mustard, '#c99a2e'],
        [190, 72, 150, P.teal, P.tealDark],
        [262, 76, 110, P.pink, '#c5506a'],
        [338, 82, 130, P.sage, '#7e9c8d'],
      ];
      const out: string[] = [];
      for (const [x, w, top, c, dark] of houses) {
        out.push(fill(`M${x} 330V${top}L${x + w / 2} ${top - 34}L${x + w} ${top}V330Z`, c));
        for (let row = 0; row < 3; row++) {
          const y = top + 20 + row * 50;
          if (y > 270) break;
          out.push(
            fill(arch(x + w * 0.3, y, 14, y + 30), dark),
            fill(arch(x + w * 0.7, y, 14, y + 30), dark),
          );
        }
        out.push(fill(arch(x + w / 2, 290, 22, 330), dark));
      }
      out.push(fill('M30 330H430V344H30Z', P.clay));
      out.push(
        ...sparks([
          [420, 60, 12],
          [40, 70, 8],
        ]),
      );
      return out;
    },
  },
  // ---------------------------------------------------------------- transports
  {
    id: 'transport-avion',
    viewBox: '0 0 460 300',
    kw: ['avion', 'vol', 'voyage', 'vacances', 'aéroport'],
    parts: () => [
      bg(240, 150, 190, 110, 531, P.peach),
      ...L('M90 160Q90 136 120 134H330Q380 134 400 156Q380 176 330 176H120Q90 176 90 160Z'),
      ...L('M220 134L180 70H206L270 134', 3),
      ...L('M220 176L190 236H214L268 176', 3),
      ...L('M108 134L92 98H112L140 134', 3),
      ...L('M370 140Q384 146 392 156', 2.4),
      ...dots([
        [170, 152, 4],
        [196, 152, 4],
        [222, 152, 4],
        [248, 152, 4],
        [274, 152, 4],
        [300, 152, 4],
      ]),
      `<path d="M30 230Q60 200 86 186" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="8 8"/>`,
      ...L('M330 250q8 -16 24 -10q8 -14 24 -4q16 0 14 14H330Z', 2.4),
      ...L('M60 90q6 -12 18 -8q8 -12 22 -2q12 0 10 10H60Z', 2.4),
      ...sparks([
        [410, 70, 12],
        [40, 150, 7],
      ]),
    ],
  },
  {
    id: 'transport-montgolfiere-a-plat',
    viewBox: '0 0 360 460',
    kw: ['montgolfière', 'ballon', 'ciel', 'voyage', 'aventure'],
    parts: () => [
      fill(
        'M180 40C90 40 60 130 96 200C120 246 150 270 162 300H198C210 270 240 246 264 200C300 130 270 40 180 40Z',
        P.coral,
      ),
      fill(
        'M180 40C140 40 124 130 140 200C150 246 160 270 166 300H194C200 270 210 246 220 200C236 130 220 40 180 40Z',
        P.mustard,
      ),
      fill(
        'M180 40C166 40 160 130 166 200C170 246 174 270 176 300H184C186 270 190 246 194 200C200 130 194 40 180 40Z',
        P.teal,
      ),
      fill('M86 150Q180 172 274 150L270 172Q180 192 90 172Z', P.plum),
      fill('M164 300H196L192 314H168Z', P.clay),
      ...L('M166 314L156 360M194 314L204 360', 2),
      fill('M150 360H210L204 396H156Z', P.clay),
      fill('M150 360H210V368H150Z', '#8f533f'),
      fill('M40 300q8 -16 26 -12q10 -16 30 -6q18 0 16 18H40Z', P.sand),
      fill('M250 420q8 -16 26 -12q10 -16 30 -6q18 0 16 18H250Z', P.sand),
      ...sparks([
        [300, 60, 12],
        [50, 100, 8],
        [300, 330, 7],
      ]),
    ],
  },
  {
    id: 'transport-van-boheme',
    viewBox: '0 0 460 340',
    kw: ['van', 'combi', 'road trip', 'surf', 'camping', 'bohème'],
    parts: () => [
      bg(230, 180, 200, 130, 533, P.mustard),
      fill('M76 196H384V250Q384 262 372 262H88Q76 262 76 250Z', P.teal),
      ...L('M76 250V140Q76 100 120 96H340Q384 100 384 150V250Q384 262 372 262H88Q76 262 76 250Z'),
      ...L('M76 196H384'),
      ...L('M100 116H160V170H100ZM180 116H240V170H180ZM260 116H310V170H260Z', 2.8),
      ...L('M326 116H352Q366 120 366 140V170H326Z', 2.8),
      ...L('M230 210Q230 196 230 196', 2),
      ...L(circle(230, 226, 14), 2.6),
      ...L(circle(140, 268, 26)),
      ...L(circle(320, 268, 26)),
      fill(circle(140, 268, 10), INK),
      fill(circle(320, 268, 10), INK),
      fill('M110 82Q250 62 370 82Q250 94 110 82Z', P.coral),
      ...L('M110 82Q250 62 370 82Q250 94 110 82Z', 2.4),
      ...L('M150 88V96M330 88V96', 2.4),
      ...L('M40 296H420', 3),
      ...sparks([
        [420, 70, 12],
        [40, 90, 8],
      ]),
    ],
  },
  {
    id: 'transport-voiture-ancienne',
    viewBox: '0 0 460 300',
    kw: ['voiture', 'ancienne', 'vintage', 'rétro', 'road trip'],
    parts: () => [
      bg(230, 160, 200, 110, 534, P.apricot),
      fill(
        'M70 200Q70 160 110 156L150 150L180 100H290L330 150L380 160Q404 168 404 200V214H70Z',
        P.coral,
      ),
      ...L('M70 200Q70 160 110 156L150 150L180 100H290L330 150L380 160Q404 168 404 200V214H70Z'),
      ...L('M164 150L190 112H234V150ZM248 112H284L310 150H248Z', 2.8),
      ...L('M70 214H404', 3),
      ...L('M86 182H110M380 182H396', 2.6),
      ...L(circle(130, 222, 30)),
      ...L(circle(340, 222, 30)),
      fill(circle(130, 222, 11), INK),
      fill(circle(340, 222, 11), INK),
      ...L('M240 166h20', 2.6),
      ...L('M30 256H430', 3),
      ...sparks([
        [410, 70, 12],
        [50, 80, 8],
      ]),
      ...dots([[440, 180, 3.5]]),
    ],
  },
  {
    id: 'transport-vespa',
    viewBox: '0 0 420 340',
    kw: ['vespa', 'scooter', 'italie', 'balade', 'dolce vita'],
    parts: () => [
      bg(210, 180, 180, 130, 535, P.sage),
      fill('M110 250Q100 190 150 180H220L240 120H262L250 186Q300 200 300 250Z', P.teal),
      ...L('M110 250Q100 190 150 180H220L240 120H262L250 186Q300 200 300 250Z'),
      ...L('M150 180Q160 156 200 158Q216 160 220 180', 3),
      ...L('M240 120L232 96M222 96H260', 3),
      ...L('M300 250Q320 200 290 170', 3),
      ...L(circle(130, 262, 30)),
      ...L(circle(312, 262, 30)),
      fill(circle(130, 262, 10), INK),
      fill(circle(312, 262, 10), INK),
      ...L('M110 250H300', 2.4),
      fill(circle(276, 140, 8), P.mustard),
      ...L('M60 300H360', 3),
      ...sparks([
        [370, 70, 12],
        [50, 90, 8],
      ]),
    ],
  },
  {
    id: 'transport-velo-panier',
    viewBox: '0 0 440 340',
    kw: ['vélo', 'bicyclette', 'panier', 'fleurs', 'balade'],
    parts: () => [
      bg(220, 180, 190, 130, 536, P.peach),
      ...L(circle(110, 244, 56)),
      ...L(circle(330, 244, 56)),
      fill(circle(110, 244, 5), INK),
      fill(circle(330, 244, 5), INK),
      ...L('M110 244L180 170H290L330 244M180 170L222 244L290 170M222 244H110', 3),
      ...L('M170 170L160 146M146 146H184', 3),
      ...L('M290 170L300 120H330', 3),
      ...L('M300 126H360L350 170H310Z', 2.8),
      ...L('M312 136H350M314 150H346', 1.8),
      fill(circle(316, 112, 12), P.coral),
      fill(circle(338, 104, 12), P.mustard),
      fill(circle(356, 116, 10), P.pink),
      leaf(318, 120, 26, -150, P.leaf),
      leaf(346, 118, 26, -30, P.leaf),
      fill(circle(316, 112, 4), P.plum),
      fill(circle(338, 104, 4), P.plum),
      ...L('M40 300H400', 3),
      ...sparks([
        [400, 60, 12],
        [50, 80, 8],
      ]),
    ],
  },
  {
    id: 'transport-train-vapeur',
    viewBox: '0 0 460 320',
    kw: ['train', 'locomotive', 'vapeur', 'rails', 'voyage'],
    parts: () => [
      bg(230, 170, 200, 120, 537, P.sand),
      ...L('M110 230V150H190V100H260V150H340Q380 150 380 190V230Z'),
      ...L('M200 112H250V150H200Z', 2.8),
      ...L('M130 150V112H160V150', 3),
      ...L('M120 112H170', 3),
      ...L('M380 214L410 236H360', 3),
      ...L(circle(150, 246, 20)),
      ...L(circle(220, 246, 20)),
      ...L(circle(300, 240, 28)),
      ...L('M150 246H300', 2.4),
      ...L(circle(146, 74, 16), 2.6),
      ...L(circle(124, 46, 20), 2.6),
      ...L(circle(92, 30, 14), 2.6),
      fill(circle(370, 170, 8), P.mustard),
      ...L(
        'M30 270H430M60 284V270M120 284V270M180 284V270M240 284V270M300 284V270M360 284V270',
        2.4,
      ),
      ...sparks([
        [410, 70, 12],
        [40, 140, 7],
      ]),
    ],
  },
  {
    id: 'transport-tramway',
    viewBox: '0 0 420 380',
    kw: ['tramway', 'tram', 'lisbonne', 'ville', 'voyage'],
    parts: () => [
      bg(210, 200, 180, 150, 538, P.apricot),
      fill('M90 180H330V300H90Z', P.mustard),
      fill('M90 290H330V306H90Z', P.red),
      ...L('M80 120H340Q350 120 350 130V306H70V130Q70 120 80 120Z'),
      ...L('M70 180H350', 3),
      ...L(
        'M96 138H140V176H96ZM156 138H200V176H156ZM216 138H260V176H216ZM276 138H320V176H276Z',
        2.6,
      ),
      ...L('M200 190H230V290H200Z', 2.6),
      ...L('M210 120L180 70H260', 2.6),
      ...L('M30 60H390', 2),
      ...L(circle(120, 316, 14)),
      ...L(circle(300, 316, 14)),
      ...L('M30 336H390', 3),
      ...sparks([
        [380, 100, 11],
        [40, 120, 7],
      ]),
    ],
  },
  {
    id: 'transport-voilier',
    viewBox: '0 0 400 420',
    kw: ['voilier', 'bateau', 'voile', 'mer', 'croisière'],
    parts: () => [
      bg(200, 220, 160, 170, 539, P.apricot),
      ...L('M200 50V300'),
      ...L('M210 70Q290 160 300 270H210Z'),
      ...L('M190 90Q130 180 110 270H190Z'),
      fill('M212 272Q290 260 298 270H212Z', P.coral),
      ...L('M200 50l26 8l-26 8', 2.4),
      fill('M90 300H320L290 340H120Z', P.clay),
      ...L('M90 300H320L290 340H120Z'),
      ...waves([
        [60, 370, 120],
        [220, 360, 120],
        [140, 390, 120],
      ]),
      ...birds([
        [300, 90, 14],
        [330, 110, 10],
      ]),
      ...sparks([[90, 80, 11]]),
    ],
  },
  {
    id: 'transport-gondole',
    viewBox: '0 0 460 320',
    kw: ['gondole', 'venise', 'italie', 'canal', 'bateau'],
    parts: () => [
      bg(230, 170, 200, 120, 540, P.sage),
      fill('M40 220Q60 250 200 250H330Q400 246 420 160Q400 210 330 220H120Q70 220 40 200Z', INK),
      ...L('M396 176l18 -6M400 190l18 -6', 2.4),
      ...L('M170 214V160', 2.6),
      ...L(circle(170, 142, 12), 2.6),
      ...L('M158 160H182V200H158Z', 2.6),
      ...L('M166 160V200M174 160V200', 1.6),
      ...L('M176 170L240 120M200 230L250 100', 2.6),
      fill('M150 134h40v-6h-40z', P.red),
      ...waves([
        [60, 280, 140],
        [240, 290, 140],
        [150, 304, 100],
      ]),
      ...sparks([
        [410, 70, 12],
        [50, 90, 8],
      ]),
    ],
  },
  {
    id: 'transport-telepherique',
    viewBox: '0 0 420 400',
    kw: ['téléphérique', 'montagne', 'ski', 'cabine', 'alpes'],
    parts: () => [
      bg(210, 220, 180, 160, 542, '#cfe3e0'),
      ...L('M30 370L140 220L200 280L280 160L400 370', 3),
      ...L('M256 192L280 160L304 192L290 186L280 196L268 186Z', 2.2),
      ...L('M20 60L400 170', 2.4),
      ...L('M196 114V140', 2.4),
      fill(
        'M150 140H244Q250 140 250 150V214Q250 222 242 222H152Q144 222 144 214V150Q144 140 150 140Z',
        P.coral,
      ),
      ...L(
        'M150 140H244Q250 140 250 150V214Q250 222 242 222H152Q144 222 144 214V150Q144 140 150 140Z',
      ),
      ...L('M158 154H190V186H158ZM204 154H236V186H204Z', 2.4),
      ...L('M30 370H400', 3),
      ...sparks([
        [360, 60, 12],
        [50, 130, 8],
      ]),
    ],
  },
  {
    id: 'transport-dirigeable',
    viewBox: '0 0 460 300',
    kw: ['dirigeable', 'zeppelin', 'ciel', 'aventure', 'vintage'],
    parts: () => [
      bg(230, 150, 200, 110, 543, P.peach),
      ...L('M70 130Q70 70 220 70Q370 70 390 130Q370 190 220 190Q70 190 70 130Z'),
      ...L('M110 90Q220 110 360 96M100 160Q220 150 360 162M80 130H390', 2.2),
      ...L('M380 110L420 80V180L380 150', 3),
      ...L('M180 190L190 220H250L260 190', 3),
      fill('M190 220H250V236H190Z', P.mustard),
      ...L('M190 220H250V236H190Z', 2.6),
      ...L('M30 250q8 -14 24 -10q8 -14 24 -4q14 0 12 14H30Z', 2.4),
      ...L('M340 250q8 -14 24 -10q8 -14 24 -4q14 0 12 14H340Z', 2.4),
      ...sparks([
        [60, 60, 12],
        [420, 220, 7],
      ]),
    ],
  },
  {
    id: 'transport-sac-a-dos-route',
    viewBox: '0 0 400 440',
    kw: ['sac à dos', 'route', 'randonnée', 'backpacker', 'aventure', 'voyage'],
    parts: () => [
      bg(200, 230, 160, 180, 544, P.mustard),
      ...L('M40 200L130 120L190 170L270 90L370 200', 2.6),
      ...L('M150 420Q190 340 200 280Q206 230 214 200M250 420Q230 340 224 280Q222 230 222 200', 2.4),
      fill(
        'M140 230Q140 196 200 196Q260 196 260 230V370Q260 384 246 384H154Q140 384 140 370Z',
        P.clay,
      ),
      ...L('M140 230Q140 196 200 196Q260 196 260 230V370Q260 384 246 384H154Q140 384 140 370Z'),
      ...L('M160 290H240V350H160Z', 2.8),
      ...L('M160 310H240', 2.2),
      ...L('M176 196Q176 170 200 170Q224 170 224 196', 3),
      ...L('M140 250Q120 280 130 340M260 250Q280 280 270 340', 2.6),
      fill('M150 384H250V400H150Z', P.sage),
      ...L('M150 384H250V400H150Z', 2.4),
      ...sparks([
        [350, 80, 12],
        [50, 120, 8],
      ]),
    ],
  },
  {
    id: 'transport-avion-medaillon',
    viewBox: '0 0 400 400',
    kw: ['avion', 'tour du monde', 'globe', 'voyage', 'médaillon'],
    parts: () => [
      bg(200, 200, 150, 140, 545, P.sand),
      ...L(circle(200, 200, 120)),
      ...L('M80 200H320M200 80V320', 2),
      ...L('M110 130Q200 160 290 130M110 270Q200 240 290 270', 2),
      ...L('M200 80Q140 200 200 320M200 80Q260 200 200 320', 2),
      `<path d="M60 300Q20 200 90 110Q160 40 260 60" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="8 9"/>`,
      g(
        [
          fill(
            'M-34 4L-6 0L10 -26L18 -26L10 0L28 0L36 -10L42 -10L38 4L42 18L36 18L28 8L10 8L18 34L10 34L-6 8L-34 4Z',
            P.coral,
          ),
        ],
        'translate(300 74) rotate(14) scale(1.1)',
      ),
      ...sparks([
        [350, 330, 12],
        [50, 60, 8],
      ]),
    ],
  },
  // ---------------------------------------------------------------- paysages
  {
    id: 'paysage-montagnes-lac',
    viewBox: '0 0 400 440',
    kw: ['montagne', 'lac', 'reflet', 'nature', 'randonnée', 'paysage'],
    parts: () => {
      const frame = arch(200, 40, 280, 420);
      return [
        bg(200, 240, 160, 190, 551, P.sage),
        fill(circle(260, 150, 28), P.mustard),
        ...L('M60 290L140 170L180 220L240 140L340 290', W),
        ...L('M124 194L140 170L156 194L146 188L140 198L132 188Z', 2.2),
        ...L('M224 164L240 140L256 164L246 158L240 168L232 158Z', 2.2),
        ...L('M60 290H340', 3),
        ...L('M100 310H300M130 330H270M160 350H240', 2.2),
        ...L('M90 400L100 360L110 400ZM290 400L300 350L310 400Z', 2.4),
        ...L(frame),
        ...birds([[120, 110, 14]]),
        ...sparks([
          [360, 60, 12],
          [40, 160, 8],
        ]),
      ];
    },
  },
  {
    id: 'paysage-desert-cactus',
    viewBox: '0 0 400 440',
    kw: ['désert', 'cactus', 'mexique', 'arizona', 'soleil', 'paysage'],
    parts: () => {
      const frame = arch(200, 40, 280, 420);
      return [
        ...clipped('c-desert', frame, [
          fill('M40 20H360V420H40Z', PEACH_L),
          fill(circle(200, 230, 70), P.coral),
          fill('M40 300Q140 250 240 290T360 280V420H40Z', SAND_D),
          fill('M40 350Q160 310 260 340T360 330V420H40Z', P.mustard),
          fill('M126 360V200Q126 184 140 184Q154 184 154 200V360Z', P.leaf),
          fill('M126 280H106Q96 280 96 268V236Q96 226 104 226Q112 226 112 236V264H126Z', P.leaf),
          fill('M154 250H172V218Q172 208 180 208Q188 208 188 218V252Q188 266 176 266H154Z', P.leaf),
          fill('M270 370V300Q270 290 280 290Q290 290 290 300V370Z', P.leafDark),
          fill('M270 330H258V310Q258 304 264 304Q270 304 270 312Z', P.leafDark),
        ]),
        ...sparks([
          [360, 60, 12],
          [40, 120, 8],
        ]),
        ...dots([[370, 250, 3.5]]),
      ];
    },
  },
  {
    id: 'paysage-dunes-chameau',
    viewBox: '0 0 460 320',
    kw: ['dunes', 'chameau', 'désert', 'sahara', 'maroc', 'paysage'],
    parts: () => [
      bg(230, 170, 200, 120, 553, P.mustard),
      ...L(circle(340, 90, 30), 3),
      ...L('M30 250Q130 170 230 230Q320 180 430 240', 3),
      ...L('M60 280Q180 240 300 270T430 270', 2.4),
      fill(
        'M150 230L156 190Q140 186 140 170Q150 150 170 160Q186 130 210 156Q230 140 250 160Q262 170 262 186L270 150L284 140L292 146L280 160L276 200L268 230H260L262 196L250 198L246 230H238L236 196H180L176 230H168L170 196L162 196L158 230Z',
        INK,
      ),
      ...sparks([
        [60, 60, 12],
        [140, 80, 7],
      ]),
      ...dots([[420, 160, 3.5]]),
    ],
  },
  {
    id: 'paysage-foret-sapins',
    viewBox: '0 0 420 380',
    kw: ['forêt', 'sapins', 'nature', 'montagne', 'canada', 'paysage'],
    parts: () => {
      const tree = (x: number, base: number, h: number, c: string, d: string): string[] => [
        fill(`M${x} ${base - h}L${x - h * 0.34} ${base}H${x + h * 0.34}Z`, c),
        fill(`M${x} ${base - h}L${x + h * 0.34} ${base}H${x}Z`, d),
        fill(`M${x - 5} ${base}h10v14h-10z`, P.clay),
      ];
      return [
        fill(circle(300, 110, 40), P.sand),
        ...tree(110, 310, 200, P.leafDark, '#1f5139'),
        ...tree(190, 320, 240, P.leaf, P.leafDark),
        ...tree(260, 310, 170, P.teal, P.tealDark),
        ...tree(320, 320, 210, P.leafDark, '#1f5139'),
        ...tree(60, 330, 130, P.leafLight, P.leaf),
        ...tree(370, 330, 120, P.leafLight, P.leaf),
        fill('M20 330Q210 310 400 330V350H20Z', P.sage),
        ...sparks([
          [60, 80, 11],
          [370, 60, 8],
        ]),
      ];
    },
  },
  {
    id: 'paysage-aurore-boreale',
    viewBox: '0 0 400 400',
    kw: ['aurore boréale', 'nord', 'islande', 'norvège', 'nuit', 'étoiles', 'paysage'],
    parts: () => {
      const disc = circle(200, 200, 160);
      return [
        ...clipped('c-aurore', disc, [
          fill('M0 0H400V400H0Z', '#2c3e5c'),
          fill('M20 170Q100 90 180 150T380 110V160Q300 200 200 190T20 230Z', P.leafLight),
          fill('M20 130Q120 60 200 110T380 70V110Q300 150 200 140T20 170Z', P.teal),
          fill('M20 220Q120 170 220 210T380 180V210Q300 240 210 236T20 260Z', '#9fd8c3'),
          fill('M0 400V300L80 220L140 280L220 200L310 290L360 250L400 290V400Z', '#1d2a40'),
          fill('M220 200L244 224L232 222L220 236L208 222L196 224Z', '#e8eef2'),
          fill('M0 400V340Q200 320 400 340V400Z', P.tealDark),
          fill(sparkle(100, 80, 8), '#f6e7b0'),
          fill(sparkle(300, 60, 10), '#f6e7b0'),
          fill(circle(160, 60, 3), '#f6e7b0'),
          fill(circle(250, 100, 2.5), '#f6e7b0'),
          fill(circle(70, 130, 2.5), '#f6e7b0'),
        ]),
        ...sparks([
          [370, 40, 12],
          [30, 370, 8],
        ]),
      ];
    },
  },
  {
    id: 'paysage-rizieres',
    viewBox: '0 0 420 340',
    kw: ['rizières', 'bali', 'asie', 'terrasses', 'vietnam', 'paysage'],
    parts: () => {
      const shape = blob(210, 190, 190, 140, 555, 0.1);
      const inner: string[] = [
        fill('M0 0H420V340H0Z', PEACH_L),
        fill(circle(290, 112, 28), P.mustard),
      ];
      const bands = [P.leafLight, '#8fc58a', P.leaf, '#5aa06e', P.leafDark, '#3c7f58'];
      bands.forEach((c, i) => {
        const y = 120 + i * 34;
        inner.push(fill(`M0 ${y + 30}Q120 ${y - 10} 210 ${y + 14}T420 ${y + 4}V340H0Z`, c));
      });
      return [
        ...clipped('c-rizieres', shape, inner),
        ...line('M20 160Q120 116 210 140T400 130', 2.4),
        ...line('M20 228Q120 184 210 208T400 198', 2.4),
        ...line('M40 290Q120 252 210 276T380 266', 2.4),
        ...sparks([[50, 50, 11]]),
        ...birds([[150, 80, 14]]),
      ];
    },
  },
  {
    id: 'paysage-cascade',
    viewBox: '0 0 400 440',
    kw: ['cascade', 'chute', 'eau', 'jungle', 'nature', 'paysage'],
    parts: () => [
      bg(200, 230, 160, 180, 556, P.sage),
      ...L('M60 120Q120 90 150 120V330M340 120Q280 90 250 120V330'),
      ...L('M150 120Q200 104 250 120', 3),
      ...L('M170 126V330M190 124V330M210 124V330M230 126V330', 2.2),
      ...L('M100 340Q200 316 300 340Q200 372 100 340Z'),
      ...L('M150 330q10 -12 20 0q10 -12 20 0q10 -12 20 0q10 -12 20 0q10 -12 20 0', 2.2),
      leaf(80, 180, 60, -20, P.leaf),
      leaf(80, 200, 54, 20, P.leafDark),
      leaf(320, 200, 60, 200, P.leaf),
      leaf(320, 220, 54, 160, P.leafDark),
      ...waves([
        [130, 390, 140],
        [160, 410, 80],
      ]),
      ...sparks([
        [350, 60, 12],
        [50, 70, 8],
      ]),
    ],
  },
  {
    id: 'paysage-champ-de-lavande',
    viewBox: '0 0 400 440',
    kw: ['lavande', 'provence', 'champ', 'été', 'france', 'paysage'],
    parts: () => {
      const frame = arch(200, 40, 280, 420);
      const rows: string[] = [];
      for (let k = -4; k <= 4; k++) {
        rows.push(
          fill(
            `M${200 + k * 8} 250L${200 + k * 70 - 12} 430H${200 + k * 70 + 12}Z`,
            k % 2 ? '#8b6cc0' : '#6a50a8',
          ),
        );
      }
      return [
        ...clipped('c-lavande', frame, [
          fill('M40 20H360V420H40Z', PEACH_L),
          fill(circle(200, 210, 50), P.mustard),
          fill('M40 250Q200 226 360 250V420H40Z', '#a690d6'),
          ...rows,
          fill('M280 250V200Q280 186 296 186Q312 186 312 200V250Z', P.leafDark),
        ]),
        ...sparks([
          [360, 60, 12],
          [40, 140, 8],
        ]),
        ...birds([[120, 120, 14]]),
      ];
    },
  },
  {
    id: 'paysage-oasis',
    viewBox: '0 0 440 360',
    kw: ['oasis', 'palmier', 'désert', 'eau', 'sahara', 'paysage'],
    parts: () => {
      const palm = (x: number, base: number, h: number, lean: number): string[] => [
        ...L(`M${x} ${base}Q${x + lean / 2} ${base - h / 2} ${x + lean} ${base - h}`, 3),
        leaf(x + lean, base - h, 60, -160, P.leaf),
        leaf(x + lean, base - h, 60, -20, P.leaf),
        leaf(x + lean, base - h, 56, -120, P.leafDark),
        leaf(x + lean, base - h, 56, -60, P.leafDark),
        leaf(x + lean, base - h, 50, 160, P.leafLight),
        leaf(x + lean, base - h, 50, 20, P.leafLight),
      ];
      return [
        bg(220, 190, 190, 140, 559, P.sand),
        ...palm(150, 270, 160, -20),
        ...palm(270, 270, 130, 24),
        fill('M110 280Q220 250 330 280Q220 310 110 280Z', P.teal),
        ...L('M110 280Q220 250 330 280Q220 310 110 280Z', 2.6),
        ...L('M30 280Q60 270 110 280M330 280Q380 268 410 280', 3),
        ...L(circle(360, 90, 24), 2.8),
        ...sparks([
          [60, 70, 12],
          [400, 180, 7],
        ]),
      ];
    },
  },
  {
    id: 'paysage-coucher-de-soleil-mer',
    viewBox: '0 0 400 400',
    kw: ['coucher de soleil', 'mer', 'plage', 'horizon', 'été', 'paysage'],
    parts: () => {
      const disc = circle(200, 200, 150);
      return [
        ...clipped('c-coucher', disc, [
          fill('M0 0H400V400H0Z', '#fbd2b2'),
          fill('M0 0H400V120H0Z', '#f9b896'),
          fill(circle(200, 220, 80), P.coral),
          fill('M0 220H400V400H0Z', P.teal),
          fill('M120 240H280V250H120ZM150 266H250V274H150ZM176 290H224V296H176Z', '#f79a7d'),
          fill('M0 330Q100 300 200 330T400 330V400H0Z', P.sand),
        ]),
        ...L(disc),
        ...birds([
          [130, 120, 14],
          [160, 100, 10],
        ]),
        ...sparks([[360, 50, 12]]),
      ];
    },
  },
  {
    id: 'paysage-route-sinueuse',
    viewBox: '0 0 400 440',
    kw: ['route', 'road trip', 'collines', 'campagne', 'voyage', 'paysage'],
    parts: () => [
      bg(200, 230, 160, 180, 561, P.mustard),
      ...L('M40 180L120 110L170 150L240 90L360 180', 2.8),
      ...L('M40 240Q140 200 220 230T360 220', 2.6),
      ...L('M180 420Q120 360 200 320Q280 290 230 250Q200 230 214 210'),
      ...L('M260 420Q190 360 236 330Q320 290 252 250Q226 234 222 210'),
      ...L('M218 400Q170 360 216 332M246 300Q262 280 238 256', 2.2),
      ...L('M80 380L94 330L108 380ZM320 380L336 320L352 380Z', 2.4),
      ...sparks([
        [350, 70, 12],
        [50, 90, 8],
      ]),
      ...dots([[360, 300, 3.5]]),
    ],
  },
  {
    id: 'paysage-mont-fuji',
    viewBox: '0 0 440 340',
    kw: ['fuji', 'japon', 'montagne', 'volcan', 'soleil', 'paysage'],
    parts: () => [
      bg(220, 170, 190, 130, 562, P.sand),
      fill(circle(300, 110, 46), P.red),
      ...L('M40 280L180 110H260L400 280'),
      ...L('M148 150L170 140L186 160L204 142L220 164L236 142L254 160L270 140L292 150', 2.6),
      ...L('M30 280H410', 3),
      ...waves([
        [70, 306, 120],
        [250, 312, 120],
      ]),
      fill(circle(60, 90, 10), P.pink),
      fill(circle(80, 104, 8), P.pink),
      ...sparks([[70, 200, 9]]),
    ],
  },
  {
    id: 'paysage-vignes',
    viewBox: '0 0 420 360',
    kw: ['vignes', 'vignoble', 'toscane', 'bordeaux', 'vin', 'campagne', 'paysage'],
    parts: () => {
      const out: string[] = [bg(210, 190, 180, 140, 563, P.apricot)];
      out.push(...L('M30 160Q120 100 210 140T390 120', 2.8));
      out.push(...L('M300 128V80M296 80L300 60L304 80', 2.6));
      for (let k = 0; k < 6; k++) {
        out.push(...L(`M${60 + k * 26} 330Q${120 + k * 30} 230 ${210 + k * 16} 170`, 2.4));
        for (let t = 0.25; t < 1; t += 0.25) {
          const x = 60 + k * 26 + (210 + k * 16 - 60 - k * 26) * t;
          const y = 330 - (330 - 170) * t;
          out.push(fill(circle(x + 4, y - 4, 7 - t * 4), P.leaf));
        }
      }
      out.push(
        fill(circle(360, 260, 9), P.plum),
        fill(circle(350, 274, 9), P.plum),
        fill(circle(370, 274, 9), P.plum),
        fill(circle(360, 288, 9), P.plum),
      );
      out.push(leaf(360, 250, 30, -60, P.leaf));
      out.push(
        ...sparks([
          [380, 60, 12],
          [40, 80, 8],
        ]),
      );
      return out;
    },
  },
];

/** A small olive sprig, flat sage, standing at (x, y). */
function leafSprig(x: number, y: number): string[] {
  return [
    ...line(`M${x} ${y}Q${x - 6} ${y - 40} ${x - 2} ${y - 80}`, 2.4),
    leaf(x - 4, y - 24, 26, -140, P.sage),
    leaf(x - 2, y - 40, 24, -40, P.sage),
    leaf(x - 4, y - 58, 22, -140, P.sage),
    leaf(x - 2, y - 74, 20, -60, P.sage),
  ];
}

void star;
void SKY;
void PEACH_L;
