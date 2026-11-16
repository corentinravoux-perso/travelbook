/**
 * The list of subjects a map can show: every country, every dependency, and the overseas parts a
 * reader thinks of as a destination of their own (design §1.2).
 */
import type { CatalogEntry } from './overture.ts';

export type SubjectKind = 'country' | 'dependency' | 'overseas';

export interface SubjectDef {
  /** `TH`, `FR-MET`, `FR-MQ`, `US-HI`. */
  id: string;
  /** ISO 3166-1 alpha-2 of the data the subject is cut from. */
  iso: string;
  kind: SubjectKind;
  /** Overture country code whose land polygon (or part of it) is the subject. */
  country: string;
  /** For a part of a country: the first-level region that is the subject, and its sub-divisions. */
  part?: { region: string; subdivisions: 'county' };
  /** Overrides Overture's French name. */
  nameFr?: string;
  /** Country codes whose land is never drawn as a neighbour (the subject's own country). */
  skipNeighbours: string[];
}

/** French overseas departments: Overture holds each as its own dependency. */
const FRENCH_OVERSEAS = ['GF', 'GP', 'MQ', 'RE', 'YT'];

/**
 * The ISO code a places file is named after: the overseas departments of France share `FR`'s file,
 * like their subjects (`FR-MQ`); every other code is its own.
 */
export const placesIso = (code: string): string => (FRENCH_OVERSEAS.includes(code) ? 'FR' : code);

/** Parts of a country that are subjects too, besides the country itself. */
const PARTS: SubjectDef[] = [
  {
    id: 'US-HI',
    iso: 'US',
    kind: 'overseas',
    country: 'US',
    part: { region: 'US-HI', subdivisions: 'county' },
    nameFr: 'Hawaï',
    skipNeighbours: ['US'],
  },
  {
    id: 'US-AK',
    iso: 'US',
    kind: 'overseas',
    country: 'US',
    part: { region: 'US-AK', subdivisions: 'county' },
    nameFr: 'Alaska',
    skipNeighbours: ['US'],
  },
];

export function subjectDefs(catalog: CatalogEntry[]): SubjectDef[] {
  const defs: SubjectDef[] = [];
  for (const entry of catalog) {
    const iso = entry.country;
    if (iso === 'FR') {
      defs.push({
        id: 'FR-MET',
        iso,
        kind: 'overseas',
        country: iso,
        nameFr: 'France métropolitaine',
        skipNeighbours: [iso],
      });
    } else if (FRENCH_OVERSEAS.includes(iso)) {
      defs.push({ id: `FR-${iso}`, iso, kind: 'overseas', country: iso, skipNeighbours: [iso] });
    } else {
      defs.push({ id: iso, iso, kind: entry.subtype, country: iso, skipNeighbours: [iso] });
    }
  }
  if (catalog.some((entry) => entry.country === 'US')) defs.push(...PARTS);
  return defs.sort((a, b) => a.id.localeCompare(b.id));
}

/** `--only=FR,US-HI`: an id, an ISO code, or the prefix of an id (`FR` selects every `FR-*`). */
export function selectSubjects(defs: SubjectDef[], only: string[] | undefined): SubjectDef[] {
  if (only === undefined) return defs;
  const wanted = new Set(only.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const picked = defs.filter(
    (def) => wanted.has(def.id) || wanted.has(def.iso) || wanted.has(def.id.split('-')[0] ?? ''),
  );
  const known = new Set(picked.flatMap((d) => [d.id, d.iso, d.id.split('-')[0] ?? '']));
  const unknown = [...wanted].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`unknown subject(s): ${unknown.join(', ')}`);
  return picked;
}
