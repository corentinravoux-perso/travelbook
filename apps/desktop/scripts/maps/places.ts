/**
 * The places a map can label, per country: main cities (Natural Earth populated places, public
 * domain, with GeoNames cities5000 as a fallback where Natural Earth has fewer than 8) and tourist
 * sights (Wikidata, CC0). Output: `resources/maps/places/<iso>.json`, then the hand fixes of
 * `resources/maps/places-overrides.json` applied last.
 *
 * Ranks: 0 is the most important, counted per list. The capital and the cities share one list
 * (capital 0, then Natural Earth's LABELRANK, then POP_MAX); the sights are the other (World
 * Heritage first, then Wikipedia sitelinks).
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { CACHE_DIR, NATURAL_EARTH_COMMIT, naturalEarthUrl } from './overture.ts';
import { appFileUrl } from './paths.ts';
import type { Bbox } from './simplify.ts';
import { placesIso } from './subjects.ts';
import {
  categoryOf,
  fetchSights,
  isUrban,
  parseSights,
  type RawSight,
  type SightCategory,
} from './wikidata.ts';

export interface BundledPlace {
  /** `ne:<NE_ID>`, `gn:<geonameid>` or `wd:Q…`. */
  ref: string;
  kind: 'capital' | 'city' | 'sight';
  /** Sights only. */
  category?: SightCategory;
  /** French. */
  name: string;
  lon: number;
  lat: number;
  /** 0 = most important, counted separately for the cities (capital included) and the sights. */
  rank: number;
}
export interface MapPlacesFile {
  iso: string;
  places: BundledPlace[];
}
/** Hand fixes per ISO, applied after everything else. */
export type PlacesOverrides = Record<
  string,
  { add?: BundledPlace[]; drop?: string[]; rename?: Record<string, string> }
>;

/** Per subject; a print map holds a handful, the dialog lists the rest. */
export const LIMITS = { cities: 60, sights: 40 };
/** GeoNames fills in where Natural Earth lists fewer cities than this for a country. */
export const MIN_NE_CITIES = 8;
/** Two sights this close are one place on a map (and so are serial parts of one site). */
const SIGHT_SPACING_KM = 1;
const SERIAL_PART_KM = 2;
/** A sight that is a city is dropped when a listed city lies within this distance. */
const URBAN_SIGHT_KM = 10;

const PLACES_DIR = appFileUrl('resources/maps/places');
const OVERRIDES_FILE = appFileUrl('resources/maps/places-overrides.json');

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const inside = (lon: number, lat: number, [x0, y0, x1, y1]: Bbox): boolean =>
  lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;

export interface CityCandidate {
  ref: string;
  name: string;
  lon: number;
  lat: number;
  capital: boolean;
  /** Natural Earth LABELRANK, lower is more important (GeoNames cities get 99). */
  labelRank: number;
  pop: number;
  /** Wikidata id, to keep the same place out of the sights. */
  qid?: string;
  /** GeoNames id, to keep the fallback from repeating a Natural Earth city. */
  gnid?: number;
}

const byCityImportance = (a: CityCandidate, b: CityCandidate): number =>
  Number(b.capital) - Number(a.capital) ||
  a.labelRank - b.labelRank ||
  b.pop - a.pop ||
  a.ref.localeCompare(b.ref);

/** A World Heritage site counts as this many more Wikipedia editions: a boost, not a free pass. */
export const HERITAGE_BOOST = 15;
const score = (s: RawSight): number => s.links + (s.worldHeritage ? HERITAGE_BOOST : 0);
const bySightImportance = (a: RawSight, b: RawSight): number =>
  score(b) - score(a) || a.qid.localeCompare(b.qid);

/** Words that name a kind of place, not the place: two sights sharing only these differ. */
const GENERIC_WORDS = new Set(
  (
    'parc national nationale historique historic centre ville mont monts mount saint sainte wat phra prasat ' +
    'palais palace chateau cathedrale eglise basilique temple ile iles lac plage site archeologique sanctuaire ' +
    'reserve royal royale grand grande vieille vieux town park church cathedral lake island islands beach ' +
    'castle chemin chemins complexe region zone ruines monastere pont tour jardin jardins musee museum ' +
    'place fort forteresse mosquee pagode associated associes and with'
  ).split(' '),
);

