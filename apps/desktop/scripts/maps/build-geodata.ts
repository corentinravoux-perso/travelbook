/**
 * Build the map geodata that the app bundles, from Overture Maps divisions:
 *
 *   npm run maps -w @travelbook/desktop -- boundaries [--only=TH,PE]
 *
 * `boundaries` writes `resources/maps/subjects/<id>.topo.json` for every subject and merges it into
 * `resources/maps/index.json`. Without `--only` it rebuilds every subject and the index from
 * scratch.
 *
 *   npm run maps -w @travelbook/desktop -- places [--only=TH,PE]
 *
 * `places` writes `resources/maps/places/<iso>.json` (cities from Natural Earth, sights from
 * Wikidata) for every ISO of `index.json`, so run `boundaries` first.
 *
 *   npm run maps -w @travelbook/desktop -- packs [--only=TH,PE] [--mode=finest|per-region]
 *
 * `packs` writes the fine region pack of every subject that has regions, named after the subject
 * (`<id>.topo.json`): into `resources/maps/packs/` for the bundled ones (`BUNDLED_PACKS`), else
 * into `scripts/maps/out/packs/` (git-ignored, uploaded to the release by hand), and records it in
 * `index.json`. Run `boundaries` first, and `packs` again after a subject is rebuilt.
 *
 * Raw downloads are cached in `scripts/maps/.cache/` (git-ignored); nothing raw is committed. Needs
 * network access to Overture's public S3 bucket, GitHub (Natural Earth) and Wikidata.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OVERTURE_RELEASE,
  catalog,
  fetchDivisions,
  fetchLakes,
  fetchLand,
  type DivisionLevel,
  type CatalogEntry,
} from './overture.ts';
import { appFileUrl } from './paths.ts';
import { buildPlaces } from './places.ts';
import {
  bboxOf,
  bboxesOverlap,
  buildPack,
  buildTopology,
  extentKm,
  mainBbox,
  mergeGeometry,
  pickLandLevel,
  scaleBbox,
  toleranceMetres,
  type Bbox,
  type Feature,
  type PackMode,
} from './simplify.ts';
import { selectSubjects, subjectDefs, type SubjectDef, type SubjectKind } from './subjects.ts';

export const MAPS_DIR = appFileUrl('resources/maps');
const SUBJECTS_DIR = join(MAPS_DIR, 'subjects');
const INDEX_FILE = join(MAPS_DIR, 'index.json');
const PACKS_DIR = join(MAPS_DIR, 'packs');
/** Packs that are not bundled: built here, then uploaded to the GitHub release (git-ignored). */
const OUT_PACKS_DIR = appFileUrl('scripts/maps/out/packs');
/**
 * The subjects whose fine pack ships in the installer: the countries of the Affiches' region
 * destinations (California, Scotland, Sicily, Crete). Every other pack is downloaded on demand.
 */
const BUNDLED_PACKS = ['GB', 'GR', 'IT', 'US'];
/** Together the bundled packs stay under this (design section 7.4); above it, ship fewer regions. */
const BUNDLED_PACKS_MAX_BYTES = 25_000_000;
/** The neighbours are drawn inside a frame 1.3 x the subject's bbox. */
const FRAME_FACTOR = 1.3;

