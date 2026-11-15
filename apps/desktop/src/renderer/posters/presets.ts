import { PosterPresetSchema, type PosterPreset } from '@travelbook/core';
import destinations from '../../../resources/posters/destinations.json';
import chine from '../../../resources/posters/presets/chine.json';
import perou from '../../../resources/posters/presets/perou.json';
import suede from '../../../resources/posters/presets/suede.json';
import japon from '../../../resources/posters/presets/japon.json';
import sicile from '../../../resources/posters/presets/sicile.json';
import antilles from '../../../resources/posters/presets/antilles.json';
import costa_rica from '../../../resources/posters/presets/costa-rica.json';
import thailande from '../../../resources/posters/presets/thailande.json';
import californie from '../../../resources/posters/presets/californie.json';
import kenya from '../../../resources/posters/presets/kenya.json';
import crete from '../../../resources/posters/presets/crete.json';
import italie from '../../../resources/posters/presets/italie.json';
import ecosse from '../../../resources/posters/presets/ecosse.json';

/**
 * The poster presets of `resources/posters/presets/<destination>.json`, bundled with the
 * renderer and parsed once. One import per destination, in the order of
 * `resources/posters/destinations.json` (a test checks that no file is left out).
 */
const FILES: unknown[] = [
  chine,
  perou,
  suede,
  japon,
  sicile,
  antilles,
  costa_rica,
  thailande,
  californie,
  kenya,
  crete,
  italie,
  ecosse,
];

export const POSTER_PRESETS: PosterPreset[] = FILES.flatMap((file) =>
  (file as unknown[]).map((entry) => PosterPresetSchema.parse(entry)),
);

/** The destinations, in the order of the design, with their French labels. */
export const POSTER_DESTINATIONS: { id: string; label: string }[] = destinations;

/** The presets of a destination, or all of them. */
export function presetsOf(destination: string): PosterPreset[] {
  return destination === 'all'
    ? POSTER_PRESETS
    : POSTER_PRESETS.filter((p) => p.destination === destination);
}
