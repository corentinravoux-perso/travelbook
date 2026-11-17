/**
 * Tourist sights from Wikidata, one SPARQL query per country, at build time. Raw responses are
 * cached in `scripts/maps/.cache/wikidata/<iso>.json` (git-ignored), so a rebuild is offline.
 * Wikidata is CC0.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './overture.ts';

/** Generic on purpose: no personal contact detail goes to a third-party service. */
export const USER_AGENT =
  'travelbook-build/0.1 (https://github.com/corentinravoux-perso/travelbook)';
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
  /** The label is French (else it is the English fallback of the label service). */
  french: boolean;
}

const WORLD_HERITAGE = 'Q9259';
/** Rows kept per class and country before merging, most linked first. */
const QUERY_LIMIT = 300;

/**
 * The instance-of classes that make an item an attraction (besides a World Heritage statement),
 * each with the category it gives. Order matters in `categoryOf`: the first matching group wins.
 */
/** Parks and reserves: nature even when the site is also World Heritage. */
const PARK = ['Q46169', 'Q179049'];
/** Natural features: nature, unless the site is World Heritage (Delos is an island and ruins). */
const NATURE = ['Q34038', 'Q23442', 'Q23397', 'Q35509', 'Q150784'];
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
const HERITAGE = [
  'Q839954',
  'Q23413',
  'Q4989906',
  'Q570116',
  'Q33506',
  'Q811979',
  'Q12280',
  'Q16560',
];
/** A sight that is itself a city or district: kept only when no listed city is near. */
const URBAN = ['Q515', 'Q702492', 'Q484170', 'Q3957', 'Q532', 'Q1549591', 'Q15243209'];

/**
 * One small query per class of attraction and country: each stays well under Wikidata's 60 s limit
 * (a single query over every class timed out for France, GB and the US), and a class can be added
 * without touching the others. `minLinks` (Wikipedia editions) keeps the list to what a traveller
 * has heard of; the common classes (church, mountain, museum) ask for more.
 */
export interface SightClass {
  id: string;
  /** Instance-of classes; empty for the World Heritage query (`P1435 = Q9259`). */
  seeds: string[];
  minLinks: number;
}
export const SIGHT_CLASSES: SightClass[] = [
  { id: 'heritage', seeds: [], minLinks: 5 },
  { id: 'temple', seeds: ['Q44539', 'Q5393308', 'Q842402'], minLinks: 8 },
  { id: 'palace', seeds: ['Q16560'], minLinks: 8 },
  { id: 'castle', seeds: ['Q23413'], minLinks: 15 },
  { id: 'church', seeds: ['Q16970', 'Q2977', 'Q120560', 'Q160742'], minLinks: 25 },
  { id: 'island', seeds: ['Q23442'], minLinks: 15 },
  { id: 'mountain', seeds: ['Q8502', 'Q8072', 'Q207326'], minLinks: 25 },
  { id: 'lake', seeds: ['Q23397'], minLinks: 20 },
  { id: 'natural', seeds: ['Q34038', 'Q150784', 'Q35509'], minLinks: 15 },
  { id: 'beach', seeds: ['Q40080'], minLinks: 10 },
  { id: 'park', seeds: ['Q46169', 'Q179049'], minLinks: 10 },
  { id: 'archaeological', seeds: ['Q839954'], minLinks: 15 },
  { id: 'museum', seeds: ['Q33506'], minLinks: 40 },
  { id: 'attraction', seeds: ['Q570116'], minLinks: 8 },
];

/**
 * The SPARQL text for one class in one country (`P297` is the ISO 3166-1 alpha-2 code). A class
 * with several instance-of seeds is asked one seed at a time: a `VALUES` over three temple
 * classes timed out for Thailand (65 s) where each seed alone takes 1-5 s.
 */
