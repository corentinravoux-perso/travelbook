/**
 * Overture Maps `divisions` access through DuckDB (anonymous S3 over HTTPS, build time only), and
 * the Natural Earth 10m lakes (pinned commit). Every download lands in `scripts/maps/.cache/`, which is never
 * committed, so a second run (or another subject) does not touch the network again.
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { appFileUrl } from './paths.ts';
import {
  perspectiveEntries,
  type DivisionPerspective,
  type PerspectiveMode,
} from './perspectives.ts';
import type { Bbox, Collection, Feature } from './simplify.ts';

/** The Overture release the committed data comes from (newest listed on S3 on 2026-11-16). */
export const OVERTURE_RELEASE = '2026-10-21.0';

const DIVISION_AREA = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=divisions/type=division_area/*`;
const DIVISION = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=divisions/type=division/*`;
/**
 * Natural Earth is pinned to a commit of its vector repository (master on 2026-11-16, after
 * v5.1.2), never to a moving branch: lakes and populated places both come from it.
 */
export const NATURAL_EARTH_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
export const naturalEarthUrl = (file: string): string =>
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_COMMIT}/geojson/${file}`;
export const LAKES_URL = naturalEarthUrl('ne_10m_lakes.geojson');

export const CACHE_DIR = appFileUrl('scripts/maps/.cache');

/** A country or dependency of the catalogue (no geometry). */
export interface CatalogEntry {
  id: string;
  country: string;
  subtype: 'country' | 'dependency';
  nameFr: string | null;
  namePrimary: string;
  nameEn: string | null;
  bbox: Bbox;
}

const ISO = /^[A-Z]{2}$/;
const REGION = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

async function cached<T>(file: string, produce: () => Promise<T>): Promise<T> {
  const path = join(CACHE_DIR, `overture-${OVERTURE_RELEASE}`, file);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    const value = await produce();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
    return value;
  }
}

let connection: Promise<DuckDBConnection> | undefined;
function connect(): Promise<DuckDBConnection> {
  connection ??= (async () => {
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();
    await conn.run(
      "INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';",
    );
    return conn;
  })();
  return connection;
}

type Row = Record<string, unknown>;
async function query(sql: string): Promise<Row[]> {
  const result = await (await connect()).runAndReadAll(sql);
  return result.getRowObjectsJson() as Row[];
}

const NAMES = `names."primary" AS name_primary, names.common['fr'] AS name_fr, names.common['en'] AS name_en`;
const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** Every country and dependency that has a land polygon (a scan of the columns, no geometry). */
export function catalog(): Promise<CatalogEntry[]> {
  return cached('catalog.json', async () => {
    const rows = await query(`
      SELECT id, country, subtype, ${NAMES},
             bbox.xmin AS x0, bbox.ymin AS y0, bbox.xmax AS x1, bbox.ymax AS y1
      FROM read_parquet('${DIVISION_AREA}')
      WHERE subtype IN ('country', 'dependency') AND is_land
      ORDER BY country`);
    return rows.map((r) => ({
      id: String(r.id),
      country: String(r.country),
      subtype: r.subtype as CatalogEntry['subtype'],
      nameFr: str(r.name_fr),
      namePrimary: String(r.name_primary),
      nameEn: str(r.name_en),
      bbox: [Number(r.x0), Number(r.y0), Number(r.x1), Number(r.y1)] as Bbox,
    }));
  });
}

/** `iso`: the row's ISO 3166-2 `region` code identifies it (true for regions, not for counties). */
function toFeatures(rows: Row[], iso = false): Feature[] {
  // An ISO code shared by several rows (some dependencies) cannot identify them: use the GERS ids.
  const codes = rows.map((r) => str(r.region));
  const unique = iso && codes.every((c) => c !== null) && new Set(codes).size === codes.length;
  return rows.map((r) => ({
    type: 'Feature' as const,
    properties: {
      id: String((unique ? r.region : null) ?? r.id),
      name: str(r.name_fr) ?? str(r.name_primary) ?? String(r.id),
      nameEn: str(r.name_en),
    },
    geometry: JSON.parse(String(r.geometry)) as Feature['geometry'],
  }));
}

/** The levels below a country, from coarse to fine. */
export type DivisionLevel = 'region' | 'county' | 'locality';

/** Land polygon of a country or dependency. */
export function fetchLand(country: string): Promise<Feature> {
  if (!ISO.test(country)) throw new Error(`bad country code ${country}`);
  return cached(`land/${country}.json`, async () => {
    const rows = await query(`
      SELECT id, ${NAMES}, ST_AsGeoJSON(geometry) AS geometry
      FROM read_parquet('${DIVISION_AREA}')
      WHERE country = '${country}' AND subtype IN ('country', 'dependency') AND is_land`);
    if (rows.length !== 1) throw new Error(`${country}: ${rows.length} land rows, expected 1`);
    const [land] = toFeatures(rows);
    if (!land) throw new Error(`${country}: no land`);
    return land;
  });
}

/**
 * Land divisions of one country and subtype, one feature each. `id` is Overture's ISO 3166-2
 * `region` code when present, else the GERS id. `region` restricts to one first-level region
 * (the parts of a country, such as `US-HI`).
 */
export function fetchDivisions(
  country: string,
  subtype: DivisionLevel,
  region?: string,
): Promise<Feature[]> {
  if (!ISO.test(country)) throw new Error(`bad country code ${country}`);
  if (region !== undefined && !REGION.test(region)) throw new Error(`bad region code ${region}`);
  const key = `${country}-${subtype}${region ? `-${region}` : ''}`;
  return cached(`divisions/${key}.json`, async () => {
    const rows = await query(`
      SELECT id, region, ${NAMES}, ST_AsGeoJSON(geometry) AS geometry
      FROM read_parquet('${DIVISION_AREA}')
      WHERE country = '${country}' AND subtype = '${subtype}' AND is_land
        ${region ? `AND region = '${region}'` : ''}
      ORDER BY region, id`);
    return toFeatures(rows, subtype === 'region');
  });
}

/**
 * The version of the mapping from `division` rows to perspective entries (`perspectiveEntries`).
 * Bump it whenever that mapping changes: the cache file is named after it, so a cache written by
 * older code (`perspectives.json`, then `perspectives-v1.json`...) is never read, and the query
 * runs again.
 */
export const PERSPECTIVES_VERSION = 2;
export const perspectivesCacheFile = (version = PERSPECTIVES_VERSION): string =>
  `perspectives-v${version}.json`;

/**
 * The land areas whose division carries `perspectives` (`division_area` has no such column: it is
 * read from `division`, joined on `division_id`), as `perspectiveEntries` makes them. Empty in
 * 2026-10-21.0, where no division has any (see `perspectives.ts`).
 */
export function fetchPerspectives(): Promise<DivisionPerspective[]> {
  return cached(perspectivesCacheFile(), async () => {
    const rows = await query(`
      SELECT a.id AS id, a.region AS region, a.country AS country, a.subtype AS subtype,
             d.perspectives."mode" AS mode, d.perspectives.countries AS countries
      FROM read_parquet('${DIVISION}') d
      JOIN read_parquet('${DIVISION_AREA}') a ON a.division_id = d.id
      WHERE d.perspectives IS NOT NULL AND a.is_land`);
    return perspectiveEntries(
      rows.map((r) => ({
        id: String(r.id),
        region: str(r.region),
        country: String(r.country),
        subtype: String(r.subtype),
        mode: String(r.mode) as PerspectiveMode,
        countries: (r.countries as unknown[]).map(String),
      })),
    );
  });
}

/** Natural Earth 10m lakes (public domain), one polite download. */
export function fetchLakes(): Promise<Feature[]> {
  return cached('../natural-earth-lakes.json', async () => {
    const response = await fetch(LAKES_URL);
    if (!response.ok) throw new Error(`lakes: HTTP ${response.status}`);
    const lakes = (await response.json()) as Collection;
    return lakes.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: 'Feature' as const,
        properties: {
          id: `lake-${String(f.properties.ne_id ?? f.properties.name)}`,
          name: str(f.properties.name_fr) ?? str(f.properties.name) ?? 'lac',
          nameEn: str(f.properties.name_en) ?? str(f.properties.name),
        },
        geometry: f.geometry,
      }));
  });
}
