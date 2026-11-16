/**
 * Build the map geodata that the app bundles, from Overture Maps divisions:
 *
 *   npm run maps -w @travelbook/desktop -- all [--only=TH,PE] [--mode=finest|per-region]
 *
 * `all` runs `boundaries`, then `places`, then `packs` (in that order: `boundaries` deletes the
 * packs of the subjects it rebuilds), prints a progress line per subject (`[hh:mm:ss] step i/n`),
 * a size report at the end (a warning if a size passes the 25 MB budget, which the owner lifted:
 * it does not fail the run), and exits non-zero if a step failed. Run it with
 * `nohup ... > run.log 2>&1 &` and watch the log.
 *
 *   npm run maps -w @travelbook/desktop -- boundaries [--only=TH,PE]
 *
 * `boundaries` writes `resources/maps/subjects/<id>.topo.json` for every subject and merges it into
 * `resources/maps/index.json`. Without `--only` it rebuilds every subject and the index from
 * scratch. It builds everything into `scripts/maps/out/staging/` first and swaps the files in when
 * all subjects are built, so a crash or a failing subject leaves the previous outputs untouched;
 * the subject and pack files that the new index does not list are removed afterwards. A subject
 * draws the divisions of its own country's point of view only: one that only another country's
 * perspective accepts (Chinese "South Tibet" among the regions of India) is left out, see
 * `perspectives.ts`.
 *
 *   npm run maps -w @travelbook/desktop -- places [--only=TH,PE]
 *
 * `places` writes `resources/maps/places/<iso>.json` (cities from Natural Earth, sights from
 * Wikidata) for every ISO of `index.json`, so run `boundaries` first. A country for which a
 * Wikidata query keeps timing out gets no file (an old one stays), is listed at the end, and the
 * command exits non-zero: run it again, the answered queries are cached.
 *
 *   npm run maps -w @travelbook/desktop -- packs [--only=TH,PE] [--mode=finest|per-region]
 *
 * `packs` writes the fine region pack of every subject that has regions, named after the subject
 * (`<id>.topo.json`): into `resources/maps/packs/` for the bundled ones (`BUNDLED_PACKS`), else
 * into `scripts/maps/out/packs/` (git-ignored, uploaded to the release by hand), and records it in
 * `index.json` with its mode. Both modes are built and `finest` is kept unless it is more than 3 x
 * the size of `per-region`; `--mode=` forces one. Run `boundaries` first, and `packs` again after
 * a subject is rebuilt. Nothing is wiped upfront: the index is rewritten after each pack, and the
 * pack files it does not list are removed at the end.
 *
 * Raw downloads are cached in `scripts/maps/.cache/` (git-ignored); nothing raw is committed. Needs
 * network access to Overture's public S3 bucket, GitHub (Natural Earth) and Wikidata.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OVERTURE_RELEASE,
  catalog,
  fetchDivisions,
  fetchLakes,
  fetchLand,
  fetchPerspectives,
  fetchWorldLand,
  type DivisionLevel,
  type CatalogEntry,
} from './overture.ts';
import { clock, progressLine } from './log.ts';
import {
  budgetWarnings,
  mapDirs,
  measureSizes,
  pruneUnlisted,
  readIndexFile,
  rebuildPacks,
  rebuildSubjects,
  sizeReport,
  subjectsToKeep,
  writeFileAtomic,
  type MapDirs,
} from './outputs.ts';
import { appFileUrl } from './paths.ts';
import { buildPlaces, skippedLines, type SkippedPlaces } from './places.ts';
import {
  PERSPECTIVE_OVERRIDES,
  filterWarning,
  keepOwnPerspective,
  unmatchedOverrides,
  type PerspectiveFilter,
} from './perspectives.ts';
import {
  OVERLAP_TOLERANCE,
  buildWorld,
  bboxOf,
  bboxesOverlap,
  buildBestPack,
  buildTopology,
  cutOverlappingRegions,
  extentKm,
  mainBbox,
  mergeGeometry,
  pickLandLevel,
  scaleBbox,
  type Bbox,
  type Feature,
  type PackMode,
} from './simplify.ts';
import {
  isosOf,
  selectSubjects,
  subjectDefs,
  viewersOf,
  type SubjectDef,
  type SubjectKind,
} from './subjects.ts';

export const MAPS_DIR = appFileUrl('resources/maps');
/** Where the build writes: `resources/maps/` and, git-ignored, `scripts/maps/out/`. */
const DIRS = mapDirs(MAPS_DIR, appFileUrl('scripts/maps/out'));
/**
 * The subjects whose fine pack ships in the installer: the countries of the Affiches' region
 * destinations (California, Scotland, Sicily, Crete). Every other pack is downloaded on demand.
 */
