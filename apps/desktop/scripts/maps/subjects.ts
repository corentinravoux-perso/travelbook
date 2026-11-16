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
const FRENCH_DEPARTMENTS = ['GF', 'GP', 'MQ', 'RE', 'YT'];

/**
 * The ISO code a places file is named after: the overseas departments of France share `FR`'s file,
 * like their subjects (`FR-MQ`); every other code is its own.
 */
export const placesIso = (code: string): string =>
  FRENCH_DEPARTMENTS.includes(code) ? 'FR' : code;

/**
 * The sovereign state of every dependency of the catalogue (Overture 2026-10-21.0 carries no
 * parent country in `catalog.json`, so the table is written by hand; a test checks that every
 * dependency the cached catalogue yields is listed). Perspectives name sovereign states.
 */
export const SOVEREIGN_OF: Readonly<Record<string, string>> = {
  AI: 'GB',
  AS: 'US',
  AW: 'NL',
  AX: 'FI',
  BL: 'FR',
  BM: 'GB',
  BQ: 'NL',
  BV: 'NO',
  CC: 'AU',
  CK: 'NZ',
  CP: 'FR',
  CW: 'NL',
  CX: 'AU',
  FK: 'GB',
  FO: 'DK',
  GF: 'FR',
  GG: 'GB',
  GI: 'GB',
  GL: 'DK',
  GP: 'FR',
  GS: 'GB',
  GU: 'US',
  HK: 'CN',
  HM: 'AU',
  IM: 'GB',
  IO: 'GB',
  JE: 'GB',
  KY: 'GB',
  MF: 'FR',
  MO: 'CN',
  MP: 'US',
  MQ: 'FR',
  MS: 'GB',
  NC: 'FR',
  NF: 'AU',
  NU: 'NZ',
  PF: 'FR',
  PM: 'FR',
  PN: 'GB',
  PR: 'US',
  RE: 'FR',
  SH: 'GB',
  SJ: 'NO',
  SX: 'NL',
  TC: 'GB',
  TF: 'FR',
  TK: 'NZ',
  UM: 'US',
  VG: 'GB',
  VI: 'US',
  WF: 'FR',
  XE: 'NL',
  XJ: 'NO',
  XS: 'NL',
  YT: 'FR',
};

/**
 * The countries whose point of view a subject draws (see `perspectives.ts`): its own code and,
 * for a dependency, its sovereign (`HK` also views as `CN`, `GI` as `GB`, `FR-MQ` as `FR`).
 */
export const viewersOf = (def: SubjectDef): string[] => {
  const sovereign = SOVEREIGN_OF[def.country];
  return [...new Set([def.country, sovereign].filter((c): c is string => c !== undefined))];
};

/** The ISO codes, one each, of the subjects (the places files they share): `FR-MQ` is `FR`. */
export const isosOf = (subjects: { id: string }[]): string[] => [
  ...new Set(subjects.map((s) => s.id.split('-')[0] ?? s.id)),
];

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
    } else if (FRENCH_DEPARTMENTS.includes(iso)) {
      defs.push({ id: `FR-${iso}`, iso, kind: 'overseas', country: iso, skipNeighbours: [iso] });
    } else {
      defs.push({ id: iso, iso, kind: entry.subtype, country: iso, skipNeighbours: [iso] });
    }
  }
  if (catalog.some((entry) => entry.country === 'US')) defs.push(...PARTS);
  return defs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * `--only=FR,US-HI`: an id, an ISO code, or the prefix of an id (`FR` selects every `FR-*`). An
 * empty selection throws: a step that rebuilt "no subject" would still prune what the index does
 * not list, that is every other subject.
 */
export function selectSubjects(defs: SubjectDef[], only: string[] | undefined): SubjectDef[] {
  const picked = only === undefined ? defs : pick(defs, only);
  if (picked.length === 0) {
    throw new Error(
      only === undefined
        ? 'the catalogue holds no subject'
        : `--only=${only.join(',')} selects no subject`,
    );
  }
  return picked;
}

function pick(defs: SubjectDef[], only: string[]): SubjectDef[] {
  const wanted = new Set(only.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const picked = defs.filter(
    (def) => wanted.has(def.id) || wanted.has(def.iso) || wanted.has(def.id.split('-')[0] ?? ''),
  );
  const known = new Set(picked.flatMap((d) => [d.id, d.iso, d.id.split('-')[0] ?? '']));
  const unknown = [...wanted].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`unknown subject(s): ${unknown.join(', ')}`);
  return picked;
}
