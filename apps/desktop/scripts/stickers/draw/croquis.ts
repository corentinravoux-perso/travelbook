/**
 * The "Croquis" set: bold black hand-drawn ink, white fill, a second sketchy line, hatching for
 * the shadow side and a few accent strokes. See `docs/design/stickers-style.md`.
 */
import { type Drawing, INK, PAPER, fill, hatch, heart, ink, stroke } from './core.ts';
import { accents, cpts, inkArrow } from './croquis-kit.ts';
import { FLECHES } from './croquis-fleches.ts';
import { GOURMAND } from './croquis-gourmand.ts';
import { METEO } from './croquis-meteo.ts';
import { OBJETS } from './croquis-objets.ts';
import { SIGNES } from './croquis-signes.ts';
import { VOYAGE } from './croquis-voyage.ts';

export const SET = {
  id: 'croquis',
  name: 'Croquis',
  order: 2,
  categories: {
    objet: 'Objets',
    meteo: 'Météo',
    signe: 'Signes',
    fleche: 'Flèches',
    voyage: 'Voyage',
    gourmand: 'Gourmandises',
  },
};

export const DRAWINGS: Drawing[] = [
  {
    id: 'objet-tasse-coeur',
    viewBox: '0 0 420 300',
    kw: ['tasse', 'café', 'thé', 'mug', 'coeur', 'petit déjeuner'],
    parts: () => {
      const body = 'M60 52L300 52Q306 190 258 246Q240 266 180 266Q120 266 102 246Q54 190 60 52Z';
      const handle = 'M296 88C376 74 392 214 272 222L278 190C344 186 342 112 300 120Z';
      return [
        ...ink(handle, { w: 10 }),
        ...ink(body, { w: 11 }),
        ...hatch('M246 62L292 62Q296 176 256 236L238 240Q276 178 246 62Z', { gap: 10 }),
        ...stroke('M74 72Q180 82 288 72', 4, { roughness: 1.4 }),
        fill(heart(168, 160, 40), INK),
        ...stroke('M150 140Q156 132 164 134', 3, { stroke: PAPER }),
      ];
    },
  },
  {
    id: 'meteo-eclair',
    viewBox: '0 0 300 420',
    kw: ['éclair', 'orage', 'foudre', 'énergie', 'flash'],
    parts: () => {
      const front = 'M168 18L72 214L146 214L104 396L236 158L162 158L216 18Z';
      const side = 'M216 18L234 30L182 150L256 150L120 402L104 396L236 158L162 158Z';
      return [
        ...ink(side, { w: 8, sketch: false }),
        ...hatch(side, { gap: 8, angle: -60 }),
        ...ink(front, { w: 10 }),
        ...stroke('M160 46L104 176', 4, { roughness: 1.5 }),
      ];
    },
  },
  {
    id: 'objet-lunettes-soleil',
    viewBox: '0 0 440 230',
    kw: ['lunettes', 'soleil', 'été', 'plage', 'vacances', 'cool'],
    parts: () => {
      const frame =
        'M22 44L418 44L414 76L400 80Q392 170 330 176L266 176Q228 170 222 96L218 96Q212 170 174 176L110 176Q48 170 40 80L26 76Z';
      const lensL = 'M60 82L200 82Q198 150 166 156L112 156Q64 152 60 82Z';
      const lensR = 'M240 82L380 82Q376 152 328 156L274 156Q242 150 240 82Z';
      return [
        ...stroke('M24 52L6 40', 10),
        ...stroke('M416 52L434 40', 10),
        ...ink(frame, { w: 10 }),
        fill(lensL, INK),
        fill(lensR, INK),
        ...stroke(lensL, 5, { roughness: 1 }),
        ...stroke(lensR, 5, { roughness: 1 }),
        ...stroke('M86 140L134 92', 7, { stroke: PAPER }),
        ...stroke('M110 146L150 106', 4, { stroke: PAPER }),
        ...stroke('M266 140L314 92', 7, { stroke: PAPER }),
        ...stroke('M290 146L330 106', 4, { stroke: PAPER }),
        ...accents(220, 120, 3, 150, 250, 290),
      ];
    },
  },
  {
    id: 'fleche-courbe-haut',
    viewBox: '0 0 300 420',
    kw: ['flèche', 'courbe', 'haut', 'direction'],
    parts: () => [
      ...inkArrow(cpts([232, 398], [222, 250], [186, 150], [100, 104]), 48, 60, 78),
      ...stroke('M262 300Q282 344 270 398', 4, { roughness: 1.6 }),
      ...stroke('M40 170Q34 210 44 240', 4, { roughness: 1.6 }),
    ],
  },
  ...OBJETS,
  ...GOURMAND,
  ...METEO,
  ...SIGNES,
  ...FLECHES,
  ...VOYAGE,
];
