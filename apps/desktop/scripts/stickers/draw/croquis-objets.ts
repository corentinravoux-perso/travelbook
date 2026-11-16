/** Croquis: travel objects. */
import {
  type Drawing,
  INK,
  PAPER,
  circle,
  fill,
  hatch,
  heart,
  ink,
  rotate,
  star,
  stroke,
  translate,
} from './core.ts';
import { accents, dashes, ell, inkRing, rect, rr, sector, shine, solid } from './croquis-kit.ts';

export const OBJETS: Drawing[] = [
  {
    id: 'objet-valise',
    viewBox: '0 0 360 350',
    kw: ['valise', 'bagage', 'voyage', 'départ', 'vacances'],
    parts: () => [
      ...ink(
        'M128 92L128 50Q128 32 146 32L214 32Q232 32 232 50L232 92L210 92L210 56L150 56L150 92Z',
        { w: 8 },
      ),
      ...ink(rr(36, 88, 288, 222, 26), { w: 11 }),
      ...hatch('M284 96L312 100Q318 200 312 300L288 302Q300 200 284 96Z', { gap: 9 }),
      ...ink(rect(96, 88, 26, 222), { w: 6, sketch: false }),
      ...ink(rect(238, 88, 26, 222), { w: 6, sketch: false }),
      fill(heart(180, 170, 26), INK),
      fill(star(180, 246, 20), INK),
      ...ink(circle(84, 324, 14), { w: 7, sketch: false }),
      ...ink(circle(276, 324, 14), { w: 7, sketch: false }),
    ],
  },
  {
    id: 'objet-appareil-photo',
    viewBox: '0 0 400 300',
    kw: ['appareil photo', 'photo', 'souvenir', 'caméra'],
    parts: () => [
      ...ink('M118 86L142 44L250 44L274 86Z', { w: 9 }),
      ...ink(rect(56, 62, 44, 22), { w: 6, sketch: false }),
      ...ink(rr(28, 80, 344, 196, 28), { w: 11 }),
      ...hatch('M330 92L360 100Q366 180 358 262L334 264Q346 180 330 92Z', { gap: 9 }),
      ...ink(circle(200, 178, 76), { w: 10 }),
      ...solid(circle(200, 178, 48)),
      ...shine('M172 160Q182 142 202 138', 6),
      ...shine('M224 196Q218 206 208 210', 4),
      ...ink(rect(292, 104, 48, 28), { w: 6, sketch: false }),
      ...accents(200, 54, 3, 46, 245, 295),
    ],
  },
  {
    id: 'objet-polaroid',
    viewBox: '0 0 340 380',
    kw: ['polaroid', 'photo', 'souvenir', 'cadre', 'instantané'],
    parts: () => [
      rotate(
        [
          ...ink(rect(40, 40, 260, 300), { w: 10 }),
          ...ink(rect(64, 64, 212, 200), { w: 6, sketch: false }),
          ...hatch('M64 264L134 168L180 220L222 178L276 236L276 264Z', { gap: 8, angle: 40 }),
          ...stroke('M64 264L134 168L180 220L222 178L276 236', 6),
          fill(circle(222, 112, 22), INK),
          ...ink(rect(130, 22, 80, 34), { w: 6, sketch: false }),
          ...hatch(rect(130, 22, 80, 34), { gap: 7, angle: 60, w: 2 }),
          ...stroke('M90 300Q170 292 250 302', 4, { roughness: 1.5 }),
        ],
        -6,
        170,
        190,
      ),
    ],
  },
  {
    id: 'objet-carte',
    viewBox: '0 0 400 310',
    kw: ['carte', 'plan', 'itinéraire', 'route', 'trésor'],
    parts: () => [
      ...ink('M28 62L140 32L260 62L372 32L372 254L260 284L140 254L28 284Z', { w: 10 }),
      ...hatch('M140 32L260 62L260 284L140 254Z', { gap: 10, angle: 50, w: 2.2 }),
      ...stroke('M140 32L140 254', 7),
      ...stroke('M260 62L260 284', 7),
      ...dashes(
        [
          [60, 240],
          [76, 222],
          [92, 206],
          [110, 190],
          [130, 178],
          [152, 168],
          [176, 160],
          [200, 150],
          [222, 138],
          [244, 124],
          [266, 112],
          [288, 104],
        ],
        6,
      ),
      ...stroke('M300 74L332 106M332 74L300 106', 9),
      fill(circle(60, 246, 8), INK),
    ],
  },
  {
    id: 'objet-boussole',
    viewBox: '0 0 320 330',
    kw: ['boussole', 'nord', 'orientation', 'aventure', 'rose des vents'],
    parts: () => [
      ...inkRing(circle(160, 30, 20), circle(160, 30, 9), 7),
      ...ink(circle(160, 186, 132), { w: 11 }),
      ...hatch(sector(160, 186, 108, 128, -40, 80), { gap: 8 }),
      ...ink(circle(160, 186, 104), { w: 6, sketch: false }),
      ...ink('M160 94L186 186L160 278L134 186Z', { w: 7, sketch: false }),
      fill('M160 94L186 186L134 186Z', INK),
      ...ink(circle(160, 186, 11), { w: 5, sketch: false }),
      ...stroke('M160 64L160 78M160 294L160 308M38 186L52 186M268 186L282 186', 7),
    ],
  },
  {
    id: 'objet-sac-a-dos',
    viewBox: '0 0 300 390',
    kw: ['sac à dos', 'randonnée', 'aventure', 'bagage', 'trek'],
    parts: () => [
      ...stroke('M118 66Q150 18 182 66', 10),
      ...ink('M62 126Q60 62 150 62Q240 62 238 126L250 344Q250 368 226 368L74 368Q50 368 50 344Z', {
        w: 11,
      }),
      ...hatch('M214 80Q238 100 236 130L246 340Q246 360 228 362L222 362Q232 240 214 80Z', {
        gap: 8,
      }),
      ...ink('M66 132Q150 190 234 132L236 166Q150 214 64 166Z', { w: 8, sketch: false }),
      ...ink(rr(86, 236, 128, 100, 18), { w: 8 }),
      ...stroke('M96 270Q150 280 204 270', 5),
      fill(circle(150, 186, 8), INK),
    ],
  },
  {
    id: 'objet-chapeau-paille',
    viewBox: '0 0 420 270',
    kw: ['chapeau', 'paille', 'été', 'soleil', 'plage'],
    parts: () => [
      ...ink(ell(210, 186, 194, 62), { w: 11 }),
      ...stroke(
        'M70 196L80 212M120 220L126 236M300 220L294 236M350 196L340 212M210 232L210 246',
        4,
      ),
      ...ink('M110 178Q108 56 210 56Q312 56 310 178Q210 204 110 178Z', { w: 11 }),
      ...hatch('M262 70Q306 92 306 170L272 182Q290 110 262 70Z', { gap: 9 }),
      fill('M112 150Q210 178 308 150L310 176Q210 204 110 176Z', INK),
      ...shine('M140 168Q200 182 250 176', 4),
    ],
  },
  {
    id: 'objet-tongs',
    viewBox: '0 0 400 350',
    kw: ['tongs', 'sandales', 'plage', 'été', 'vacances'],
    parts: () => {
      const sole =
        'M86 36Q148 28 154 112Q162 204 142 290Q124 330 92 322Q50 304 60 200Q42 84 86 36Z';
      const one = (dx: number, dy: number, deg: number): string =>
        translate(
          [
            rotate(
              [
                ...ink(sole, { w: 10 }),
                ...hatch('M118 220Q148 216 144 280Q130 318 104 316Q140 280 118 220Z', { gap: 8 }),
                ...stroke('M106 84L64 176M106 84L150 176', 16),
                ...stroke('M106 84L64 176M106 84L150 176', 6, { stroke: PAPER, roughness: 0.4 }),
                fill(circle(106, 84, 9), INK),
              ],
              deg,
              106,
              180,
            ),
          ],
          dx,
          dy,
        );
      return [one(4, 6, -6), one(176, 4, 8)];
    },
  },
  {
    id: 'objet-passeport',
    viewBox: '0 0 300 380',
    kw: ['passeport', 'voyage', 'frontière', 'pays', 'visa'],
    parts: () => [
      ...ink('M254 44L270 50L270 350L254 356Z', { w: 6, sketch: false }),
      ...solid(rr(36, 28, 222, 326, 18), 9),
      ...stroke(circle(146, 166, 58), 5, { stroke: PAPER, roughness: 0.6 }),
      ...stroke(
        'M146 108Q112 166 146 224M146 108Q180 166 146 224M90 150L202 150M90 184L202 184',
        4,
        { stroke: PAPER, roughness: 0.6 },
      ),
      ...shine('M96 266L196 266', 8),
      ...shine('M110 290L182 290', 5),
      ...shine('M52 50Q60 44 70 44', 4),
    ],
  },
  {
    id: 'objet-billet-avion',
    viewBox: '0 0 420 240',
    kw: ['billet', 'avion', 'ticket', 'embarquement', 'vol', 'départ'],
    parts: () => [
      ...ink('M24 40L396 40L396 98Q374 120 396 142L396 200L24 200L24 142Q46 120 24 98Z', { w: 10 }),
      ...hatch('M302 46L390 46L390 96Q372 120 390 144L390 194L302 194Z', {
        gap: 9,
        angle: 45,
        w: 2.2,
      }),
      ...dashes(
        [
          [300, 50],
          [300, 66],
          [300, 80],
          [300, 96],
          [300, 110],
          [300, 126],
          [300, 140],
          [300, 156],
          [300, 170],
          [300, 186],
        ],
        5,
      ),
      fill(
        'M70 120L110 112L134 82L148 84L136 110L172 104L182 92L192 94L186 112L192 130L182 132L172 120L136 118L148 144L134 146L110 126Z',
        INK,
      ),
      ...stroke('M206 90L270 90M206 120L262 120M206 150L240 150', 6),
    ],
  },
  {
    id: 'objet-cle',
    viewBox: '0 0 400 230',
    kw: ['clé', 'maison', 'hôtel', 'location'],
    parts: () => [
      ...ink(
        'M160 100L370 100L370 128L346 128L346 162L324 162L324 128L308 128L308 172L284 172L284 128L160 128Z',
        { w: 9 },
      ),
      ...inkRing(circle(100, 114, 72), circle(100, 114, 26), 11),
      ...hatch(sector(100, 114, 32, 66, 20, 140), { gap: 8 }),
      ...accents(100, 114, 3, 92, 200, 250),
    ],
  },
  {
    id: 'objet-jumelles',
    viewBox: '0 0 400 290',
    kw: ['jumelles', 'observer', 'safari', 'aventure', 'nature'],
    parts: () => [
      ...ink(rect(160, 98, 80, 54), { w: 8 }),
      ...ink(rr(46, 56, 124, 178, 42), { w: 11 }),
      ...ink(rr(230, 56, 124, 178, 42), { w: 11 }),
      ...hatch('M138 66Q166 80 166 110L166 220Q160 230 146 230Q160 140 138 66Z', { gap: 8 }),
      ...hatch('M322 66Q350 80 350 110L350 220Q344 230 330 230Q344 140 322 66Z', { gap: 8 }),
      ...solid(ell(108, 236, 54, 26), 7),
      ...solid(ell(292, 236, 54, 26), 7),
      ...shine('M82 232Q92 222 108 220', 5),
      ...shine('M266 232Q276 222 292 220', 5),
      ...ink(rect(84, 30, 48, 30), { w: 6, sketch: false }),
      ...ink(rect(268, 30, 48, 30), { w: 6, sketch: false }),
    ],
  },
  {
    id: 'objet-parasol',
    viewBox: '0 0 380 400',
    kw: ['parasol', 'plage', 'été', 'soleil', 'vacances', 'sable'],
    parts: () => [
      ...stroke('M190 60L190 360', 11),
      ...ink('M40 380Q100 340 190 344Q290 340 350 380Z', { w: 9 }),
      ...hatch('M40 380Q100 340 190 344Q290 340 350 380Z', { gap: 12, angle: 10, w: 2 }),
      ...ink(
        'M24 178Q190 -10 356 178Q314 156 272 178Q232 156 190 178Q148 156 108 178Q66 156 24 178Z',
        { w: 11 },
      ),
      ...hatch('M190 54L108 178Q148 156 190 178Z', { gap: 8, angle: -30 }),
      ...hatch('M190 54L272 178Q314 156 356 178Q300 90 190 54Z', { gap: 8, angle: -30 }),
      ...stroke('M190 54L108 178M190 54L272 178', 7),
      ...ink(circle(190, 46, 12), { w: 6, sketch: false }),
    ],
  },
  {
    id: 'objet-bouee',
    viewBox: '0 0 320 320',
    kw: ['bouée', 'plage', 'mer', 'piscine', 'été', 'nautique'],
    parts: () => [
      ...inkRing(circle(160, 160, 134), circle(160, 160, 62), 11),
      ...[-70, 20, 110, 200].map((a) => fill(sector(160, 160, 66, 130, a, a + 40), INK)),
      ...shine('M110 70Q130 60 150 58', 6),
      ...stroke('M28 120Q10 160 28 200M292 120Q310 160 292 200', 6),
    ],
  },
  {
    id: 'objet-ancre',
    viewBox: '0 0 320 380',
    kw: ['ancre', 'mer', 'marin', 'bateau', 'port'],
    parts: () => [
      ...ink('M146 70L174 70L174 330L146 330Z', { w: 8 }),
      ...inkRing(circle(160, 48, 30), circle(160, 48, 13), 9),
      ...ink(rr(88, 104, 144, 24, 10), { w: 8 }),
      ...ink(
        'M34 238L74 222L64 262Q84 324 160 326Q236 324 256 262L246 222L286 238L278 266Q252 356 160 356Q68 356 42 266Z',
        { w: 10 },
      ),
      ...hatch('M160 330Q236 324 256 270L276 270Q252 350 160 352Z', { gap: 8 }),
      ...hatch('M146 140L160 140L160 320L146 320Z', { gap: 8 }),
    ],
  },
  {
    id: 'objet-theiere',
    viewBox: '0 0 420 320',
    kw: ['théière', 'thé', 'tasse', 'goûter', 'anglais'],
    parts: () => [
      ...ink('M94 140Q28 146 38 214Q48 258 104 246L102 222Q66 226 64 202Q62 170 98 166Z', { w: 9 }),
      ...ink('M300 176Q360 166 386 92L404 100Q388 194 312 226Z', { w: 9 }),
      ...ink(ell(200, 196, 124, 104), { w: 11 }),
      ...hatch('M276 128Q326 180 300 260Q280 280 250 290Q300 210 276 128Z', { gap: 9 }),
      ...ink('M136 106Q200 70 264 106Z', { w: 9 }),
      ...ink(circle(200, 74, 14), { w: 7, sketch: false }),
      fill(heart(190, 200, 30), INK),
      ...stroke('M100 150Q200 176 300 150', 4, { roughness: 1.4 }),
    ],
  },
  {
    id: 'objet-livre',
    viewBox: '0 0 420 290',
    kw: ['livre', 'lecture', 'carnet', 'histoire', 'journal'],
    parts: () => [
      ...ink('M30 240L18 254Q140 236 210 266Q280 236 402 254L390 240Z', { w: 8, sketch: false }),
      ...ink('M210 74Q140 42 30 62L30 242Q140 222 210 252Z', { w: 10 }),
      ...ink('M210 74Q280 42 390 62L390 242Q280 222 210 252Z', { w: 10 }),
      ...hatch('M210 80Q280 50 386 66L386 100Q280 80 210 110Z', { gap: 8 }),
      ...stroke(
        'M60 100Q130 92 186 108M60 136Q130 128 186 144M60 172Q130 164 186 180M60 208Q120 200 160 210',
        4,
      ),
      ...stroke('M236 140Q300 126 362 134M236 176Q300 162 362 170M236 212Q290 198 340 204', 4),
    ],
  },
  {
    id: 'objet-crayon',
    viewBox: '0 0 420 280',
    kw: ['crayon', 'écrire', 'dessin', 'carnet', 'école'],
    parts: () => [
      rotate(
        [
          ...ink('M90 110L350 110L350 170L90 170Z', { w: 10 }),
          ...stroke('M90 130L350 130M90 150L350 150', 4),
          ...ink('M90 110L28 140L90 170Z', { w: 9 }),
          fill('M28 140L50 129L50 151Z', INK),
          ...ink(rect(340, 110, 22, 60), { w: 7, sketch: false }),
          ...ink(rr(360, 110, 46, 60, 12), { w: 9 }),
          ...hatch(rr(360, 110, 46, 60, 12), { gap: 7, angle: 60, w: 2.2 }),
        ],
        -22,
        210,
        140,
      ),
    ],
  },
  {
    id: 'objet-enveloppe',
    viewBox: '0 0 400 290',
    kw: ['enveloppe', 'lettre', 'courrier', 'carte postale', 'message'],
    parts: () => [
      ...ink(rect(40, 52, 320, 204), { w: 11 }),
      ...hatch('M40 256L160 146L200 172L240 146L360 256Z', { gap: 10, angle: 30, w: 2 }),
      ...stroke('M40 256L160 146M360 256L240 146', 7),
      ...ink('M40 52L200 168L360 52Z', { w: 8 }),
      fill(heart(200, 166, 26), INK),
      ...accents(360, 52, 3, 26, -80, -10, 5),
    ],
  },
  {
    id: 'objet-timbre',
    viewBox: '0 0 300 360',
    kw: ['timbre', 'poste', 'carte postale', 'courrier', 'lettre'],
    parts: () => {
      let d = 'M30 30';
      for (let x = 30; x < 270; x += 20) d += `Q${x + 10} 44 ${x + 20} 30`;
      for (let y = 30; y < 330; y += 20) d += `Q256 ${y + 10} 270 ${y + 20}`;
      for (let x = 270; x > 30; x -= 20) d += `Q${x - 10} 316 ${x - 20} 330`;
      for (let y = 330; y > 30; y -= 20) d += `Q44 ${y - 10} 30 ${y - 20}`;
      d += 'Z';
      return [
        ...ink(d, { w: 8 }),
        ...ink(rect(66, 66, 168, 200), { w: 6, sketch: false }),
        ...hatch('M66 266L130 170L170 220L200 190L234 236L234 266Z', { gap: 8, angle: 40 }),
        ...stroke('M66 266L130 170L170 220L200 190L234 236', 5),
        fill(circle(186, 116, 20), INK),
        ...stroke('M90 296L210 296', 6),
      ];
    },
  },
  {
    id: 'objet-ampoule',
    viewBox: '0 0 280 390',
    kw: ['ampoule', 'idée', 'lumière', 'astuce'],
    parts: () => [
      ...ink(
        'M140 48Q236 48 236 144Q236 200 188 240L188 276L92 276L92 240Q44 200 44 144Q44 48 140 48Z',
        { w: 11 },
      ),
      ...hatch('M196 70Q232 100 230 150Q226 200 186 236L178 236Q214 180 196 70Z', { gap: 8 }),
      ...stroke('M112 236L112 180L126 160L140 180L154 160L168 180L168 236', 5),
      ...ink(rr(88, 276, 104, 24, 8), { w: 7, sketch: false }),
      ...ink(rr(94, 300, 92, 24, 8), { w: 7, sketch: false }),
      fill('M108 324L172 324L160 346L120 346Z', INK),
      ...stroke('M84 130Q90 96 118 82', 4),
      ...accents(140, 140, 5, 118, 200, 340),
    ],
  },
  {
    id: 'objet-bougie',
    viewBox: '0 0 240 400',
    kw: ['bougie', 'anniversaire', 'flamme', 'fête', 'lumière'],
    parts: () => [
      ...ink(
        'M66 160Q90 150 100 168Q104 196 112 168Q124 150 150 158Q170 150 174 162L174 380L66 380Z',
        { w: 10 },
      ),
      ...hatch('M146 170L170 168L170 374L150 374Z', { gap: 8 }),
      ...stroke('M118 150L118 124', 6),
      ...ink('M118 34Q160 82 140 116Q118 136 96 116Q76 82 118 34Z', { w: 8 }),
      fill('M118 76Q134 100 126 112Q118 120 110 112Q102 100 118 76Z', INK),
      ...accents(118, 84, 5, 64, 190, 350, 5),
    ],
  },
  {
    id: 'objet-cadeau',
    viewBox: '0 0 340 360',
    kw: ['cadeau', 'anniversaire', 'surprise', 'fête', 'noël'],
    parts: () => [
      ...ink('M170 116Q96 30 74 82Q66 124 170 116Z', { w: 9 }),
      ...ink('M170 116Q244 30 266 82Q274 124 170 116Z', { w: 9 }),
      ...ink(rect(46, 164, 248, 180), { w: 11 }),
      ...hatch('M250 168L290 168L290 340L262 340Z', { gap: 9 }),
      ...ink(rect(28, 114, 284, 58), { w: 10 }),
      fill(rect(150, 114, 40, 230), INK),
      ...stroke(rect(150, 114, 40, 230), 6),
      ...ink(circle(170, 114, 16), { w: 7, sketch: false }),
    ],
  },
  {
    id: 'objet-couronne',
    viewBox: '0 0 380 290',
    kw: ['couronne', 'roi', 'reine', 'princesse', 'château'],
    parts: () => [
      ...ink('M44 250L32 76L112 156L190 48L268 156L348 76L336 250Z', { w: 11 }),
      ...hatch('M282 150L340 86L330 246L296 246Z', { gap: 9 }),
      ...ink(rect(44, 206, 292, 44), { w: 8 }),
      ...hatch(rect(44, 206, 292, 44), { gap: 9, angle: 60, w: 2.2 }),
      fill(circle(32, 64, 14), INK),
      fill(circle(190, 34, 16), INK),
      fill(circle(348, 64, 14), INK),
      fill(heart(190, 160, 18), INK),
    ],
  },
  {
    id: 'objet-plume',
    viewBox: '0 0 400 400',
    kw: ['plume', 'écrire', 'oiseau', 'bohème', 'légèreté'],
    parts: () => [
      ...ink('M70 352Q110 186 348 40Q318 250 70 352Z', { w: 10 }),
      ...hatch('M90 340Q250 260 340 56Q320 250 90 340Z', { gap: 9, angle: 30 }),
      ...stroke('M36 384Q170 230 340 52', 7),
      ...stroke('M150 254L118 228M196 210L170 170M240 166L222 120M282 120L276 84', 5),
      ...stroke('M150 254L180 272M196 210L240 222M240 166L282 172M282 120L316 120', 5),
    ],
  },
  {
    id: 'objet-cadenas-amour',
    viewBox: '0 0 300 360',
    kw: ['cadenas', 'amour', 'pont', 'couple', 'coeur'],
    parts: () => [
      ...stroke('M90 160L90 100Q90 40 150 40Q210 40 210 100L210 160', 22),
      ...stroke('M90 160L90 100Q90 40 150 40Q210 40 210 100L210 160', 8, {
        stroke: PAPER,
        roughness: 0.4,
      }),
      ...ink(rr(46, 150, 208, 180, 28), { w: 11 }),
      ...hatch('M214 160Q246 160 248 190L248 300Q246 324 222 324Q236 240 214 160Z', { gap: 9 }),
      fill(heart(150, 236, 42), INK),
      ...shine('M128 216Q134 206 146 206', 4),
    ],
  },
];