export function sightsQuery(iso: string, cls: SightClass, seed?: string): string {
  if (!/^[A-Z]{2}$/.test(iso)) throw new Error(`bad country code ${iso}`);
  if (seed !== undefined && !cls.seeds.includes(seed))
    throw new Error(`${seed} is not in ${cls.id}`);
  const match =
    cls.seeds.length === 0
      ? `?item wdt:P1435 wd:${WORLD_HERITAGE} .`
      : `?item wdt:P31 wd:${seed ?? cls.seeds[0]} .`;
  return `SELECT ?item ?itemLabel ?coord ?links ?wh ?parent (GROUP_CONCAT(DISTINCT ?t; separator=",") AS ?types) WHERE {
  {
    SELECT DISTINCT ?item ?coord ?links ?wh WHERE {
      # A subquery binds the country first: as a plain triple pattern it makes FR time out (60 s).
      { SELECT ?country WHERE { ?country wdt:P297 "${iso}" } LIMIT 1 }
      ${match}
      ?item wdt:P17 ?country ; wdt:P625 ?coord ; wikibase:sitelinks ?links .
      ${cls.seeds.length === 0 ? 'BIND(true AS ?wh)' : ''}
      FILTER(?links >= ${cls.minLinks})
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
/** Attempts at a query on HTTP 429, 502, 503 or a network error. */
const MAX_ATTEMPTS = 5;
/**
 * Attempts at a query that timed out (HTTP 500 or 504 after Wikidata's 60 s limit). Each attempt
 * can take that long, and a query that timed out twice rarely succeeds a third time: three is a
 * bounded try, not a hope.
 */
export const TIMEOUT_ATTEMPTS = 3;
/** Wait before the second attempt at a timed-out query (20 s), doubled each time. */
const TIMEOUT_BACKOFF_MS = 20_000;
const isTimeout = (status: number): boolean => status === 500 || status === 504;

export class SparqlError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`wikidata: HTTP ${status}`);
    this.status = status;
  }
}

/** HTTP 200 whose body is not a SPARQL result: WDQS appends a Java trace to a timed-out answer. */
export class BrokenAnswerError extends SparqlError {
  constructor() {
    super(200);
    this.message = 'wikidata: HTTP 200 with a body that is not a SPARQL result';
  }
}

/** True when the text is one whole JSON document with `results.bindings` an array. */
export function isSparqlResult(text: string): boolean {
  try {
    const doc = JSON.parse(text) as { results?: { bindings?: unknown } } | null;
    return Array.isArray(doc?.results?.bindings);
  } catch {
    return false;
  }
}

/** The classes of a country that Wikidata could not answer: its places file would be incomplete. */
export class IncompleteSightsError extends Error {
  readonly iso: string;
  readonly classes: string[];
  constructor(iso: string, classes: string[]) {
    super(`${iso}: Wikidata gave no answer for ${classes.join(', ')}`);
    this.iso = iso;
    this.classes = classes;
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
 * (502, 503) or a dropped connection with a growing wait, and asks a query that timed out (500,
 * 504) again `TIMEOUT_ATTEMPTS` times in all. Past those attempts, and for any other failure, it
 * throws: a `SparqlError`, or the network error.
 */
export async function runSparql(
  query: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = realSleep,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(`${SPARQL_ENDPOINT}?${new URLSearchParams({ query })}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      await sleep(5_000 * 2 ** (attempt - 1));
      continue;
    }
    if (response.ok) {
      const body = await response.text();
      if (isSparqlResult(body)) return body;
      // Its JSON part is unreliable (empty, truncated): ask again, like after a timeout.
      if (attempt >= TIMEOUT_ATTEMPTS) throw new BrokenAnswerError();
      await sleep(TIMEOUT_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }
    if (isTimeout(response.status)) {
      if (attempt >= TIMEOUT_ATTEMPTS) throw new SparqlError(response.status);
      await sleep(TIMEOUT_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }
    const retryable = [429, 502, 503].includes(response.status);
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new SparqlError(response.status);
    await sleep(
      response.status === 429
        ? retryAfterMs(response.headers.get('Retry-After'))
        : 5_000 * 2 ** (attempt - 1),
    );
  }
}

/**
 * Raw SPARQL JSON of every class for one country. Each query (class, seed) has its own cache file
 * (`<iso>-<class>[-<seed>].json`), so a result is only ever reused for the query that produced it.
 * A query that still times out after its retries is not cached; the others go on (and stay
 * cached, so the next run asks only for the missing ones), then an `IncompleteSightsError` names
 * the classes that failed: the caller must not write a places file from the rest. Any other
 * failure (rate limit, ban, outage) throws at once.
 */
export async function fetchSights(
  iso: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = realSleep,
  cacheDir: string = join(CACHE_DIR, 'wikidata'),
): Promise<string[]> {
  const raws: string[] = [];
  const failed: string[] = [];
  const queries = SIGHT_CLASSES.flatMap((cls): { cls: SightClass; seed?: string; key: string }[] =>
    cls.seeds.length === 0
      ? [{ cls, key: cls.id }]
      : cls.seeds.map((seed) => ({ cls, seed, key: `${cls.id}-${seed}` })),
  );
  for (const { cls, seed, key } of queries) {
    const path = join(cacheDir, `${iso}-${key}.json`);
    let cached: string | undefined;
    try {
      cached = await readFile(path, 'utf8');
    } catch {
      // not cached yet
    }
    if (cached !== undefined) {
      if (isSparqlResult(cached)) {
        raws.push(cached);
        continue;
      }
      console.warn(`${iso}: corrupt cache file ${path}, deleted; fetching "${key}" again`);
      await rm(path, { force: true });
    }
    try {
      const raw = await runSparql(sightsQuery(iso, cls, seed), fetchImpl, sleep);
      await mkdir(cacheDir, { recursive: true });
      await writeFile(path, raw);
      raws.push(raw);
    } catch (error) {
      const broken = error instanceof BrokenAnswerError;
      if (!(error instanceof SparqlError) || !(broken || isTimeout(error.status))) throw error;
      console.warn(
        `${iso}: Wikidata ${broken ? 'gave a broken answer' : 'timed out'} on "${key}" ${TIMEOUT_ATTEMPTS} times`,
      );
      failed.push(key);
    }
  }
  if (failed.length > 0) throw new IncompleteSightsError(iso, failed);
  return raws;
}

interface Binding {
  [name: string]: { value: string; 'xml:lang'?: string } | undefined;
}

/** Rows of the query merged by item: a row per parent becomes one sight with its parents. */
export function parseSights(raw: string | string[]): RawSight[] {
  const bindings = (Array.isArray(raw) ? raw : [raw]).flatMap(
    (text) => (JSON.parse(text) as { results: { bindings: Binding[] } }).results.bindings,
  );
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
        french: row.itemLabel?.['xml:lang'] === 'fr',
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
