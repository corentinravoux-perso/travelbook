import type { Licence } from '../schema';

/**
 * The licence of every map geometry, as `resources/LICENCES.json` records the bundled map data:
 * the outlines come from Overture Maps (divisions theme), derived from OpenStreetMap, under ODbL
 * 1.0. The geometry asset carries it so the album's credits list it; the credits fall back on it
 * for a geometry saved without, as the attribution is owed whatever the file says.
 */
export const MAP_LICENCE: Readonly<Licence> = {
  source: 'Overture Maps Foundation, divisions theme',
  author: '© OpenStreetMap contributors, Overture Maps Foundation',
  licence: 'ODbL 1.0',
  url: 'https://docs.overturemaps.org/attribution/',
  requiresAttribution: true,
};