export interface MapSubjectEntry {
  id: string;
  iso: string;
  name: string;
  kind: SubjectKind;
  bbox: Bbox;
  keywords: string[];
  file: string;
  sha256: string;
  regions: { id: string; name: string; bbox: Bbox }[];
  /** Where the land outline comes from: a division level (dissolved) or the country polygon. */
  landSource: DivisionLevel | 'country';
  /**
   * The fine region pack, `null` until `packs` has run. `file` is `packs/<id>.topo.json`: under
   * `resources/maps/` when `bundled`, else the name of the release asset (and of the cached copy).
   */
  pack: { file: string; sha256: string; bytes: number; bundled: boolean } | null;
}
export interface MapIndex {
  overture: string;
  built: string;
  subjects: MapSubjectEntry[];
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4;
const roundBox = (box: Bbox): Bbox => box.map(round) as Bbox;

function keywordsOf(def: SubjectDef, name: string, entry: CatalogEntry | undefined): string[] {
  const words = [name, entry?.namePrimary, entry?.nameEn, def.id, def.iso];
  const seen = new Set<string>();
  return words.flatMap((word) => {
    if (!word || seen.has(word.toLowerCase())) return [];
    seen.add(word.toLowerCase());
    return [word];
  });
}

async function loadLand(def: SubjectDef): Promise<Feature> {
  if (!def.part) return fetchLand(def.country);
  const rows = await fetchDivisions(def.country, 'region', def.part.region);
  if (rows.length !== 1) throw new Error(`${def.id}: ${rows.length} rows for ${def.part.region}`);
  const [part] = rows;
  if (!part) throw new Error(`${def.id}: no ${def.part.region}`);
  return part;
}

/** The level whose divisions are the subject's regions. */
const regionsLevel = (def: SubjectDef): DivisionLevel => (def.part ? 'county' : 'region');

const loadLevel = (def: SubjectDef, level: DivisionLevel): Promise<Feature[]> =>
  fetchDivisions(def.country, level, def.part?.region);

async function loadRegions(def: SubjectDef): Promise<Feature[]> {
  const rows = await loadLevel(def, regionsLevel(def));
  const ids = new Set<string>();
  for (const row of rows) {
    const id = String(row.properties.id);
    if (ids.has(id)) throw new Error(`${def.id}: duplicate region id ${id}`);
    ids.add(id);
  }
  return rows;
}

export async function buildSubject(
  def: SubjectDef,
  all: CatalogEntry[],
  lakes: Feature[],
): Promise<{ entry: MapSubjectEntry; json: string; extent: number }> {
  const catalogEntry = all.find((e) => e.country === def.country);
  const country = await loadLand(def);
  const name = def.nameFr ?? String(country.properties.name);
  const regions = await loadRegions(def);
  // Overture's country polygon can be far coarser than its divisions: the land is the union of the
  // finest level that covers the country (>= 98 %), else the country polygon itself.
  const levels: DivisionLevel[] = def.part
    ? ['county', 'locality']
    : ['region', 'county', 'locality'];
  const level = await pickLandLevel(
    country,
    levels.map((name) => ({
      name,
      load: () => (name === regionsLevel(def) ? Promise.resolve(regions) : loadLevel(def, name)),
    })),
  );
  const shape = level ? mergeGeometry(level.features) : country;
  const main = mainBbox(shape);
  const frame = scaleBbox(main, FRAME_FACTOR);
  const extent = extentKm(main);
  const full = bboxOf(shape);

  const neighbours: Feature[] = [];
  for (const other of all) {
    if (def.skipNeighbours.includes(other.country)) continue;
    if (!bboxesOverlap(other.bbox, frame)) continue;
    const feature = await fetchLand(other.country);
    neighbours.push({
      ...feature,
      properties: { id: other.country, name: feature.properties.name },
    });
  }
  const nearLakes = lakes.filter((lake) => bboxesOverlap(bboxOf(lake), full));

  const topology = await buildTopology({
    land: level ? level.features : country,
    dissolve: level !== null,
    landIsRegions: level?.name === regionsLevel(def),
    landProperties: { id: def.id, name },
    regions: regions.map((r) => ({
      ...r,
      properties: { id: r.properties.id, name: r.properties.name },
    })),
    neighbours,
    lakes: nearLakes.map((l) => ({
      ...l,
      properties: { id: l.properties.id, name: l.properties.name },
    })),
    extent,
    frame,
  });
  const json = JSON.stringify(topology);
  const entry: MapSubjectEntry = {
    id: def.id,
    iso: def.iso,
    name,
    kind: def.kind,
    bbox: roundBox(full),
    keywords: keywordsOf(def, name, catalogEntry),
    file: `subjects/${def.id}.topo.json`,
    sha256: createHash('sha256').update(json).digest('hex'),
    regions: regions
      .map((r) => ({
        id: String(r.properties.id),
        name: String(r.properties.name),
        bbox: roundBox(bboxOf(r)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    landSource: level?.name ?? 'country',
    pack: null,
  };
  return { entry, json, extent };
}

async function readIndex(): Promise<MapIndex | undefined> {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf8')) as MapIndex;
  } catch {
    return undefined;
  }
}

async function writeIndex(index: MapIndex): Promise<void> {
  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 1)}\n`);
}

/** Delete the pack files of a subject, wherever they were written. */
async function removePacks(id: string): Promise<void> {
  const name = `${id}.topo.json`;
  await rm(join(PACKS_DIR, name), { force: true });
  await rm(join(OUT_PACKS_DIR, name), { force: true });
}

export async function boundaries(only: string[] | undefined): Promise<void> {
  const all = await catalog();
  const defs = selectSubjects(subjectDefs(all), only);
  const lakes = await fetchLakes();
  await mkdir(SUBJECTS_DIR, { recursive: true });
  const previous = await readIndex();
  const kept =
    only !== undefined && previous?.overture === OVERTURE_RELEASE ? previous.subjects : [];
  const built = new Map(kept.map((s) => [s.id, s]));
  if (only === undefined) {
    await rm(SUBJECTS_DIR, { recursive: true, force: true });
    await rm(PACKS_DIR, { recursive: true, force: true });
    await rm(OUT_PACKS_DIR, { recursive: true, force: true });
  }
  await mkdir(SUBJECTS_DIR, { recursive: true });
  for (const def of defs) {
    const started = Date.now();
    const { entry, json, extent } = await buildSubject(def, all, lakes);
    await writeFile(join(MAPS_DIR, entry.file), json);
    // the entry restarts without a pack: its old file would not match the new regions
    await removePacks(entry.id);
    built.set(entry.id, entry);
    console.log(
      `${def.id.padEnd(8)} ${entry.landSource.padEnd(8)} ${String(Math.round(json.length / 1024)).padStart(6)} KB  ` +
        `${entry.regions.length} regions  tol ${toleranceMetres(extent).toFixed(1)} m  ` +
        `${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  const index: MapIndex = {
    overture: OVERTURE_RELEASE,
    built: new Date().toISOString().slice(0, 10),
    subjects: [...built.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  await writeIndex(index);
  await writeLicences(index);
  console.log(`index.json: ${index.subjects.length} subjects, Overture ${OVERTURE_RELEASE}`);
}

/** Keep the `maps/` entry of `resources/LICENCES.json` in step with the files the index lists. */
export async function writeLicences(index: MapIndex): Promise<void> {
  const places = await readdir(join(MAPS_DIR, 'places')).catch(() => [] as string[]);
  const file = join(MAPS_DIR, '../LICENCES.json');
  const licences = JSON.parse(await readFile(file, 'utf8')) as {
    entries: { files: string[] }[];
  };
  licences.entries = licences.entries.filter((e) => !e.files.every((f) => f.startsWith('maps/')));
  licences.entries.push({
    files: [
      'maps/index.json',
      'maps/places-overrides.json',
      ...index.subjects.map((s) => `maps/${s.file}`),
      ...index.subjects.flatMap((s) => (s.pack?.bundled ? [`maps/${s.pack.file}`] : [])),
      ...places.map((f) => `maps/places/${f}`),
    ].sort(),
    source: 'Overture Maps Foundation, divisions theme',
    author: '© OpenStreetMap contributors, Overture Maps Foundation',
    licence: 'ODbL 1.0',
    url: 'https://docs.overturemaps.org/attribution/',
    requiresAttribution: true,
    note: 'Outlines derived from Overture Maps division_area (ODbL 1.0). The lakes object of each subject is Natural Earth 10m lakes, public domain (https://github.com/nvkelso/natural-earth-vector). The places files (maps/places/) combine Natural Earth populated places, public domain, with Wikidata, CC0 (sights, https://www.wikidata.org/wiki/Wikidata:Licensing), and, for countries where Natural Earth lists fewer than 8 cities, GeoNames, CC BY 4.0 (https://www.geonames.org/, attribution required). The packs (maps/packs/) are the regions of the same Overture divisions, simplified more finely.',
  } as (typeof licences.entries)[number]);
  await writeFile(file, `${JSON.stringify(licences, null, 2)}\n`);
}

function parseOnly(args: string[]): string[] | undefined {
  const flag = args.find((a) => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).split(',') : undefined;
}

export async function places(only: string[] | undefined): Promise<void> {
  const index = await readIndex();
  if (!index) throw new Error('no resources/maps/index.json: run `boundaries` first');
  await buildPlaces(index.subjects, only);
  await writeLicences(index);
}

function parseMode(args: string[]): PackMode {
  const flag = args.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
  if (flag === undefined) return 'finest';
  if (flag !== 'finest' && flag !== 'per-region') throw new Error(`unknown --mode=${flag}`);
  return flag;
}

/**
 * The fine pack of every subject with regions (or of `only`). Entries and files of the other
 * subjects are left as they are, so a partial run can be repeated and completed.
 */
export async function packs(only: string[] | undefined, mode: PackMode = 'finest'): Promise<void> {
  const index = await readIndex();
  if (!index) throw new Error('no resources/maps/index.json: run `boundaries` first');
  if (index.overture !== OVERTURE_RELEASE) {
    throw new Error(`index.json is from Overture ${index.overture}: run \`boundaries\` first`);
  }
  const defs = selectSubjects(subjectDefs(await catalog()), only);
  if (only === undefined) {
    await rm(PACKS_DIR, { recursive: true, force: true });
    await rm(OUT_PACKS_DIR, { recursive: true, force: true });
  }
  await mkdir(PACKS_DIR, { recursive: true });
  await mkdir(OUT_PACKS_DIR, { recursive: true });
  for (const def of defs) {
    const started = Date.now();
    const entry = index.subjects.find((s) => s.id === def.id);
    if (!entry) throw new Error(`${def.id} is not in index.json: run \`boundaries\` first`);
    if (entry.regions.length === 0) {
      await removePacks(def.id);
      entry.pack = null;
      continue;
    }
    const rows = await loadRegions(def);
    const ids = rows.map((r) => String(r.properties.id)).sort((a, b) => a.localeCompare(b));
    if (ids.join() !== entry.regions.map((r) => r.id).join()) {
      throw new Error(`${def.id}: the regions differ from index.json: run \`boundaries\` again`);
    }
    const topology = await buildPack(
      rows.map((r) => ({ ...r, properties: { id: r.properties.id, name: r.properties.name } })),
      mode,
    );
    const json = JSON.stringify(topology);
    const bundled = BUNDLED_PACKS.includes(def.id);
    const file = `${def.id}.topo.json`;
    await removePacks(def.id); // a pack that was bundled and no longer is, or the reverse
    await writeFile(join(bundled ? PACKS_DIR : OUT_PACKS_DIR, file), json);
    entry.pack = {
      file: `packs/${file}`,
      sha256: createHash('sha256').update(json).digest('hex'),
      bytes: Buffer.byteLength(json),
      bundled,
    };
    console.log(
      `${def.id.padEnd(8)} ${bundled ? 'bundled' : 'release'}  ` +
        `${String(Math.round(entry.pack.bytes / 1024)).padStart(6)} KB  ${entry.regions.length} regions  ` +
        `${mode}  ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
    await writeIndex(index); // a long run that stops keeps what it has built
  }
  await writeIndex(index);
  await writeLicences(index);
  const total = index.subjects.reduce((sum, s) => sum + (s.pack?.bundled ? s.pack.bytes : 0), 0);
  console.log(`bundled packs: ${(total / 1e6).toFixed(2)} MB`);
  if (total > BUNDLED_PACKS_MAX_BYTES) {
    console.error(
      `the bundled packs exceed ${BUNDLED_PACKS_MAX_BYTES / 1e6} MB (design section 7.4)`,
    );
    process.exitCode = 1;
  }
}

const [command, ...args] = process.argv.slice(2);
if (process.argv[1]?.endsWith('build-geodata.ts')) {
  if (command === 'boundaries') {
    await boundaries(parseOnly(args));
  } else if (command === 'places') {
    await places(parseOnly(args));
  } else if (command === 'packs') {
    await packs(parseOnly(args), parseMode(args));
  } else {
    console.error('usage: npm run maps -- boundaries|places|packs [--only=TH,PE]');
    process.exitCode = 1;
  }
}
