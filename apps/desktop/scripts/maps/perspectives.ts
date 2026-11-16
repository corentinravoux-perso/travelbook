/**
 * Political perspectives of the divisions. Overture lets a division say from whose point of view
 * it is true (`perspectives: { mode, countries }`): Chinese "South Tibet" (藏南) is listed as a
 * region of India, on top of Arunachal Pradesh, which it covers. A subject draws the regions of
 * its own country's point of view only, so that a rival claim never replaces or cuts a real region.
 *
 * The rule, for the "viewers" of the subject: its own country (`def.country`, ISO 3166-1 alpha-2)
 * and, for a dependency the subjects know the sovereign of (the French overseas departments:
 * `MQ` and `FR`), that sovereign, because a perspective names sovereign states:
 *   - no perspectives: kept (the division is not disputed);
 *   - `accepted_by`: kept when a viewer is in the list, left out otherwise;
 *   - `disputed_by`: left out when a viewer is in the list, kept otherwise.
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
  /** The Overture area id; for a `region`, also its ISO 3166-2 code (an entry of its own). */
  id: string;
  /** The Overture subtype of the area (`region`, `county`...): the level whose features it names. */
  subtype: string;
  perspectives: Perspectives;
}

/** Whether one of the `viewers` (a country, or a country and its sovereign) takes the division as its own. */
export function acceptedBy(
  perspectives: Perspectives | null | undefined,
  viewers: string | string[],
): boolean {
  if (!perspectives) return true;
  const listed = [viewers].flat().some((v) => perspectives.countries.includes(v));
  return perspectives.mode === 'accepted_by' ? listed : !listed;
}

/** One land area whose division carries perspectives, as the Overture query returns it. */
export interface PerspectiveRow {
  id: string;
  /** ISO 3166-2 code, or null. For a county or a locality it is the code of the region holding it. */
  region: string | null;
  country: string;
  subtype: string;
  mode: PerspectiveMode;
  countries: string[];
}

/**
 * The entries of the rows: one per area id, and, for a `region` only, one per ISO 3166-2 code (a
 * region level whose codes are unique names its features by code). A county's `region` is the code
 * of the region that holds it, never its own: registering it would leave a real region out.
 */
export function perspectiveEntries(rows: PerspectiveRow[]): DivisionPerspective[] {
  return rows.flatMap((r) => {
    const perspectives = { mode: r.mode, countries: r.countries };
    const ids = [r.id, ...(r.subtype === 'region' && r.region ? [r.region] : [])];
    return ids.map((id) => ({ country: r.country, id, subtype: r.subtype, perspectives }));
  });
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
    subtype: 'region',
    perspectives: { mode: 'accepted_by', countries: ['CN'] },
  },
];

export interface PerspectiveFilter {
  kept: Feature[];
  /** The features that no viewer accepts, with the perspectives that left them out. */
  left: { feature: Feature; perspectives: Perspectives }[];
}

/**
 * Keep the features of `country` that one of its `viewers` accepts (default: the country itself).
 * A feature is matched on its `id` property (the Overture area id, or the ISO 3166-2 code of a
 * region) against the entries of `country`. The order is kept.
 */
export function keepOwnPerspective(
  features: Feature[],
  country: string,
  known: DivisionPerspective[],
  viewers: string[] = [country],
): PerspectiveFilter {
  const byId = new Map(
    known.filter((k) => k.country === country).map((k) => [k.id, k.perspectives]),
  );
  const kept: Feature[] = [];
  const left: PerspectiveFilter['left'] = [];
  for (const feature of features) {
    const perspectives = byId.get(String(feature.properties.id));
    if (acceptedBy(perspectives, viewers)) kept.push(feature);
    else if (perspectives) left.push({ feature, perspectives });
  }
  return { kept, left };
}

/**
 * The entries of `country` at this `level` that match no feature of `features`: an override whose
 * area was given a new id in a later Overture release no longer does anything, silently.
 */
export function unmatchedOverrides(
  features: Feature[],
  country: string,
  level: string,
  overrides: DivisionPerspective[],
): DivisionPerspective[] {
  const present = new Set(features.map((f) => String(f.properties.id)));
  return overrides.filter(
    (o) => o.country === country && o.subtype === level && !present.has(o.id),
  );
}

/** Share of a level above which the filter is suspicious (a wrong perspective list, not a claim). */
export const FILTER_SUSPECT_SHARE = 0.2;

/** A warning when the filter removed every feature of a level, or more than 20 % of them. */
export function filterWarning(total: number, left: number): string | null {
  if (total > 0 && left === total) return 'it removed every one of them';
  if (total > 0 && left / total > FILTER_SUSPECT_SHARE) {
    return `it removed ${Math.round((left / total) * 100)} % of them (more than 20 %)`;
  }
  return null;
}