/** The distinctive words of a name: lower case, no accents, at least 4 letters, not generic. */
export function mainWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
}
/** Sights nearer than this (Machu Picchu and its sanctuary are 6.6 km apart) with a main word in common are one place under two names. */
export const SAME_NAME_KM = 10;

/** The first `limit` of `sorted` inside each box, merged (a place in two boxes counts once). */
function topPerBox<T extends { lon: number; lat: number }>(
  sorted: T[],
  boxes: Bbox[],
  limit: number,
): T[] {
  const kept = new Set<T>();
  for (const box of boxes) {
    sorted
      .filter((p) => inside(p.lon, p.lat, box))
      .slice(0, limit)
      .forEach((p) => kept.add(p));
  }
  return sorted.filter((p) => kept.has(p));
}

/**
 * Cities and sights of one ISO as a file: places outside every subject box are dropped, the
 * best `limits` per subject box kept, serial parts and near-duplicates merged, ranks assigned.
 */
export function assemble(
  iso: string,
  cityCandidates: CityCandidate[],
  sightCandidates: RawSight[],
  boxes: Bbox[],
  limits = LIMITS,
): MapPlacesFile {
  const cities = topPerBox([...cityCandidates].sort(byCityImportance), boxes, limits.cities);
  const cityPlaces: BundledPlace[] = cities.map((c, rank) => ({
    ref: c.ref,
    kind: c.capital ? 'capital' : 'city',
    name: c.name,
    lon: round5(c.lon),
    lat: round5(c.lat),
    rank,
  }));
  const cityIds = new Set(cities.flatMap((c) => (c.qid ? [c.qid] : [])));

  const kept: RawSight[] = [];
  const candidateIds = new Set(sightCandidates.map((s) => s.qid));
  for (const sight of [...sightCandidates].sort(bySightImportance)) {
    if (!boxes.some((box) => inside(sight.lon, sight.lat, box))) continue;
    // A part of another candidate (P361) is shown through that candidate.
    if (sight.parents.some((parent) => candidateIds.has(parent))) continue;
    if (cityIds.has(sight.qid)) continue;
    if (
      isUrban(sight) &&
      cities.some((c) => haversineKm(c.lon, c.lat, sight.lon, sight.lat) < URBAN_SIGHT_KM)
    ) {
      continue;
    }
    const clash = kept.some((other) => {
      const km = haversineKm(other.lon, other.lat, sight.lon, sight.lat);
      return (
        km < SIGHT_SPACING_KM ||
        (km < SAME_NAME_KM &&
          mainWords(other.name).some((word) => mainWords(sight.name).includes(word))) ||
        (km < SERIAL_PART_KM && other.parents.some((parent) => sight.parents.includes(parent)))
      );
    });
    if (!clash) kept.push(sight);
  }
  const sightPlaces: BundledPlace[] = topPerBox(kept, boxes, limits.sights).map((s, rank) => ({
    ref: `wd:${s.qid}`,
    kind: 'sight',
    category: categoryOf(s),
    name: s.name,
    lon: round5(s.lon),
    lat: round5(s.lat),
    rank,
  }));
  return { iso, places: [...cityPlaces, ...sightPlaces] };
}

/**
 * Hand fixes for one file, applied last: rename, drop, then add (an added ref replaces). Ranks are
 * renumbered from 0 in each list afterwards; an added place takes the position of its `rank`
 * (ahead of an existing place with the same rank).
 */
