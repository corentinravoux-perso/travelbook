/**
 * Tourist sights from Wikidata, one SPARQL query per country, at build time. Raw responses are
 * cached in `scripts/maps/.cache/wikidata/<iso>.json` (git-ignored), so a rebuild is offline.
 * Wikidata is CC0.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './overture.ts';

/** Generic on purpose: no personal contact detail goes to a third-party service. */
export const USER_AGENT = 'travelbook-build/0.1 (https://github.com/corentinravoux/travelbook)';
export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export type SightCategory =
  'patrimoine' | 'nature' | 'plage' | 'montagne' | 'religieux' | 'ville' | 'autre';

/** What `fetchSights` keeps of one Wikidata item, after merging the rows of the query. */
export interface RawSight {
  qid: string;
  name: string;
  lon: number;
  lat: number;
  links: number;
  worldHeritage: boolean;
  parents: string[];
  types: string[];
}

const WORLD_HERITAGE = 'Q9259';
/** UNESCO sites count from this many Wikipedia editions; the parts of a site are often at 2-3. */
const MIN_LINKS_HERITAGE = 5;
/** Any other attraction needs this many, which keeps the list to what a traveller has heard of. */
const MIN_LINKS_ATTRACTION = 8;
/** Rows kept per country before merging, most linked first. */
const QUERY_LIMIT = 500;

/**
 * The instance-of classes that make an item an attraction (besides a World Heritage statement),
 * each with the category it gives. Order matters in `categoryOf`: the first matching group wins.
 */
/** Parks and reserves: nature even when the site is also World Heritage. */
const PARK = ['Q46169', 'Q179049'];
/** Natural features: nature, unless the site is World Heritage (Delos is an island and ruins). */
const NATURE = ['Q34038', 'Q23442', 'Q23397', 'Q35509'];
const BEACH = ['Q40080'];
const MOUNTAIN = ['Q8502', 'Q8072', 'Q207326'];
const RELIGIOUS = [
  'Q16970',
  'Q32815',
  'Q44539',
  'Q5393308',
  'Q2977',
  'Q160742',
  'Q34627',
  'Q108325',
  'Q120560',
  'Q1370598',
  'Q1128397',
  'Q2742013',
];
const HERITAGE = ['Q839954', 'Q23413', 'Q4989906', 'Q570116', 'Q33506', 'Q811979', 'Q12280'];
/** A sight that is itself a city or district: kept only when no listed city is near. */
const URBAN = ['Q515', 'Q702492', 'Q484170', 'Q3957', 'Q532', 'Q1549591', 'Q15243209'];

/**
 * The classes the query starts from. A subset of the groups above: Wikidata's 60 s limit rules out
 * the classes with the most instances (mountain, island, lake, mosque, museum, protected area:
 * measured 20-40 s each for France alone). Items of those classes are still recognised when they
 * are World Heritage sites.
 */
export const SEED_TYPES = [
  'Q46169',
  'Q179049',
  'Q34038',
  'Q35509',
  'Q40080',
  'Q8072',
  'Q207326',
  'Q16970',
  'Q44539',
  'Q5393308',
  'Q2977',
  'Q160742',
  'Q34627',
  'Q120560',
  'Q839954',
  'Q23413',
  'Q570116',
];

/** When the full query times out (the United States do), these cheap classes are still enough. */
export const LIGHT_SEED_TYPES = ['Q46169', 'Q34038', 'Q40080', 'Q8072', 'Q570116'];

/** The SPARQL text for one country (`P297` is the ISO 3166-1 alpha-2 code of a country). */
export function sightsQuery(iso: string, seeds: string[] = SEED_TYPES): string {
  if (!/^[A-Z]{2}$/.test(iso)) throw new Error(`bad country code ${iso}`);
  return `SELECT ?item ?itemLabel ?coord ?links ?wh ?parent (GROUP_CONCAT(DISTINCT ?t; separator=",") AS ?types) WHERE {
  {
    SELECT DISTINCT ?item ?coord ?links ?wh WHERE {
      # A subquery binds the country first: as a plain triple pattern it makes FR time out (60 s).
      { SELECT ?country WHERE { ?country wdt:P297 "${iso}" } LIMIT 1 }
      {
        ?item wdt:P1435 wd:${WORLD_HERITAGE} ; wdt:P17 ?country ; wdt:P625 ?coord ; wikibase:sitelinks ?links .
        BIND(true AS ?wh)
        FILTER(?links >= ${MIN_LINKS_HERITAGE})
      } UNION {
        VALUES ?seed { ${seeds.map((q) => `wd:${q}`).join(' ')} }
        ?item wdt:P31 ?seed ; wdt:P17 ?country ; wdt:P625 ?coord ; wikibase:sitelinks ?links .
        FILTER(?links >= ${MIN_LINKS_ATTRACTION})
      }
    } ORDER BY DESC(?links) LIMIT ${QUERY_LIMIT}
  }
  OPTIONAL { ?item wdt:P361 ?parent . }
  OPTIONAL { ?item wdt:P31 ?type . }
  BIND(STRAFTER(STR(?type), "entity/") AS ?t)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} GROUP BY ?item ?itemLabel ?coord ?links ?wh ?parent`;
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 5;

export class SparqlError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`wikidata: HTTP ${status}`);
    this.status = status;
  }
}