const BUNDLED_PACKS = ['GB', 'GR', 'IT', 'US'];
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
  pack: { file: string; sha256: string; bytes: number; bundled: boolean; mode: PackMode } | null;
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

/**
 * The divisions of one level, as the subject's own country sees them: a division that only
 * another country's perspective accepts (see `perspectives.ts`) is left out. `left` lists them.
 * Warns when the filter removes every division of the level or more than 20 % of them (a wrong
 * perspective list, not a claim), and when a hand-written override matches none of them.
 */
async function loadLevelWithLeft(
  def: SubjectDef,
  level: DivisionLevel,
): Promise<{ features: Feature[]; left: PerspectiveFilter['left'] }> {
  const rows = await fetchDivisions(def.country, level, def.part?.region);
  const known = [...(await fetchPerspectives()), ...PERSPECTIVE_OVERRIDES];
  const { kept, left } = keepOwnPerspective(rows, def.country, known, viewersOf(def));
  const suspicious = filterWarning(rows.length, left.length);
  if (suspicious) {
    console.warn(
      `  ${def.id}: WARNING the perspective filter left out ${left.length} of ${rows.length} ${level} division(s): ${suspicious}`,
    );
  }
  // a part of a country (US-AK) holds only some of its divisions: no override can be checked there
  if (!def.part) {
    for (const stale of unmatchedOverrides(rows, def.country, level, PERSPECTIVE_OVERRIDES)) {
      console.warn(
        `  ${def.id}: WARNING the perspective override for ${stale.id} matches no ${level} of ` +
          `${def.country}: was the area given a new id? Update PERSPECTIVE_OVERRIDES.`,
      );
    }
  }
  return { features: kept, left };
}

const loadLevel = async (def: SubjectDef, level: DivisionLevel): Promise<Feature[]> =>
  (await loadLevelWithLeft(def, level)).features;

/**
 * The regions of a subject: `all` as Overture lists them, and `kept`, where a region that lies
 * inside another is cut out of it (see `cutOverlappingRegions`). The base file and the pack both
 * draw `kept`, so their region ids stay the same; the land is still the union of `all`.
 */
async function loadRegions(def: SubjectDef): Promise<{ all: Feature[]; kept: Feature[] }> {
  const { features: all, left } = await loadLevelWithLeft(def, regionsLevel(def));
  for (const { feature, perspectives } of left) {
    console.log(
      `  ${def.id}: ${String(feature.properties.name)} (${String(feature.properties.id)}) left out: ` +
        `${perspectives.mode} ${perspectives.countries.join(',')}, not ${viewersOf(def).join('/')}`,
    );
  }
  const ids = new Set<string>();
  for (const row of all) {
    const id = String(row.properties.id);
    if (ids.has(id)) throw new Error(`${def.id}: duplicate region id ${id}`);
    ids.add(id);
  }
  const { regions, cuts, dropped, ratio, ratioAfter } = await cutOverlappingRegions(all);
  if (cuts.length > 0 || dropped.length > 0) {
    console.log(
      `  ${def.id}: overlapping regions, summed area ${ratio.toFixed(4)} x their union, now ${ratioAfter.toFixed(4)}`,
    );
    for (const cut of cuts) {
      console.log(
        `    ${cut.name} (${cut.id}) cut by ${cut.by.map((b) => `${b.name} (${b.id})`).join(', ')}, ` +
          `${(cut.left * 100).toFixed(1)} % of it left`,
      );
    }
    for (const gone of dropped) {
      console.log(
        `    ${gone.name} (${gone.id}) dropped: ${(gone.left * 100).toFixed(2)} % of it left after the cuts`,
      );
    }
  }
  if (ratioAfter > 1 + OVERLAP_TOLERANCE) {
    console.warn(
      `  ${def.id}: WARNING the regions still overlap (summed area ${ratioAfter.toFixed(4)} x their union), ` +
        'and none lies inside another',
    );
  }
  return { all, kept: regions };
}

