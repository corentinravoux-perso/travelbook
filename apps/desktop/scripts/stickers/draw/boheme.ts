/**
 * The "Bohème" set: thin black line art over a soft organic colour blob, with dots and sparkles
 * (`boheme-ligne.ts`); flat colour flowers, sprigs and tropical plants (`boheme-fleurs.ts`);
 * and the travel drawings (`boheme-voyage-a.ts`, `boheme-voyage-b.ts`).
 * See `docs/design/stickers-style.md`.
 */
import type { Drawing } from './core.ts';
import { FLEURS } from './boheme-fleurs.ts';
import { LIGNE } from './boheme-ligne.ts';
import { VOYAGE_A } from './boheme-voyage-a.ts';
import { VOYAGE_B } from './boheme-voyage-b.ts';

export const SET = {
  id: 'boheme',
  name: 'Bohème',
  order: 3,
  categories: {
    ligne: 'Ligne et couleur',
    fleur: 'Fleurs',
    brin: 'Brins et feuilles',
    tropique: 'Tropiques',
    monument: 'Monuments',
    transport: 'Transports',
    paysage: 'Paysages',
    plage: 'Mer et plage',
    carnet: 'Carnet de voyage',
    saveur: 'Saveurs du monde',
  },
};

export const DRAWINGS: Drawing[] = [...LIGNE, ...FLEURS, ...VOYAGE_A, ...VOYAGE_B];