/** `Retry-After` is a number of seconds or an HTTP date; returns milliseconds (default 30 s). */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (header === null) return 30_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? 30_000 : Math.max(0, date - now);
}

/**
 * One SPARQL query: generic User-Agent, waits for `Retry-After` on HTTP 429, retries a busy server
 * (502, 503). Any other failure, 500 and 504 (the 60 s limit) included, throws a `SparqlError`.
 */
export async function runSparql(
  query: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = realSleep,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetchImpl(`${SPARQL_ENDPOINT}?${new URLSearchParams({ query })}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    });
    if (response.ok) return response.text();
    const retryable = [429, 502, 503].includes(response.status);
    if (!retryable || attempt === MAX_ATTEMPTS) throw new SparqlError(response.status);
    await sleep(
      response.status === 429
        ? retryAfterMs(response.headers.get('Retry-After'))
        : 5_000 * 2 ** (attempt - 1),
    );
  }
}

/** The full query, then the light one if the full one hit Wikidata's time limit. */
export async function runSightsQuery(
  iso: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = realSleep,
): Promise<string> {
  try {
    return await runSparql(sightsQuery(iso), fetchImpl, sleep);
  } catch (error) {
    if (!(error instanceof SparqlError) || ![500, 504].includes(error.status)) throw error;
    console.warn(`${iso}: Wikidata timed out, retrying with the light query`);
    return runSparql(sightsQuery(iso, LIGHT_SEED_TYPES), fetchImpl, sleep);
  }
}

/** Raw SPARQL JSON for one country, from the cache when present. */
export async function fetchSights(iso: string): Promise<string> {
  const path = join(CACHE_DIR, 'wikidata', `${iso}.json`);
  try {
    return await readFile(path, 'utf8');
  } catch {
    const raw = await runSightsQuery(iso);
    await mkdir(join(CACHE_DIR, 'wikidata'), { recursive: true });
    await writeFile(path, raw);
    return raw;
  }
}

interface Binding {
  [name: string]: { value: string } | undefined;
}

/** Rows of the query merged by item: a row per parent becomes one sight with its parents. */
export function parseSights(raw: string): RawSight[] {
  const bindings = (JSON.parse(raw) as { results: { bindings: Binding[] } }).results.bindings;
  const byQid = new Map<string, RawSight>();
  for (const row of bindings) {
    const qid = row.item?.value.split('/').pop();
    const name = row.itemLabel?.value;
    const point = /^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(row.coord?.value ?? '');
    // An item without a label shows its own id: nothing to print on a map.
    if (!qid || !name || name === qid || !point) continue;
    let sight = byQid.get(qid);
    if (!sight) {
      sight = {
        qid,
        name,
        lon: Number(point[1]),
        lat: Number(point[2]),
        links: Number(row.links?.value ?? 0),
        worldHeritage: false,
        parents: [],
        types: [],
      };
      byQid.set(qid, sight);
    }
    if (row.wh?.value === 'true') sight.worldHeritage = true;
    const parent = row.parent?.value.split('/').pop();
    if (parent && !sight.parents.includes(parent)) sight.parents.push(parent);
    for (const type of (row.types?.value ?? '').split(',')) {
      if (type && !sight.types.includes(type)) sight.types.push(type);
    }
  }
  // Machu Picchu is an instance of "World Heritage Site" without a P1435 statement of that kind.
  for (const sight of byQid.values()) {
    if (sight.types.includes(WORLD_HERITAGE)) sight.worldHeritage = true;
  }
  return [...byQid.values()];
}

const has = (types: string[], group: string[]): boolean => types.some((t) => group.includes(t));

/** A sight that is itself a city, town or district. */
export const isUrban = (sight: Pick<RawSight, 'types'>): boolean => has(sight.types, URBAN);

/**
 * Category of a sight, first match wins:
 *   1. nature: a national park or nature reserve (also when World Heritage)
 *   2. plage: a beach, or "plage" in the French name
 *   3. montagne: a mountain or volcano
 *   4. nature: a waterfall, lake, island or cave, unless World Heritage
 *   5. patrimoine: any other World Heritage site
 *   6. religieux: a place of worship
 *   7. ville: a city or district
 *   8. patrimoine: an archaeological site, castle, monument, museum or listed attraction
 *   9. autre
 */
export function categoryOf(
  sight: Pick<RawSight, 'types' | 'name' | 'worldHeritage'>,
): SightCategory {
  const { types, name } = sight;
  if (has(types, PARK) || /\b(parc national|réserve naturelle|parc naturel)\b/i.test(name)) {
    return 'nature';
  }
  if (has(types, BEACH) || /\bplage\b/i.test(name)) return 'plage';
  if (has(types, MOUNTAIN)) return 'montagne';
  if (sight.worldHeritage) return 'patrimoine';
  if (has(types, NATURE)) return 'nature';
  if (has(types, RELIGIOUS)) return 'religieux';
  if (isUrban(sight)) return 'ville';
  if (has(types, HERITAGE)) return 'patrimoine';
  return 'autre';
}