export function applyOverrides(file: MapPlacesFile, overrides: PlacesOverrides): MapPlacesFile {
  const fix = overrides[file.iso];
  if (!fix) return file;
  const dropped = new Set(fix.drop ?? []);
  const added = new Set((fix.add ?? []).map((p) => p.ref));
  const kept = file.places
    .filter((p) => !dropped.has(p.ref) && !added.has(p.ref))
    .map((p) => ({ ...p, name: fix.rename?.[p.ref] ?? p.name }));
  const places = [...(fix.add ?? []).map((p) => ({ ...p })), ...kept];
  const renumber = (sights: boolean): BundledPlace[] =>
    places
      .filter((p) => (p.kind === 'sight') === sights)
      .sort((a, b) => a.rank - b.rank)
      .map((p, rank) => ({ ...p, rank }));
  return { iso: file.iso, places: [...renumber(false), ...renumber(true)] };
}

// --- Natural Earth -----------------------------------------------------------------------------

async function cachedText(path: string, produce: () => Promise<string | Buffer>): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    const data = await produce();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return data.toString();
  }
}

interface NeFeature {
  properties: Record<string, unknown>;
  geometry: { coordinates: [number, number] };
}

/** Natural Earth 10m populated places at the pinned commit, as downloaded. */
async function naturalEarthPlaces(): Promise<NeFeature[]> {
  const file = 'ne_10m_populated_places.geojson';
  const text = await cachedText(
    join(CACHE_DIR, `natural-earth-${NATURAL_EARTH_COMMIT.slice(0, 8)}`, file),
    async () => {
      const response = await fetch(naturalEarthUrl(file));
      if (!response.ok) throw new Error(`populated places: HTTP ${response.status}`);
      return response.text();
    },
  );
  return (JSON.parse(text) as { features: NeFeature[] }).features;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

function neCities(features: NeFeature[], iso: string): CityCandidate[] {
  return features
    .filter((f) => placesIso(String(f.properties.ISO_A2)) === iso)
    .map((f) => {
      const p = f.properties;
      const qid = text(p.WIKIDATAID);
      return {
        ref: `ne:${String(p.NE_ID)}`,
        name: text(p.NAME_FR) ?? text(p.NAME) ?? text(p.NAMEASCII) ?? String(p.NE_ID),
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        capital: p.ADM0CAP === 1,
        labelRank: Number(p.LABELRANK ?? 99),
        pop: Number(p.POP_MAX ?? 0),
        ...(qid ? { qid } : {}),
        ...(Number(p.GEONAMESID) > 0 ? { gnid: Number(p.GEONAMESID) } : {}),
      };
    });
}

// --- GeoNames fallback (CC BY 4.0) -------------------------------------------------------------

const GEONAMES = 'https://download.geonames.org/export/dump';

async function download(url: string, path: string): Promise<void> {
  try {
    await readFile(path);
    return;
  } catch {
    // not cached yet
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

/** The lines of one member of a zip, through the `unzip` binary; a failing `unzip` throws. */
export async function* unzipLines(zip: string, member: string): AsyncGenerator<string> {
  const child = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`cannot run unzip: ${error.message}`)));
    child.once('close', resolve);
  });
  exit.catch(() => {}); // reported below; keeps an early error from being unhandled
  yield* createInterface({ input: child.stdout });
  const code = await exit;
  if (code !== 0) throw new Error(`unzip ${zip} ${member} failed (exit ${code}): ${stderr.trim()}`);
}

type Lines = AsyncIterable<string> | Iterable<string>;

/** French names (`isolanguage = fr`, not historic or colloquial) of the given GeoNames ids. */
export async function frenchNames(lines: Lines, ids: Set<number>): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const preferred = new Set<number>();
  for await (const line of lines) {
    // alternateNameId, geonameid, isolanguage, name, isPreferred, isShort, isColloquial, isHistoric
    const c = line.split('\t');
    if (c[2] !== 'fr' || c[6] === '1' || c[7] === '1') continue;
    const id = Number(c[1]);
    if (!ids.has(id) || !c[3]) continue;
    if (c[4] === '1') {
      names.set(id, c[3]);
      preferred.add(id);
    } else if (!preferred.has(id) && !names.has(id)) {
      names.set(id, c[3]);
    }
  }
  return names;
}

