/**
 * Build the map geodata that the app bundles, from Overture Maps divisions:
 *
 *   npm run maps -w @travelbook/desktop -- boundaries [--only=TH,PE]
 *
 * `boundaries` writes `resources/maps/subjects/<id>.topo.json` for every subject and merges it into
 * `resources/maps/index.json`. Without `--only` it rebuilds every subject and the index from
 * scratch. Raw downloads are cached in `scripts/maps/.cache/` (git-ignored); nothing raw is
 * committed. Needs network access to Overture's public S3 bucket and to GitHub (Natural Earth).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OVERTURE_RELEASE,
  catalog,
  fetchDivisions,
  fetchLakes,
  fetchLand,
  type CatalogEntry,
} from './overture.ts';
import { appFileUrl } from './paths.ts';
import {
  bboxOf,
  bboxesOverlap,
  buildTopology,
  extentKm,
  mainBbox,
  scaleBbox,
  toleranceMetres,
  type Bbox,
  type Feature,
} from './simplify.ts';
import { selectSubjects, subjectDefs, type SubjectDef, type SubjectKind } from './subjects.ts';

export const MAPS_DIR = appFileUrl('resources/maps');
const SUBJECTS_DIR = join(MAPS_DIR, 'subjects');
const INDEX_FILE = join(MAPS_DIR, 'index.json');
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

async function loadRegions(def: SubjectDef): Promise<Feature[]> {
  let rows: Feature[] = [];
  if (def.part) rows = await fetchDivisions(def.country, def.part.subdivisions, def.part.region);
  else if (def.kind === 'country' || def.id === 'FR-MET') {
    rows = await fetchDivisions(def.country, 'region');
  }
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
  const land = await loadLand(def);
  const name = def.nameFr ?? String(land.properties.name);
  const regions = await loadRegions(def);
  const main = mainBbox(land);
  const frame = scaleBbox(main, FRAME_FACTOR);
  const extent = extentKm(main);
  const full = bboxOf(land);

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
    land: { ...land, properties: { id: def.id, name } },
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

export async function boundaries(only: string[] | undefined): Promise<void> {
  const all = await catalog();
  const defs = selectSubjects(subjectDefs(all), only);
  const lakes = await fetchLakes();
  await mkdir(SUBJECTS_DIR, { recursive: true });
  const previous = await readIndex();
  const kept =
    only !== undefined && previous?.overture === OVERTURE_RELEASE ? previous.subjects : [];
  const built = new Map(kept.map((s) => [s.id, s]));
  if (only === undefined) await rm(SUBJECTS_DIR, { recursive: true, force: true });
  await mkdir(SUBJECTS_DIR, { recursive: true });
  for (const def of defs) {
    const started = Date.now();
    const { entry, json, extent } = await buildSubject(def, all, lakes);
    await writeFile(join(MAPS_DIR, entry.file), json);
    built.set(entry.id, entry);
    console.log(
      `${def.id.padEnd(8)} ${String(Math.round(json.length / 1024)).padStart(6)} KB  ` +
        `${entry.regions.length} regions  tol ${toleranceMetres(extent).toFixed(1)} m  ` +
        `${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  const index: MapIndex = {
    overture: OVERTURE_RELEASE,
    built: new Date().toISOString().slice(0, 10),
    subjects: [...built.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 1)}\n`);
  await writeLicences(index);
  console.log(`index.json: ${index.subjects.length} subjects, Overture ${OVERTURE_RELEASE}`);
}

/** Keep the `maps/` entry of `resources/LICENCES.json` in step with the files the index lists. */
export async function writeLicences(index: MapIndex): Promise<void> {
  const file = join(MAPS_DIR, '../LICENCES.json');
  const licences = JSON.parse(await readFile(file, 'utf8')) as {
    entries: { files: string[] }[];
  };
  licences.entries = licences.entries.filter((e) => !e.files.every((f) => f.startsWith('maps/')));
  licences.entries.push({
    files: ['maps/index.json', ...index.subjects.map((s) => `maps/${s.file}`)].sort(),
    source: 'Overture Maps Foundation, divisions theme',
    author: '© OpenStreetMap contributors, Overture Maps Foundation',
    licence: 'ODbL 1.0',
    url: 'https://docs.overturemaps.org/attribution/',
    requiresAttribution: true,
    note: 'Outlines derived from Overture Maps division_area (ODbL 1.0). The lakes object of each subject is Natural Earth 10m lakes, public domain (https://github.com/nvkelso/natural-earth-vector).',
  } as (typeof licences.entries)[number]);
  await writeFile(file, `${JSON.stringify(licences, null, 2)}\n`);
}

function parseOnly(args: string[]): string[] | undefined {
  const flag = args.find((a) => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).split(',') : undefined;
}

const [command, ...args] = process.argv.slice(2);
if (process.argv[1]?.endsWith('build-geodata.ts')) {
  if (command === 'boundaries') {
    await boundaries(parseOnly(args));
  } else {
    console.error('usage: npm run maps -- boundaries [--only=TH,PE]');
    process.exitCode = 1;
  }
}
