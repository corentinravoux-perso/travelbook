/** Croquis: travel (vehicles, places, landmarks). */
import { type Drawing, INK, circle, fill, hatch, heart, ink, stroke } from './core.ts';
import { accents, ell, inkRing, rect, rr, sector, shine, solid } from './croquis-kit.ts';

/** A wheel: ink tyre with a white hub. */
const wheel = (x: number, y: number, r: number): string[] => [
  ...solid(circle(x, y, r), 7),
  ...ink(circle(x, y, r * 0.45), { w: 6, sketch: false }),
  ...shine(
    `M${x - r * 0.7} ${y - r * 0.3}Q${x - r * 0.6} ${y - r * 0.65} ${x - r * 0.25} ${y - r * 0.75}`,
    4,
  ),
];

export const VOYAGE: Drawing[] = [
  {
    id: 'voyage-avion',
    viewBox: '0 0 420 270',
    kw: ['avion', 'vol', 'voyage', 'départ', 'aéroport', 'ciel'],
    parts: () => [
      ...ink('M196 124L244 124L206 40L178 40Z', { w: 8 }),
      ...ink('M60 128L44 54L78 54L122 124Z', { w: 8 }),
      ...ink(
        'M46 152Q46 122 86 120L326 112Q392 114 400 140Q392 166 326 168L86 174Q46 176 46 152Z',
        { w: 11 },
      ),
      ...hatch('M70 160Q200 168 330 158Q380 154 394 146Q384 166 326 168L86 172Q60 172 70 160Z', {
        gap: 7,
      }),
      fill('M352 124Q384 126 392 138L352 138Z', INK),
      ...[226, 252, 278, 304].map((x) => fill(circle(x, 138, 7), INK)),
      ...ink('M176 146L254 146L176 244L146 244Z', { w: 9 }),
      ...hatch('M200 150L246 150L180 236L168 236Z', { gap: 8 }),
      ...stroke('M10 100L40 100M4 140L30 140M14 190L44 186', 6),
    ],
  },
  {
    id: 'voyage-voiture',
    viewBox: '0 0 420 260',
    kw: ['voiture', 'road trip', 'route', 'vacances', 'auto'],
    parts: () => [
      ...ink(
        'M28 196L28 156Q28 132 60 128L112 120L150 72Q160 60 182 60L268 60Q288 60 300 74L338 120L370 126Q394 132 394 162L394 196Z',
        { w: 11 },
      ),
      ...hatch('M34 170L388 170L388 192L34 192Z', { gap: 8 }),
      ...ink('M160 80L204 80L204 120L130 120Z', { w: 7, sketch: false }),
      ...ink('M218 80L270 80L306 120L218 120Z', { w: 7, sketch: false }),
      ...hatch('M218 80L270 80L306 120L218 120Z', { gap: 8, angle: 50, w: 2 }),
      ...stroke('M210 130L210 186M230 140L250 140', 5),
      ...ink(rr(370, 140, 22, 16, 6), { w: 5, sketch: false }),
      ...wheel(110, 200, 36),
      ...wheel(310, 200, 36),
    ],
  },
  {
    id: 'voyage-van',
    viewBox: '0 0 440 320',
    kw: ['van', 'combi', 'road trip', 'camping', 'surf', 'hippie'],
    parts: () => [
      ...ink(rr(60, 34, 300, 22, 10), { w: 7 }),
      ...hatch(rr(60, 34, 300, 22, 10), { gap: 7, angle: 70, w: 2 }),
      ...stroke('M120 56L120 76M300 56L300 76', 6),
      ...ink('M40 250L40 110Q40 76 80 76L340 76Q390 76 400 130L408 250Z', { w: 11 }),
      ...hatch('M44 180L404 180L408 248L44 248Z', { gap: 9, angle: 50 }),
      ...stroke('M40 180Q220 170 404 180', 7),
      fill(heart(222, 216, 18), INK),
      ...ink(rr(66, 98, 70, 56, 10), { w: 7, sketch: false }),
      ...ink(rr(150, 98, 70, 56, 10), { w: 7, sketch: false }),
      ...ink(rr(234, 98, 70, 56, 10), { w: 7, sketch: false }),
      ...ink('M318 98L346 98Q378 100 388 154L318 154Z', { w: 7, sketch: false }),
      ...stroke('M80 140L100 112M164 140L184 112', 4),
      ...wheel(110, 256, 38),
      ...wheel(330, 256, 38),
    ],
  },
  {
    id: 'voyage-velo',
    viewBox: '0 0 420 300',
    kw: ['vélo', 'bicyclette', 'balade', 'cyclisme', 'promenade'],
    parts: () => {
      const spokes = (x: number, y: number): string[] =>
        [0, 45, 90, 135].flatMap((a) => {
          const c = Math.cos((a * Math.PI) / 180) * 66;
          const s = Math.sin((a * Math.PI) / 180) * 66;
          return stroke(
            `M${Math.round(x - c)} ${Math.round(y - s)}L${Math.round(x + c)} ${Math.round(y + s)}`,
            3,
            { roughness: 0.6 },
          );
        });
      return [
        ...spokes(100, 214),
        ...spokes(320, 214),
        ...inkRing(circle(100, 214, 76), circle(100, 214, 62), 7, INK),
        ...inkRing(circle(320, 214, 76), circle(320, 214, 62), 7, INK),
        ...stroke('M100 214L180 120L290 120L200 214Z', 9),
        ...stroke('M200 214L170 92M290 120L320 214M280 84L290 120', 9),
        ...stroke('M146 88L196 88', 13),
        ...stroke('M262 84Q290 70 300 86', 9),
        ...ink('M264 40L346 40L336 96L274 96Z', { w: 8 }),
        ...hatch('M264 40L346 40L336 96L274 96Z', { gap: 8, angle: 50, w: 2.2 }),
        ...ink(circle(286, 28, 14), { w: 6, sketch: false }),
        ...ink(circle(316, 22, 12), { w: 6, sketch: false }),
        ...ink(circle(200, 214, 12), { w: 6, sketch: false }),
      ];
    },
  },
  {
    id: 'voyage-bateau',
    viewBox: '0 0 400 340',
    kw: ['bateau', 'voilier', 'mer', 'voile', 'croisière', 'port'],
    parts: () => [
      ...stroke('M200 30L200 236', 9),
      ...ink('M206 40L346 210L206 210Z', { w: 9 }),
      ...ink('M194 70L194 210L76 210Z', { w: 9 }),
      ...hatch('M194 70L194 210L76 210Z', { gap: 8 }),
      ...solid('M200 30L244 42L200 56Z', 5),
      ...ink('M30 236L370 236L320 296L80 296Z', { w: 11 }),
      ...hatch('M40 262L360 262L320 294L80 294Z', { gap: 7 }),
      ...stroke(
        'M10 320Q40 304 70 320Q100 336 130 320Q160 304 190 320Q220 336 250 320Q280 304 310 320Q340 336 370 320Q385 312 396 318',
        7,
      ),
    ],
  },
  {
    id: 'voyage-montgolfiere',
    viewBox: '0 0 300 410',
    kw: ['montgolfière', 'ballon', 'ciel', 'vol', 'aventure'],
    parts: () => [
      ...ink('M150 26Q264 26 264 140Q264 212 192 272L108 272Q36 212 36 140Q36 26 150 26Z', {
        w: 11,
      }),
      ...hatch('M150 28Q110 60 108 140Q110 216 130 272L108 272Q36 212 36 140Q40 40 150 28Z', {
        gap: 8,
      }),
      ...hatch('M150 28Q190 60 192 140Q190 216 170 272L192 272Q200 140 150 28Z', { gap: 8 }),
      ...stroke('M150 28Q110 60 108 140Q110 216 130 272M150 28Q190 60 192 140Q190 216 170 272', 6),
      ...stroke('M42 168Q150 200 258 168', 6),
      ...stroke('M112 274L118 322M188 274L182 322', 5),
      ...ink(rr(108, 318, 84, 62, 8), { w: 9 }),
      ...hatch(rr(108, 318, 84, 62, 8), { gap: 9, angle: 60, w: 2.2 }),
    ],
  },
  {
    id: 'voyage-tour-eiffel',
    viewBox: '0 0 260 420',
    kw: ['tour eiffel', 'paris', 'france', 'monument'],
    parts: () => [
      ...stroke('M130 6L130 34', 6),
      ...ink(
        'M56 404Q98 300 110 210L118 120L124 40L136 40L142 120L150 210Q162 300 204 404L170 404Q156 344 130 334Q104 344 90 404Z',
        { w: 10 },
      ),
      ...hatch('M130 44L136 44L142 120L150 210Q162 300 200 400L172 400Q160 344 130 334Z', {
        gap: 8,
      }),
      ...ink(rect(98, 202, 64, 18), { w: 7, sketch: false }),
      ...ink(rect(110, 116, 40, 12), { w: 6, sketch: false }),
      ...stroke('M74 330L186 330', 8),
      ...stroke('M114 230L146 290M146 230L114 290M118 140L142 196M142 140L118 196', 4),
      ...accents(130, 40, 3, 30, 200, 340, 4),
    ],
  },
  {
    id: 'voyage-palmier',
    viewBox: '0 0 360 410',
    kw: ['palmier', 'plage', 'île', 'tropical', 'été', 'vacances'],
    parts: () => {
      const frond = (d: string, mid: string, shade: boolean): string[] => [
        ...ink(d, { w: 9 }),
        ...(shade ? hatch(d, { gap: 8, angle: 20, w: 2.2 }) : []),
        ...stroke(mid, 4),
      ];
      return [
        ...ink('M40 396Q120 350 200 352Q290 350 330 396Z', { w: 9 }),
        ...ink('M156 380Q146 250 184 126L206 130Q174 250 190 380Z', { w: 9 }),
        ...[150, 180, 210, 240, 270, 300, 330]
          .map((y) =>
            stroke(
              `M${Math.round(158 + (380 - y) * 0.09)} ${y}L${Math.round(186 + (380 - y) * 0.09)} ${y - 4}`,
              4,
            ),
          )
          .flat(),
        ...frond('M194 124Q120 60 30 110Q110 92 194 124Z', 'M190 122Q120 84 50 106', true),
        ...frond('M194 124Q150 50 60 40Q150 70 194 124Z', 'M190 120Q140 66 80 46', false),
        ...frond('M196 124Q240 40 330 50Q250 80 196 124Z', 'M200 120Q250 70 310 54', true),
        ...frond('M196 126Q280 90 340 150Q270 110 196 126Z', 'M200 124Q270 104 326 140', false),
        ...frond('M194 128Q130 140 100 210Q140 150 194 128Z', 'M190 130Q140 150 110 196', false),
        ...solid(circle(184, 140, 14), 5),
        ...solid(circle(208, 146, 14), 5),
      ];
    },
  },
  {
    id: 'voyage-montagne',
    viewBox: '0 0 420 290',
    kw: ['montagne', 'randonnée', 'alpes', 'sommet', 'nature', 'ski'],
    parts: () => [
      ...ink(circle(330, 70, 40), { w: 8 }),
      ...ink('M14 272L150 64L220 170L282 100L406 272Z', { w: 11 }),
      ...hatch('M150 64L220 170L200 272L120 272Q190 170 150 64Z', { gap: 9 }),
      ...hatch('M282 100L406 272L330 272Q320 170 282 100Z', { gap: 9 }),
      ...ink('M150 64L116 116L136 106L152 126L172 104L184 112Z', { w: 7, sketch: false }),
      ...ink('M282 100L258 134L274 128L288 142L300 124Z', { w: 6, sketch: false }),
      ...stroke('M60 60Q70 50 80 60Q90 50 100 60M100 30Q108 22 116 30Q124 22 132 30', 5),
    ],
  },
  {
    id: 'voyage-tente',
    viewBox: '0 0 400 300',
    kw: ['tente', 'camping', 'nature', 'bivouac', 'aventure'],
    parts: () => [
      ...stroke('M200 54L176 20M200 54L226 20', 7),
      ...solid('M226 20L262 32L226 44Z', 5),
      ...ink('M36 262L200 54L364 262Z', { w: 11 }),
      ...hatch('M200 60L360 258L300 258Z', { gap: 9 }),
      ...solid('M200 110L148 262L252 262Z', 7),
      ...ink('M200 110L174 262L208 262Z', { w: 6, sketch: false }),
      ...stroke('M10 274Q200 264 390 274', 8),
      ...stroke('M20 262L36 232M380 262L364 232', 5),
    ],
  },
  {
    id: 'voyage-epingle-carte',
    viewBox: '0 0 280 400',
    kw: ['épingle', 'carte', 'lieu', 'destination', 'ici', 'gps'],
    parts: () => [
      ...ink(ell(140, 370, 70, 18), { w: 6, sketch: false }),
      ...hatch(ell(140, 370, 70, 18), { gap: 7, angle: 60, w: 2 }),
      ...ink('M140 362Q40 240 40 146Q40 40 140 40Q240 40 240 146Q240 240 140 362Z', { w: 11 }),
      ...hatch('M190 62Q236 90 236 150Q236 230 150 350Q210 220 190 62Z', { gap: 8 }),
      ...solid(heart(140, 146, 44), 6),
      ...shine('M110 126Q116 114 128 112', 4),
    ],
  },
  {
    id: 'voyage-globe',
    viewBox: '0 0 320 400',
    kw: ['globe', 'monde', 'terre', 'tour du monde', 'pays', 'voyage'],
    parts: () => [
      ...ink(rr(96, 360, 128, 26, 10), { w: 8 }),
      ...stroke('M160 330L160 362', 10),
      ...stroke('M228 34A157 157 0 0 1 123 325', 9),
      ...ink(circle(150, 170, 132), { w: 11 }),
      ...hatch(sector(150, 170, 90, 128, -40, 80), { gap: 8 }),
      ...solid('M90 90Q130 70 150 100Q140 140 110 136Q100 160 70 150Q60 110 90 90Z', 5),
      ...solid('M180 160Q230 150 240 190Q226 240 190 250Q170 210 180 160Z', 5),
      ...stroke('M22 170Q150 210 278 170', 4, { roughness: 1.4 }),
      ...stroke('M150 38Q100 170 150 302', 4, { roughness: 1.4 }),
    ],
  },
];