/** Rows of `cities5000.txt` of one ISO (its overseas codes too). */
export async function geonamesRows(lines: Lines, iso: string): Promise<string[][]> {
  const rows: string[][] = [];
  for await (const line of lines) {
    // id, name, asciiname, alternatenames, lat, lon, fclass, fcode, country, ..., population
    const c = line.split('\t');
    if (c.length > 14 && placesIso(c[8] ?? '') === iso) rows.push(c);
  }
  return rows;
}

export function geonamesCandidates(rows: string[][], french: Map<number, string>): CityCandidate[] {
  return rows.map((c) => ({
    ref: `gn:${c[0]}`,
    name: french.get(Number(c[0])) ?? c[1] ?? c[2] ?? String(c[0]),
    lon: Number(c[5]),
    lat: Number(c[4]),
    capital: c[7] === 'PPLC',
    labelRank: 99,
    pop: Number(c[14]),
    gnid: Number(c[0]),
  }));
}

/** `cities5000` of one ISO, French names from `alternateNamesV2`. */
export async function geonamesCities(iso: string): Promise<CityCandidate[]> {
  const dir = join(CACHE_DIR, 'geonames');
  await download(`${GEONAMES}/cities5000.zip`, join(dir, 'cities5000.zip'));
  const rows = await geonamesRows(unzipLines(join(dir, 'cities5000.zip'), 'cities5000.txt'), iso);
  if (rows.length === 0) return [];
  await download(`${GEONAMES}/alternateNamesV2.zip`, join(dir, 'alternateNamesV2.zip'));
  const french = await frenchNames(
    unzipLines(join(dir, 'alternateNamesV2.zip'), 'alternateNamesV2.txt'),
    new Set(rows.map((c) => Number(c[0]))),
  );
  return geonamesCandidates(rows, french);
}

/** GeoNames cities that Natural Earth does not already list. */
export function newCities(known: CityCandidate[], extra: CityCandidate[]): CityCandidate[] {
  const ids = new Set(known.flatMap((c) => (c.gnid ? [c.gnid] : [])));
  return extra.filter(
    (c) =>
      !(c.gnid && ids.has(c.gnid)) &&
      !known.some((k) => haversineKm(k.lon, k.lat, c.lon, c.lat) < 5),
  );
}

// --- Build -------------------------------------------------------------------------------------

export interface PlacesSubject {
  id: string;
  bbox: Bbox;
}

export async function buildPlaces(
  subjects: PlacesSubject[],
  only: string[] | undefined,
): Promise<MapPlacesFile[]> {
  const isos = [...new Set(subjects.map((s) => s.id.split('-')[0]!))].sort();
  const wanted = only === undefined ? isos : isos.filter((iso) => only.includes(iso));
  const unknown = (only ?? []).filter((iso) => !isos.includes(iso));
  if (unknown.length > 0) throw new Error(`no subject for ISO ${unknown.join(', ')}`);
  const features = await naturalEarthPlaces();
  const overrides = JSON.parse(await readFile(OVERRIDES_FILE, 'utf8')) as PlacesOverrides;
  await mkdir(PLACES_DIR, { recursive: true });
  const files: MapPlacesFile[] = [];
  for (const iso of wanted) {
    const boxes = subjects.filter((s) => s.id.split('-')[0] === iso).map((s) => s.bbox);
    let cities = neCities(features, iso);
    const fallback = cities.length < MIN_NE_CITIES;
    if (fallback) cities = [...cities, ...newCities(cities, await geonamesCities(iso))];
    const sights = parseSights(await fetchSights(iso));
    const file = applyOverrides(assemble(iso, cities, sights, boxes), overrides);
    await writeFile(join(PLACES_DIR, `${iso}.json`), `${JSON.stringify(file)}\n`);
    const n = (kind: string) => file.places.filter((p) => p.kind === kind).length;
    console.log(
      `${iso.padEnd(4)} ${String(n('capital') + n('city')).padStart(3)} cities, ` +
        `${String(n('sight')).padStart(3)} sights${fallback ? '  (GeoNames fallback)' : ''}`,
    );
    files.push(file);
  }
  return files;
}