export async function buildSubject(
  def: SubjectDef,
  all: CatalogEntry[],
  lakes: Feature[],
): Promise<{ entry: MapSubjectEntry; json: string; extent: number }> {
  const catalogEntry = all.find((e) => e.country === def.country);
  const country = await loadLand(def);
  const name = def.nameFr ?? String(country.properties.name);
  const { all: everyRegion, kept: regions } = await loadRegions(def);
  // Overture's country polygon can be far coarser than its divisions: the land is the union of the
  // finest level that covers the country (>= 98 %), else the country polygon itself.
  const levels: DivisionLevel[] = def.part
    ? ['county', 'locality']
    : ['region', 'county', 'locality'];
  const level = await pickLandLevel(
    country,
    levels.map((name) => ({
      name,
      load: () =>
        name === regionsLevel(def) ? Promise.resolve(everyRegion) : loadLevel(def, name),
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
    // the land is the regions layer itself, unless a region was dropped: its area stays in the land
    landIsRegions: level?.name === regionsLevel(def) && regions.length === everyRegion.length,
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

const readIndex = (): Promise<MapIndex | undefined> => readIndexFile(DIRS);

/** The file names of the removed files, as a log line (the first few). */
const removedLine = (removed: string[]): string =>
  removed.length === 0
    ? ''
    : `removed ${removed.length} file(s) the index does not list: ${removed.slice(0, 6).join(', ')}${removed.length > 6 ? ', ...' : ''}`;

export async function boundaries(only: string[] | undefined): Promise<void> {
  const all = await catalog();
  const defs = selectSubjects(subjectDefs(all), only);
  const lakes = await fetchLakes();
  const kept = await subjectsToKeep(only, OVERTURE_RELEASE, readIndex);
  console.log(progressLine('boundaries', 0, defs.length, `${defs.length} subject(s) to build`));
  const { index, removed } = await rebuildSubjects({
    defs,
    build: async (def) => {
      const { entry, json } = await buildSubject(def, all, lakes);
      return { entry, json };
    },
    kept,
    dirs: DIRS,
    release: OVERTURE_RELEASE,
    date: new Date().toISOString().slice(0, 10),
    log: ({ done, total, subject, seconds }) => {
      const { entry, json } = subject;
      console.log(
        progressLine(
          'boundaries',
          done,
          total,
          `${entry.id.padEnd(8)} ${entry.landSource.padEnd(8)} ${String(Math.round(json.length / 1024)).padStart(6)} KB  ` +
            `${entry.regions.length} regions  ${seconds.toFixed(1)} s`,
        ),
      );
    },
  });
  await writeLicences(index);
  if (removed.length > 0) console.log(removedLine(removed));
  console.log(
    progressLine(
      'boundaries',
      defs.length,
      defs.length,
      `index.json: ${index.subjects.length} subjects, Overture ${OVERTURE_RELEASE}`,
    ),
  );
}

/** The shared far-context land: `resources/maps/world.topo.json`, from Natural Earth 10m land. */
export async function world(): Promise<void> {
  console.log(`[${clock()}] world: Natural Earth 10m land`);
  const topology = await buildWorld(await fetchWorldLand());
  const json = JSON.stringify(topology);
  await writeFileAtomic(join(MAPS_DIR, 'world.topo.json'), json);
  const index = await readIndex();
  if (index) await writeLicences(index);
  console.log(`[${clock()}] world: world.topo.json ${Math.round(json.length / 1024)} KB`);
}

/** Keep the `maps/` entry of `resources/LICENCES.json` in step with the files the index lists. */
export async function writeLicences(index: MapIndex): Promise<void> {
  const places = await readdir(join(MAPS_DIR, 'places')).catch(() => [] as string[]);
  const file = join(MAPS_DIR, '../LICENCES.json');
  const licences = JSON.parse(await readFile(file, 'utf8')) as {
    entries: { files: string[] }[];
  };
  // The presets (`maps/presets/`) are our own work, with an entry of their own that stays.
  const isGeodata = (f: string): boolean => f.startsWith('maps/') && !f.startsWith('maps/presets/');
  licences.entries = licences.entries.filter((e) => !e.files.every(isGeodata));
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
  // The world land is Natural Earth, public domain: an entry of its own, whenever the file exists.
  if (existsSync(join(MAPS_DIR, 'world.topo.json'))) {
    licences.entries.push({
      files: ['maps/world.topo.json'],
      source: 'Natural Earth, 10m physical vectors, land',
      author: 'Natural Earth contributors',
      licence: 'Public domain',
      url: 'https://www.naturalearthdata.com/about/terms-of-use/',
      requiresAttribution: false,
      note: 'The coarse world land that fills the far context of a map, beyond the neighbours of each subject (https://github.com/nvkelso/natural-earth-vector).',
    } as (typeof licences.entries)[number]);
  }
  await writeFileAtomic(file, `${JSON.stringify(licences, null, 2)}\n`);
}

function parseOnly(args: string[]): string[] | undefined {
  const flag = args.find((a) => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).split(',') : undefined;
}

function parseMode(args: string[]): PackMode | undefined {
  const flag = args.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
  if (flag === undefined) return undefined;
  if (flag !== 'finest' && flag !== 'per-region') throw new Error(`unknown --mode=${flag}`);
  return flag;
}

/**
 * Cities and sights of every ISO of the index (or of the subjects `only` selects). Returns the
 * countries that were skipped because Wikidata timed out, and then exits non-zero: an incomplete
 * places file is never written.
 */
export async function places(only: string[] | undefined): Promise<SkippedPlaces[]> {
  const index = await readIndex();
  if (!index) throw new Error('no resources/maps/index.json: run `boundaries` first');
  const isos =
    only === undefined ? undefined : isosOf(selectSubjects(subjectDefs(await catalog()), only));
  const { skipped } = await buildPlaces(index.subjects, isos);
  // a places file for an ISO that the index does not hold any more is a leftover
  const known = new Set(isosOf(index.subjects).map((iso) => `${iso}.json`));
  const removed = await pruneUnlisted(join(MAPS_DIR, 'places'), known);
  if (removed.length > 0) console.log(removedLine(removed.map((f) => `places/${f}`)));
  await writeLicences(index);
  if (skipped.length > 0) {
    console.error(`places: ${skipped.length} country(ies) incomplete, run \`places\` again:`);
    for (const line of skippedLines(skipped)) console.error(line);
    process.exitCode = 1;
  }
  return skipped;
}

/** Print the sizes, and warn when the base or the bundled packs pass the budget (never fails). */
export async function reportSizes(dirs: MapDirs = DIRS): Promise<void> {
  const sizes = await measureSizes(dirs);
  for (const line of sizeReport(sizes)) console.log(line);
  for (const warning of budgetWarnings(sizes)) console.warn(`WARNING: ${warning}`);
}

/**
 * The fine pack of every subject with regions (or of `only`). Entries and files of the other
 * subjects are left as they are, so a partial run can be repeated and completed. `mode` forces
 * one pack mode; without it both are built and `pickPackMode` chooses.
 */
export async function packs(only: string[] | undefined, mode?: PackMode): Promise<void> {
  const index = await readIndex();
  if (!index) throw new Error('no resources/maps/index.json: run `boundaries` first');
  if (index.overture !== OVERTURE_RELEASE) {
    throw new Error(`index.json is from Overture ${index.overture}: run \`boundaries\` first`);
  }
  const defs = selectSubjects(subjectDefs(await catalog()), only);
  const { failures, removed } = await rebuildPacks({
    index,
    defs,
    bundled: BUNDLED_PACKS,
    dirs: DIRS,
    make: async (def, entry) => {
      const { kept } = await loadRegions(def);
      const ids = kept.map((r) => String(r.properties.id)).sort((a, b) => a.localeCompare(b));
      if (ids.join() !== entry.regions.map((r) => r.id).join()) {
        throw new Error('the regions differ from index.json: run `boundaries` again');
      }
      const best = await buildBestPack(
        kept.map((r) => ({ ...r, properties: { id: r.properties.id, name: r.properties.name } })),
        mode,
      );
      const note =
        best.ratio === null
          ? `${best.mode} (forced)`
          : `${best.mode} (finest is ${best.ratio.toFixed(2)} x per-region)`;
      return { json: best.json, mode: best.mode, note };
    },
    log: ({ done, total, def, build, entry, seconds }) => {
      console.log(
        progressLine(
          'packs',
          done,
          total,
          `${def.id.padEnd(8)} ${entry.pack?.bundled ? 'bundled' : 'release'}  ` +
            `${String(Math.round((entry.pack?.bytes ?? 0) / 1024)).padStart(6)} KB  ${entry.regions.length} regions  ` +
            `${build.note}  ${seconds.toFixed(1)} s`,
        ),
      );
    },
  });
  await writeLicences(index);
  if (removed.length > 0) console.log(removedLine(removed));
  await reportSizes();
  if (failures.length > 0) {
    console.error(`packs: ${failures.length} subject(s) failed, run \`packs\` again for them:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

/** An error as the log shows it: the stack when there is one. */
const describeError = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** The three steps of `all`, so that their order and failure handling can be tested. */
export interface AllSteps {
  /** The shared far-context land; optional, and run first when there is one. */
  world?: () => Promise<void>;
  boundaries: () => Promise<void>;
  places: () => Promise<SkippedPlaces[]>;
  packs: () => Promise<void>;
}

/**
 * `boundaries`, then `places`, then `packs`. A failing `boundaries` stops here (it throws, and the
 * previous outputs are as they were). A `places` that throws or reports incomplete countries does
 * not stop `packs`, which does not depend on it: the error is logged, `packs` runs (and writes the
 * licences), and the exit code is 1 at the end. Returns the countries Wikidata did not answer.
 */
export async function runSteps(steps: AllSteps): Promise<SkippedPlaces[]> {
  // the world step, when there is one, comes first and shifts the numbering
  const n = steps.world ? 1 : 0;
  const total = 3 + n;
  if (steps.world) {
    console.log(`[${clock()}] step 1/${total}: world`);
    await steps.world();
  }
  console.log(`[${clock()}] step ${n + 1}/${total}: boundaries`);
  await steps.boundaries();
  console.log(`[${clock()}] step ${n + 2}/${total}: places`);
  let skipped: SkippedPlaces[] = [];
  try {
    skipped = await steps.places();
  } catch (error) {
    console.error(`[${clock()}] places FAILED: ${describeError(error)}`);
    console.error('packs still runs; run `places` again afterwards');
    process.exitCode = 1;
  }
  console.log(`[${clock()}] step ${n + 3}/${total}: packs`);
  await steps.packs();
  console.log(`[${clock()}] all: done${process.exitCode ? ' WITH ERRORS (exit code 1)' : ''}`);
  if (skipped.length > 0) {
    console.error('places not written (Wikidata timed out):');
    for (const line of skippedLines(skipped)) console.error(line);
  }
  return skipped;
}

/** The whole build: `boundaries`, `places`, `packs`, in that order (see `runSteps`). */
export async function all(only: string[] | undefined, mode?: PackMode): Promise<void> {
  const defs = selectSubjects(subjectDefs(await catalog()), only);
  console.log(
    `[${clock()}] all: ${defs.length} subject(s), ${isosOf(defs).length} ISO code(s), ` +
      `Overture ${OVERTURE_RELEASE}${only ? `, only ${only.join(',')}` : ''}`,
  );
  await runSteps({
    world,
    boundaries: () => boundaries(only),
    places: () => places(only),
    packs: () => packs(only, mode),
  });
}

const [command, ...args] = process.argv.slice(2);
if (process.argv[1]?.endsWith('build-geodata.ts')) {
  try {
    if (command === 'all') {
      await all(parseOnly(args), parseMode(args));
    } else if (command === 'world') {
      await world();
    } else if (command === 'boundaries') {
      await boundaries(parseOnly(args));
    } else if (command === 'places') {
      await places(parseOnly(args));
    } else if (command === 'packs') {
      await packs(parseOnly(args), parseMode(args));
    } else {
      console.error(
        'usage: npm run maps -- all|world|boundaries|places|packs [--only=TH,PE] [--mode=finest|per-region]',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[${clock()}] FAILED: ${describeError(error)}`);
    process.exitCode = 1;
  }
}
