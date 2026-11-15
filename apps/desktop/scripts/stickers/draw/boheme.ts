/**
 * The "Bohème" set: thin black line art over a soft organic colour blob, with dots and sparkles
 * (`boheme-ligne.ts`); and flat colour flowers, sprigs and tropical plants (`boheme-fleurs.ts`).
 * See `docs/design/stickers-style.md`.
 */
import type { Drawing } from './core.ts';
import { FLEURS } from './boheme-fleurs.ts';
import { LIGNE } from './boheme-ligne.ts';

export const SET = {
  id: 'boheme',
  name: 'Bohème',
  order: 3,
  categories: {
    ligne: 'Ligne et couleur',
    fleur: 'Fleurs',
    brin: 'Brins et feuilles',
    tropique: 'Tropiques',
  },
};

export const DRAWINGS: Drawing[] = [...LIGNE, ...FLEURS];
