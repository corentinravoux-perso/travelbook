/**
 * Political perspectives of the divisions. Overture lets a division say from whose point of view
 * it is true (`perspectives: { mode, countries }`): Chinese "South Tibet" (藏南) is listed as a
 * region of India, on top of Arunachal Pradesh, which it covers. A subject draws the regions of
 * its own country's point of view only, so that a rival claim never replaces or cuts a real region.
 *
 * The rule, for the country of the subject (`def.country`, ISO 3166-1 alpha-2):
 *   - no perspectives: kept (the division is not disputed);
 *   - `accepted_by`: kept when the country is in the list, left out otherwise;
 *   - `disputed_by`: left out when the country is in the list, kept otherwise.
 *
 * Overture 2026-10-21.0 fills the `perspectives` columns of `division` and `division_boundary`
 * for no row at all (checked: 0 of 4 700 999 divisions, 0 boundaries), and `division_area` has no
 * such column, so `PERSPECTIVE_OVERRIDES` records the disputed divisions we know of by hand. The
 * build also asks Overture (`fetchPerspectives`), so a later release that fills them works
 * without a change here.
 */
import type { Feature } from './simplify.ts';

export type PerspectiveMode = 'accepted_by' | 'disputed_by';

export interface Perspectives {
  mode: PerspectiveMode;
  /** ISO 3166-1 alpha-2 codes. */
  countries: string[];
}

/** A division of `country`, named by its Overture area id or its ISO 3166-2 code. */
export interface DivisionPerspective {
  country: string;
  id: string;
  perspectives: Perspectives;
}

/** Whether `country` takes the division with these perspectives as its own. */
export function acceptedBy(
  perspectives: Perspectives | null | undefined,
  country: string,
): boolean {
  if (!perspectives) return true;
  const listed = perspectives.countries.includes(country);
  return perspectives.mode === 'accepted_by' ? listed : !listed;
}

/**
 * Divisions that carry a perspective in the data we build from, written by hand because Overture
 * does not (see above). Each was found from an overlap in the world run.
 */
export const PERSPECTIVE_OVERRIDES: DivisionPerspective[] = [
  {
    // "South Tibet": the Chinese claim on most of Arunachal Pradesh, listed under India (IN-AR is
    // 06a778a5-2107-4114-b086-c2f45550ddeb). It has no ISO 3166-2 code and no boundary.
    country: 'IN',
    id: '62e7b386-6708-4787-94d4-90c20cbbf7f8',
    perspectives: { mode: 'accepted_by', countries: ['CN'] },
  },
];

export interface PerspectiveFilter {
  kept: Feature[];
  /** The features that `country` does not accept, with the perspectives that left them out. */
  left: { feature: Feature; perspectives: Perspectives }[];
}

/**
 * Keep the features of `country` whose perspectives it accepts. A feature is matched on its `id`
 * property (the Overture area id, or the ISO 3166-2 code of a region). The order is kept.
 */
export function keepOwnPerspective(
  features: Feature[],
  country: string,
  known: DivisionPerspective[],
): PerspectiveFilter {
  const byId = new Map(
    known.filter((k) => k.country === country).map((k) => [k.id, k.perspectives]),
  );
  const kept: Feature[] = [];
  const left: PerspectiveFilter['left'] = [];
  for (const feature of features) {
    const perspectives = byId.get(String(feature.properties.id));
    if (acceptedBy(perspectives, country)) kept.push(feature);
    else if (perspectives) left.push({ feature, perspectives });
  }
  return { kept, left };
}
