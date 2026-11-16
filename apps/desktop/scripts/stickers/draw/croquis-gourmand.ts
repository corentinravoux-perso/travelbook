/** Croquis: food and drink. */
import { type Drawing, INK, PAPER, circle, fill, hatch, heart, ink, stroke } from './core.ts';
import { accents, drop, ell, inkRing, sector, shine, solid } from './croquis-kit.ts';

export const GOURMAND: Drawing[] = [
  {
    id: 'gourmand-glace',
    viewBox: '0 0 260 410',
    kw: ['glace', 'cornet', 'été', 'dessert', 'gourmandise'],
    parts: () => [
      ...stroke('M150 34Q160 14 178 10', 5),
      ...ink('M70 98Q70 40 130 40Q190 40 190 98Q170 112 130 108Q90 112 70 98Z', { w: 10 }),
      ...hatch('M160 50Q188 66 188 96Q176 104 160 106Q176 80 160 50Z', { gap: 8 }),
      fill(circle(150, 30, 14), INK),
      ...ink(
        'M56 186Q40 110 130 104Q220 110 204 186Q196 206 184 196Q174 218 160 200Q146 222 130 202Q114 222 100 200Q86 218 76 196Q64 206 56 186Z',
        { w: 10 },
      ),
      ...hatch('M170 118Q210 136 204 182Q196 198 184 192Q194 150 170 118Z', { gap: 8 }),
      ...ink('M64 196L196 196L130 396Z', { w: 10 }),
      ...hatch('M70 200L190 200L130 388Z', { gap: 13, angle: 50, w: 2.2 }),
      ...hatch('M70 200L190 200L130 388Z', { gap: 13, angle: -50, w: 2.2 }),
      ...shine('M90 70Q96 56 110 52', 4),
    ],
  },
  {
    id: 'gourmand-cocktail',
    viewBox: '0 0 330 410',
    kw: ['cocktail', 'apéro', 'boisson', 'été', 'bar', 'vacances'],
    parts: () => [
      ...stroke('M226 30L170 160', 5),
      ...ink('M180 52Q240 -4 310 40Q250 30 180 52Z', { w: 7 }),
      ...hatch('M180 52Q240 -4 310 40Q250 30 180 52Z', { gap: 6, angle: 70, w: 2 }),
      ...ink('M36 76L288 76L162 226Z', { w: 11 }),
      fill('M78 114L246 114L162 214Z', INK),
      ...shine('M110 124Q130 140 146 170', 5),
      ...stroke('M162 226L162 356', 10),
      ...ink(ell(162, 364, 74, 18), { w: 9 }),
      ...inkRing(circle(64, 76, 34), circle(64, 76, 12), 8),
      ...stroke('M64 44L64 108M32 76L96 76', 4),
    ],
  },
  {
    id: 'gourmand-verre-vin',
    viewBox: '0 0 260 410',
    kw: ['vin', 'verre', 'apéro', 'dégustation', 'fête', 'santé'],
    parts: () => [
      ...ink('M50 40L210 40Q222 176 130 206Q38 176 50 40Z', { w: 11 }),
      fill('M56 104L204 104Q204 176 130 200Q56 176 56 104Z', INK),
      ...shine('M76 120Q80 160 108 180', 6),
      ...stroke('M130 206L130 360', 10),
      ...ink(ell(130, 368, 70, 18), { w: 9 }),
      ...accents(130, 120, 3, 110, -60, -20, 5),
    ],
  },
  {
    id: 'gourmand-croissant',
    viewBox: '0 0 420 260',
    kw: ['croissant', 'petit déjeuner', 'boulangerie', 'france', 'paris'],
    parts: () => {
      const out =
        'M30 214Q30 120 120 86Q210 44 300 86Q390 120 390 214Q360 190 330 198Q306 222 276 210Q244 234 210 222Q176 234 144 210Q114 222 90 198Q60 190 30 214Z';
      return [
        ...ink(out, { w: 11 }),
        ...hatch(
          'M40 200Q60 182 92 190Q116 214 144 202Q176 226 210 214Q244 226 276 202Q304 214 328 190Q360 182 380 200Q384 214 384 214Q360 194 330 202Q306 226 276 214Q244 238 210 226Q176 238 144 214Q114 226 90 202Q60 194 36 214Z',
          { gap: 7 },
        ),
        ...hatch('M250 70Q330 90 370 160L380 200Q352 186 330 192Q330 120 250 70Z', { gap: 9 }),
        ...stroke('M92 100Q74 150 92 196', 6),
        ...stroke('M150 70Q130 140 146 208', 6),
        ...stroke('M270 70Q290 140 274 208', 6),
        ...stroke('M328 100Q346 150 328 196', 6),
        ...stroke('M180 84Q200 76 226 80', 4),
      ];
    },
  },
  {
    id: 'gourmand-pizza',
    viewBox: '0 0 340 390',
    kw: ['pizza', 'italie', 'repas', 'fromage'],
    parts: () => [
      ...ink('M40 64Q170 12 300 64L170 370Z', { w: 11 }),
      ...hatch('M210 100L280 90L178 330Z', { gap: 10 }),
      ...ink('M40 64Q170 12 300 64L290 92Q170 44 50 92Z', { w: 9 }),
      ...hatch('M40 64Q170 12 300 64L290 92Q170 44 50 92Z', { gap: 7, angle: 70, w: 2 }),
      ...solid(circle(130, 140, 26)),
      ...solid(circle(204, 150, 22)),
      ...solid(circle(166, 236, 20)),
      ...shine('M120 132L124 128M140 150L144 146M196 146L200 142', 5),
      ...inkRing(circle(110, 200, 11), circle(110, 200, 4), 5),
      ...inkRing(circle(222, 220, 10), circle(222, 220, 4), 5),
      ...stroke('M250 120Q246 144 256 160', 6),
    ],
  },
  {
    id: 'gourmand-ananas',
    viewBox: '0 0 260 420',
    kw: ['ananas', 'fruit', 'tropical', 'été', 'exotique'],
    parts: () => [
      ...ink('M130 164L92 40L120 130L130 24L140 130L168 40Z', { w: 8 }),
      ...ink('M126 168L52 92L112 156M134 168L208 92L148 156', { w: 8, fill: 'none' }),
      ...ink(ell(130, 290, 92, 124), { w: 11 }),
      ...hatch('M176 186Q222 230 220 290Q216 370 160 410Q200 300 176 186Z', { gap: 8 }),
      ...stroke('M70 200L196 340M52 260L160 386M100 176L214 300', 4),
      ...stroke('M190 200L64 340M208 260L100 386M160 176L46 300', 4),
    ],
  },
  {
    id: 'gourmand-pasteque',
    viewBox: '0 0 400 280',
    kw: ['pastèque', 'fruit', 'été', 'pique-nique', 'melon'],
    parts: () => [
      ...ink('M24 54L376 54Q376 264 200 264Q24 264 24 54Z', { w: 11 }),
      ...hatch('M24 54L50 54Q60 236 200 238Q340 236 350 54L376 54Q376 264 200 264Q24 264 24 54Z', {
        gap: 8,
        angle: 60,
      }),
      ...stroke('M50 56Q60 236 200 238Q340 236 350 56', 6),
      ...[
        [110, 110],
        [170, 94],
        [236, 104],
        [292, 98],
        [144, 160],
        [206, 170],
        [264, 150],
        [190, 214],
      ].map(([x, y]) => fill(drop(x!, y!, 8), INK)),
    ],
  },
  {
    id: 'gourmand-citron',
    viewBox: '0 0 380 310',
    kw: ['citron', 'agrume', 'fruit', 'méditerranée', 'été'],
    parts: () => [
      ...ink('M206 66Q240 20 300 26Q270 86 206 66Z', { w: 7 }),
      ...hatch('M206 66Q240 20 300 26Q270 86 206 66Z', { gap: 7, angle: 20, w: 2 }),
      ...ink(
        'M44 160Q24 132 54 122Q100 52 186 62Q276 74 290 150Q318 168 290 188Q254 272 164 264Q86 254 60 200Q28 190 44 160Z',
        { w: 11 },
      ),
      ...hatch('M230 82Q288 110 288 170Q266 244 190 260Q260 196 230 82Z', { gap: 9 }),
      ...stroke('M96 126Q114 100 142 92', 4),
      ...inkRing(circle(306, 252, 50), circle(306, 252, 12), 8),
      ...[0, 60, 120, 180, 240, 300].flatMap((a) =>
        stroke(
          `M306 252L${Math.round(306 + Math.cos((a * Math.PI) / 180) * 42)} ${Math.round(252 + Math.sin((a * Math.PI) / 180) * 42)}`,
          4,
        ),
      ),
    ],
  },
  {
    id: 'gourmand-cafe-a-emporter',
    viewBox: '0 0 260 400',
    kw: ['café', 'gobelet', 'à emporter', 'matin', 'boisson'],
    parts: () => [
      ...ink('M56 120L204 120L182 384L78 384Z', { w: 11 }),
      ...hatch('M170 126L198 126L178 378L160 378Z', { gap: 8 }),
      ...ink('M62 210L198 210L192 286L68 286Z', { w: 8 }),
      fill(heart(130, 250, 22), INK),
      ...ink('M40 92L220 92L212 124L48 124Z', { w: 9 }),
      ...ink('M70 92L84 62L176 62L190 92Z', { w: 8 }),
      ...stroke('M110 50Q100 36 112 22M140 50Q130 36 142 22', 5),
    ],
  },
  {
    id: 'gourmand-donut',
    viewBox: '0 0 320 300',
    kw: ['donut', 'beignet', 'dessert', 'gourmandise', 'goûter'],
    parts: () => {
      const outer = ell(160, 160, 136, 118);
      const hole = ell(160, 150, 40, 30);
      return [
        fill(`${outer} ${hole}`, PAPER, ' fill-rule="evenodd"'),
        fill(
          `M40 166Q36 58 160 52Q284 58 280 166Q266 190 250 174Q236 208 214 188Q198 212 180 194Q162 218 144 194Q126 212 108 190Q90 208 74 178Q58 194 40 166Z ${hole}`,
          INK,
          ' fill-rule="evenodd"',
        ),
        ...[
          [84, 104, 20],
          [134, 84, -30],
          [206, 88, 40],
          [240, 126, -10],
          [92, 140, 70],
          [228, 160, 0],
          [170, 100, 80],
        ].flatMap(([x, y, a]) =>
          stroke(
            `M${x} ${y}l${Math.round(Math.cos((a! * Math.PI) / 180) * 16)} ${Math.round(Math.sin((a! * Math.PI) / 180) * 16)}`,
            6,
            { stroke: PAPER },
          ),
        ),
        ...hatch(sector(160, 160, 84, 128, 40, 140), { gap: 9 }),
        ...ink(outer, { w: 11, fill: 'none' }),
        ...ink(hole, { w: 8, fill: 'none', sketch: false }),
      ];
    },
  },
];
