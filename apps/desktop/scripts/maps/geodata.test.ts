import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapIndex } from './build-geodata.ts';
import { LAKES_URL, NATURAL_EARTH_COMMIT, OVERTURE_RELEASE } from './overture.ts';
import {
  applyOverrides,
  assemble,
  haversineKm,
  type BundledPlace,
  type CityCandidate,
  type MapPlacesFile,
  type PlacesOverrides,
} from './places.ts';
import {
  USER_AGENT,
  categoryOf,
  parseSights,
  LIGHT_SEED_TYPES,
  retryAfterMs,
  runSightsQuery,
  runSparql,
  sightsQuery,
  type RawSight,
} from './wikidata.ts';
import {
  coverage,
  dropSmallHoles,
  extentKm,
  mainBbox,
  minAreaKm2,
  pickLandLevel,
  ringAreaKm2,
  scaleBbox,
  toleranceMetres,
  type Feature,
} from './simplify.ts';
import { placesIso, selectSubjects, subjectDefs } from './subjects.ts';

const MAPS_DIR = join(import.meta.dirname, '../../resources/maps');
const index = JSON.parse(readFileSync(join(MAPS_DIR, 'index.json'), 'utf8')) as MapIndex;
const read = (file: string): Buffer => readFileSync(join(MAPS_DIR, file));

interface Topo {
  arcs: unknown[][];
  objects: Record<
    string,
    { geometries: { type: string; arcs?: unknown[]; properties?: Record<string, string> }[] }
  >;
}
const topo = (id: string): Topo => JSON.parse(read(`subjects/${id}.topo.json`).toString('utf8'));
/** Points of the arcs that the land geometry uses (after simplification). */
function landPoints(id: string): number {
  const t = topo(id);
  const used = new Set<number>();
  const walk = (a: unknown): void => {
    if (Array.isArray(a)) a.forEach(walk);
    else if (typeof a === 'number') used.add(a < 0 ? ~a : a);
  };
  for (const g of t.objects.land!.geometries) walk(g.arcs);
  return [...used].reduce((sum, i) => sum + (t.arcs[i]?.length ?? 0), 0);
}
const entry = (id: string) => {
  const found = index.subjects.find((s) => s.id === id);
  if (!found) throw new Error(`no subject ${id} in index.json`);
  return found;
};

const square = (x: number, y: number, size: number): number[][] => [
  [x, y],
  [x, y + size],
  [x + size, y + size],
  [x + size, y],
  [x, y],
];

describe('the tolerance rule', () => {
  it('is 0.05 mm on a 400 mm page', () => {
    expect(toleranceMetres(1650)).toBeCloseTo(206.25, 2);
    expect(toleranceMetres(280)).toBeCloseTo(35, 5);
  });

  it('drops islets and holes under (0.3 mm on paper)^2', () => {
    // 1650 km on 400 mm: 0.3 mm is 1237.5 m
    expect(minAreaKm2(1650)).toBeCloseTo(1.53, 2);
  });

  it('measures the larger extent of a bbox in km', () => {
    expect(extentKm([0, 0, 1, 2])).toBeCloseTo(221.1, 0);
    expect(extentKm([0, 0, 2, 1])).toBeCloseTo(222.6, 0);
  });

  it('keeps the frame of a country to its main landmass', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[square(0, 0, 10)], [square(100, 50, 0.1)]],
      },
    };
    expect(mainBbox(feature)).toEqual([0, 0, 10, 10]);
    scaleBbox([0, 0, 10, 10], 1.3).forEach((v, i) =>
      expect(v).toBeCloseTo([-1.5, -1.5, 11.5, 11.5][i] ?? NaN, 9),
    );
  });

  it('removes only the holes that are too small', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [square(0, 0, 10), square(1, 1, 0.001), square(4, 4, 2)],
      },
    };
    const geometry = dropSmallHoles(feature, 1).geometry;
    expect(geometry.type === 'Polygon' && geometry.coordinates).toHaveLength(2);
  });
});

describe('the land outline level', () => {
  const box = (x: number, y: number, w: number, h: number): Feature => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x, y + h],
          [x + w, y + h],
          [x + w, y],
          [x, y],
        ],
      ],
    },
  });
  const land = box(0, 0, 10, 10);

  it('measures the area the divisions cover, holes removed', () => {
    expect(coverage(land, [box(0, 0, 10, 5), box(0, 5, 10, 5)])).toBeCloseTo(1, 2);
    expect(coverage(land, [box(0, 0, 10, 5)])).toBeCloseTo(0.5, 1);
  });

  it('accepts a level covering at least 98 % and rejects one below', async () => {
    const load = (features: Feature[]) => async () => features;
    const full = [box(0, 0, 10, 9.8)]; // 98 %
    const short = [box(0, 0, 10, 9.7)]; // 97 %
    expect((await pickLandLevel(land, [{ name: 'region', load: load(full) }]))?.name).toBe(
      'region',
    );
    expect(await pickLandLevel(land, [{ name: 'region', load: load(short) }])).toBeNull();
  });

  it('falls through to the next level, and skips empty ones', async () => {
    const half = [box(0, 0, 10, 5)];
    const all = [box(0, 0, 10, 10)];
    const picked = await pickLandLevel(land, [
      { name: 'region', load: async () => [] },
      { name: 'county', load: async () => half },
      { name: 'locality', load: async () => all },
    ]);
    expect(picked?.name).toBe('locality');
  });

  it('draws small islands from the divisions, not from the coarse country polygon', () => {
    // tolerance ~ 9 m on a 70 km extent: Overture's own polygons had 200 and 62 vertices
    expect(landPoints('FR-MQ')).toBeGreaterThanOrEqual(1000);
    expect(landPoints('FR-RE')).toBeGreaterThanOrEqual(1000);
  });

  it('measures a ring across the antimeridian like the same ring elsewhere', () => {
    const ring = (x: number): number[][] => [
      [x - 1, 60],
      [x - 1, 62],
      [x + 1, 62],
      [x + 1, 60],
      [x - 1, 60],
    ];
    const wrapped = ring(180).map(([x, y]) => [x! > 180 ? x! - 360 : x!, y!]);
    expect(ringAreaKm2(wrapped)).toBeCloseTo(ringAreaKm2(ring(0)), 6);
    expect(ringAreaKm2(ring(0))).toBeGreaterThan(20000);
    expect(ringAreaKm2(ring(0))).toBeLessThan(30000);
  });

  it('records where each land outline comes from', () => {
    expect(entry('TH').landSource).toBe('region');
    expect(entry('FR-MQ').landSource).toBe('region');
    // US and Alaska span the antimeridian: their divisions must still be recognised as covering
    expect(entry('US').landSource).toBe('region');
    expect(entry('US-AK').landSource).toBe('county');
  });

  it('keeps Thailand at least as detailed as the country polygon was (3047 points)', () => {
    expect(landPoints('TH')).toBeGreaterThanOrEqual(3047);
  });
});

describe('the subject list', () => {
  const catalog = ['FR', 'MQ', 'RE', 'US', 'TH', 'GI'].map((country) => ({
    id: country,
    country,
    subtype: country === 'GI' ? ('dependency' as const) : ('country' as const),
    nameFr: null,
    namePrimary: country,
    nameEn: null,
    bbox: [0, 0, 1, 1] as [number, number, number, number],
  }));

  it('splits France into the metropole and its overseas departments, and the US into parts', () => {
    const ids = subjectDefs(catalog).map((d) => d.id);
    expect(ids).toEqual(['FR-MET', 'FR-MQ', 'FR-RE', 'GI', 'TH', 'US', 'US-AK', 'US-HI']);
  });

  it('selects by id, ISO code or id prefix and rejects unknown ones', () => {
    const defs = subjectDefs(catalog);
    expect(selectSubjects(defs, ['FR']).map((d) => d.id)).toEqual(['FR-MET', 'FR-MQ', 'FR-RE']);
    expect(selectSubjects(defs, ['us-hi']).map((d) => d.id)).toEqual(['US-HI']);
    expect(() => selectSubjects(defs, ['ZZ'])).toThrow(/unknown/);
  });
});

describe('resources/maps/index.json', () => {
  it('records the Overture release it was built from', () => {
    expect(index.overture).toBe(OVERTURE_RELEASE);
    expect(index.built).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('points to an existing file with the recorded sha256, for every subject', () => {
    expect(index.subjects.length).toBeGreaterThan(0);
    for (const subject of index.subjects) {
      expect(existsSync(join(MAPS_DIR, subject.file)), `${subject.id} file`).toBe(true);
      const sha = createHash('sha256').update(read(subject.file)).digest('hex');
      expect(sha, `${subject.id} sha256`).toBe(subject.sha256);
    }
  });

  it('has no file that the index does not list', async () => {
    const entries = await readdir(join(MAPS_DIR, 'subjects'), { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => relative(MAPS_DIR, join(e.parentPath, e.name)).split(sep).join('/'));
    expect(files.sort()).toEqual(index.subjects.map((s) => s.file).sort());
  });

  it('gives every subject a French name and at least one land polygon', () => {
    for (const subject of index.subjects) {
      expect(subject.name.trim(), `${subject.id} name`).not.toBe('');
      const land = topo(subject.id).objects.land!.geometries;
      expect(land.length, `${subject.id} land`).toBe(1);
      const polygons = land[0]?.type === 'MultiPolygon' ? (land[0].arcs ?? []).length : 1;
      expect(polygons, `${subject.id} polygons`).toBeGreaterThanOrEqual(1);
      expect(Object.keys(topo(subject.id).objects).sort()).toEqual([
        'lakes',
        'land',
        'neighbours',
        'regions',
      ]);
    }
  });

  it('lists Thailand with its 77 provinces, ids from ISO 3166-2', () => {
    const th = entry('TH');
    expect(th.name).toBe('Thaïlande');
    expect(th.kind).toBe('country');
    expect(th.regions).toHaveLength(77);
    expect(th.regions.every((r) => /^TH-\d+$/.test(r.id) && r.name !== '')).toBe(true);
    const drawn = topo('TH').objects.regions!.geometries.map((g) => g.properties?.id);
    expect(drawn.sort()).toEqual(th.regions.map((r) => r.id).sort());
  });

  it('keeps Réunion out of metropolitan France', () => {
    const fr = entry('FR-MET');
    expect(fr.kind).toBe('overseas');
    expect(fr.bbox[0]).toBeGreaterThan(-6);
    expect(fr.bbox[2]).toBeLessThan(10);
    expect(entry('FR-RE').bbox[0]).toBeGreaterThan(50);
  });

  it('draws Lake Titicaca in Peru, clipped to the subject', () => {
    const lakes = topo('PE').objects.lakes!.geometries;
    expect(lakes.some((g) => /titicaca/i.test(g.properties?.name ?? ''))).toBe(true);
  });

  it('keeps the base files small', () => {
    for (const subject of index.subjects) {
      expect(read(subject.file).length, `${subject.id} bytes`).toBeLessThan(2_500_000);
    }
  });
});

describe('the licence of resources/maps', () => {
  it('is declared in LICENCES.json as ODbL, with the Natural Earth lakes noted', () => {
    const own = JSON.parse(readFileSync(join(MAPS_DIR, '../LICENCES.json'), 'utf8')) as {
      entries: { files: string[]; licence: string; author: string; note?: string }[];
    };
    const maps = own.entries.filter((e) => e.files.some((f) => f.startsWith('maps/')));
    expect(maps.length).toBeGreaterThan(0);
    for (const e of maps) {
      expect(e.licence).toBe('ODbL 1.0');
      expect(e.author).toBe('© OpenStreetMap contributors, Overture Maps Foundation');
      expect(e.note).toMatch(/Natural Earth/);
    }
    const listed = new Set(maps.flatMap((e) => e.files));
    expect(listed.has('maps/index.json')).toBe(true);
    for (const subject of index.subjects) expect(listed.has(`maps/${subject.file}`)).toBe(true);
  });
});

const placesFile = (iso: string): MapPlacesFile =>
  JSON.parse(read(`places/${iso}.json`).toString('utf8')) as MapPlacesFile;
const subjectIsos = [...new Set(index.subjects.map((s) => s.id.split('-')[0]!))];
const inBox = (p: BundledPlace, [x0, y0, x1, y1]: [number, number, number, number]): boolean =>
  p.lon >= x0 && p.lon <= x1 && p.lat >= y0 && p.lat <= y1;

describe('the Natural Earth pin', () => {
  it('uses a commit for the lakes and the places, never a branch', () => {
    expect(NATURAL_EARTH_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(LAKES_URL).toContain(`/${NATURAL_EARTH_COMMIT}/`);
    expect(LAKES_URL).not.toContain('/master/');
  });
});

describe('the places helpers', () => {
  it('files the overseas departments of France under FR', () => {
    expect(['MQ', 'GP', 'GF', 'RE', 'YT', 'FR', 'TH', 'US'].map(placesIso)).toEqual([
      'FR',
      'FR',
      'FR',
      'FR',
      'FR',
      'FR',
      'TH',
      'US',
    ]);
  });

  it('measures a distance on the sphere', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
    expect(haversineKm(100.5, 13.7, 100.5, 13.7)).toBe(0);
  });

  it('files a Wikidata sight in the category its types and name give', () => {
    const sight = (types: string[], name = 'x', worldHeritage = false) => ({
      types,
      name,
      worldHeritage,
    });
    expect(categoryOf(sight(['Q46169']))).toBe('nature');
    expect(categoryOf(sight([], 'parc national de Manu', true))).toBe('nature');
    expect(categoryOf(sight(['Q23442'], 'Délos', true))).toBe('patrimoine');
    expect(categoryOf(sight(['Q23442']))).toBe('nature');
    expect(categoryOf(sight(['Q40080']))).toBe('plage');
    expect(categoryOf(sight(['Q8072']))).toBe('montagne');
    expect(categoryOf(sight(['Q16970'], 'église'))).toBe('religieux');
    expect(categoryOf(sight(['Q16970'], 'église', true))).toBe('patrimoine');
    expect(categoryOf(sight(['Q839954']))).toBe('patrimoine');
    expect(categoryOf(sight(['Q515']))).toBe('ville');
    expect(categoryOf(sight([]))).toBe('autre');
  });
});

describe('the Wikidata client', () => {
  it('asks for one country, World Heritage first, with French labels', () => {
    const query = sightsQuery('TH');
    expect(query).toContain('wdt:P297 "TH"');
    expect(query).toContain('wdt:P1435 wd:Q9259');
    expect(query).toContain('wikibase:sitelinks');
    expect(query).toContain('"fr,en"');
    expect(() => sightsQuery('TH" } ')).toThrow();
  });

  it('sends the generic User-Agent, never a personal address', async () => {
    expect(USER_AGENT).toBe('travelbook-build/0.1 (https://github.com/corentinravoux/travelbook)');
    expect(USER_AGENT).not.toMatch(/@/);
    let seen: Headers | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await runSparql('SELECT 1', fake, async () => {});
    expect(seen?.get('user-agent')).toBe(USER_AGENT);
  });

  it('waits for Retry-After on HTTP 429, then retries', async () => {
    const waits: number[] = [];
    let calls = 0;
    const fake = (async () => {
      calls += 1;
      return calls === 1
        ? new Response('', { status: 429, headers: { 'Retry-After': '7' } })
        : new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const body = await runSparql('SELECT 1', fake, async (ms) => void waits.push(ms));
    expect(body).toBe('{"ok":true}');
    expect(waits).toEqual([7000]);
  });

  it('gives up on a client error, and reads Retry-After as seconds or a date', async () => {
    const fake = (async () => new Response('', { status: 400 })) as unknown as typeof fetch;
    await expect(runSparql('SELECT 1', fake, async () => {})).rejects.toThrow('HTTP 400');
    expect(retryAfterMs('12')).toBe(12_000);
    expect(
      retryAfterMs('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')),
    ).toBe(10_000);
    expect(retryAfterMs(null)).toBe(30_000);
  });

  it('counts an instance of "World Heritage Site" as World Heritage (Machu Picchu)', () => {
    const raw = JSON.stringify({
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q676203' },
            itemLabel: { value: 'Machu Picchu' },
            coord: { value: 'Point(-72.5456 -13.1633)' },
            links: { value: '151' },
            types: { value: 'Q9259,Q839954' },
          },
        ],
      },
    });
    expect(parseSights(raw)[0]?.worldHeritage).toBe(true);
  });

  it('falls back to the light query when the full one times out', async () => {
    const queries: string[] = [];
    const fake = (async (url: string) => {
      queries.push(decodeURIComponent(new URL(url).searchParams.get('query') ?? ''));
      return queries.length === 1 ? new Response('', { status: 504 }) : new Response('{"ok":1}');
    }) as unknown as typeof fetch;
    expect(await runSightsQuery('US', fake, async () => {})).toBe('{"ok":1}');
    expect(queries).toHaveLength(2);
    expect(queries[1]!.length).toBeLessThan(queries[0]!.length);
    expect(queries[1]).toContain(`wd:${LIGHT_SEED_TYPES[0]}`);
    expect(queries[1]).not.toContain('wd:Q16970');
  });

  it('merges the rows of one item and drops the unlabelled ones', () => {
    const row = (qid: string, label: string, extra: Record<string, string>) => ({
      item: { value: `http://www.wikidata.org/entity/${qid}` },
      itemLabel: { value: label },
      coord: { value: 'Point(100.5 13.75)' },
      links: { value: '40' },
      types: { value: 'Q839954,Q16970' },
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
    });
    const raw = JSON.stringify({
      results: {
        bindings: [
          row('Q1', 'Wat Pho', { parent: 'http://www.wikidata.org/entity/Q9' }),
          row('Q1', 'Wat Pho', { parent: 'http://www.wikidata.org/entity/Q8', wh: 'true' }),
          row('Q2', 'Q2', {}),
        ],
      },
    });
    const sights = parseSights(raw);
    expect(sights).toHaveLength(1);
    expect(sights[0]).toMatchObject({
      qid: 'Q1',
      lon: 100.5,
      lat: 13.75,
      links: 40,
      worldHeritage: true,
      parents: ['Q9', 'Q8'],
      types: ['Q839954', 'Q16970'],
    });
  });
});

describe('assembling a places file', () => {
  const box: [number, number, number, number] = [0, 0, 10, 10];
  const city = (n: number, extra: Partial<CityCandidate> = {}): CityCandidate => ({
    ref: `ne:${n}`,
    name: `Ville ${n}`,
    lon: n / 10,
    lat: 5,
    capital: false,
    labelRank: n,
    pop: 1000 - n,
    ...extra,
  });
  const sight = (qid: string, lon: number, extra: Partial<RawSight> = {}): RawSight => ({
    qid,
    name: `Site ${qid}`,
    lon,
    lat: 5,
    links: 50,
    worldHeritage: false,
    parents: [],
    types: ['Q570116'],
    ...extra,
  });

  it('puts the capital first and ranks the cities from 0', () => {
    const file = assemble('XX', [city(1), city(2, { capital: true }), city(3)], [], [box]);
    expect(file.places.map((p) => [p.name, p.kind, p.rank])).toEqual([
      ['Ville 2', 'capital', 0],
      ['Ville 1', 'city', 1],
      ['Ville 3', 'city', 2],
    ]);
  });

  it('rounds coordinates to 5 decimals', () => {
    const file = assemble('XX', [city(1, { lon: 1.123456789, lat: 2.987654321 })], [], [box]);
    expect(file.places[0]).toMatchObject({ lon: 1.12346, lat: 2.98765 });
  });

  it('caps the cities per subject and drops places outside every subject', () => {
    const cities = [city(1), city(2), city(3), city(4, { lon: 50 })];
    const file = assemble('XX', cities, [], [box], { cities: 2, sights: 40 });
    expect(file.places.map((p) => p.ref)).toEqual(['ne:1', 'ne:2']);
  });

  it('ranks World Heritage first, then by sitelinks', () => {
    const sights = [
      sight('Q1', 1, { links: 90 }),
      sight('Q2', 3, { links: 20, worldHeritage: true }),
    ];
    const file = assemble('XX', [], sights, [box]);
    expect(file.places.map((p) => [p.ref, p.kind, p.rank])).toEqual([
      ['wd:Q2', 'sight', 0],
      ['wd:Q1', 'sight', 1],
    ]);
  });

  it('merges serial parts: one sight per parent within 2 km, but far parts stay', () => {
    const near = [
      sight('Q1', 1, { parents: ['Q9'], links: 60 }),
      sight('Q2', 1.01, { parents: ['Q9'], links: 30 }),
    ];
    expect(assemble('XX', [], near, [box]).places.map((p) => p.ref)).toEqual(['wd:Q1']);
    const far = [sight('Q1', 1, { parents: ['Q9'] }), sight('Q2', 5, { parents: ['Q9'] })];
    expect(assemble('XX', [], far, [box]).places).toHaveLength(2);
  });

  it('keeps a city out of the sights, and a sight nearer than 1 km to a better one', () => {
    const cities = [city(1, { qid: 'Q100' })];
    const sights = [
      sight('Q100', 0.1, { types: ['Q515'] }),
      sight('Q200', 7, { types: ['Q515'], name: 'Ville voisine' }),
      sight('Q3', 3, { links: 80 }),
      sight('Q4', 3.002, { links: 40 }),
    ];
    const refs = assemble('XX', cities, sights, [box]).places.map((p) => p.ref);
    expect(refs).toEqual(['ne:1', 'wd:Q3', 'wd:Q200']);
    expect(
      assemble('XX', cities, sights, [box]).places.find((p) => p.ref === 'wd:Q200')?.category,
    ).toBe('ville');
  });
});

describe('the place overrides', () => {
  const base: MapPlacesFile = {
    iso: 'TH',
    places: [
      { ref: 'ne:1', kind: 'capital', name: 'Bangkok', lon: 100.5, lat: 13.75, rank: 0 },
      { ref: 'ne:2', kind: 'city', name: 'Chiang Mai', lon: 98.99, lat: 18.79, rank: 1 },
      { ref: 'wd:Q3', kind: 'sight', category: 'autre', name: 'Bruit', lon: 99, lat: 18, rank: 0 },
    ],
  };

  it('are applied last: rename, drop, add', () => {
    const overrides: PlacesOverrides = {
      TH: {
        rename: { 'ne:1': 'Krung Thep' },
        drop: ['wd:Q3'],
        add: [
          {
            ref: 'wd:Q4',
            kind: 'sight',
            category: 'plage',
            name: 'Railay',
            lon: 98.84,
            lat: 8.01,
            rank: 0,
          },
        ],
      },
      FR: { drop: ['ne:2'] },
    };
    const out = applyOverrides(base, overrides);
    expect(out.places.map((p) => [p.ref, p.name])).toEqual([
      ['ne:1', 'Krung Thep'],
      ['ne:2', 'Chiang Mai'],
      ['wd:Q4', 'Railay'],
    ]);
    expect(base.places[0]!.name).toBe('Bangkok');
    expect(applyOverrides(base, {})).toEqual(base);
  });

  it('ships empty, as an object', () => {
    expect(JSON.parse(read('places-overrides.json').toString('utf8'))).toEqual({});
  });
});

describe('resources/maps/places', () => {
  it('has a file for every ISO of the index, and nothing else', async () => {
    const files = (await readdir(join(MAPS_DIR, 'places'))).sort();
    expect(files).toEqual(subjectIsos.map((iso) => `${iso}.json`).sort());
  });

  it('lists Bangkok as the capital of Thailand, rank 0, and Chiang Mai as a city', () => {
    const { places } = placesFile('TH');
    const bangkok = places.find((p) => p.name === 'Bangkok');
    expect(bangkok).toMatchObject({ kind: 'capital', rank: 0 });
    expect(places.filter((p) => p.kind === 'capital')).toHaveLength(1);
    expect(places.find((p) => p.name === 'Chiang Mai')?.kind).toBe('city');
  });

  it('lists Machu Picchu in Peru as a heritage sight', () => {
    const machu = placesFile('PE').places.find((p) => p.name === 'Machu Picchu');
    expect(machu).toMatchObject({ kind: 'sight', category: 'patrimoine' });
    expect(machu?.ref).toMatch(/^wd:Q\d+$/);
  });

  it('keeps every place inside the bbox of a subject of its ISO', () => {
    for (const iso of subjectIsos) {
      const boxes = index.subjects.filter((s) => s.id.split('-')[0] === iso).map((s) => s.bbox);
      for (const place of placesFile(iso).places) {
        expect(
          boxes.some((box) => inBox(place, box)),
          `${iso} ${place.name}`,
        ).toBe(true);
      }
    }
  });

  it('gives the overseas departments of France places in the FR file', () => {
    const { places } = placesFile('FR');
    const within = (id: string) => {
      const box = entry(id).bbox;
      return places.filter((p) => inBox(p, box));
    };
    expect(within('FR-MET').length).toBeGreaterThan(20);
    expect(within('FR-GF').some((p) => p.name === 'Cayenne')).toBe(true);
    expect(within('FR-MQ').some((p) => p.name === 'Fort-de-France')).toBe(true);
    expect(within('FR-RE').length).toBeGreaterThan(0);
  });

  it('has no two sights within 2 km sharing a parent, which assemble() guarantees', () => {
    // The file carries no parent: the guarantee is that no two sights are closer than 1 km.
    for (const iso of subjectIsos) {
      const sights = placesFile(iso).places.filter((p) => p.kind === 'sight');
      for (const [i, a] of sights.entries()) {
        for (const b of sights.slice(i + 1)) {
          expect(
            haversineKm(a.lon, a.lat, b.lon, b.lat),
            `${iso} ${a.name} / ${b.name}`,
          ).toBeGreaterThan(1);
        }
      }
    }
  });

  it('is well formed: unique refs, French names, ranks from 0, 5 decimals, categories', () => {
    const categories = ['patrimoine', 'nature', 'plage', 'montagne', 'religieux', 'ville', 'autre'];
    for (const iso of subjectIsos) {
      const { places, iso: fileIso } = placesFile(iso);
      expect(fileIso).toBe(iso);
      expect(new Set(places.map((p) => p.ref)).size).toBe(places.length);
      for (const kind of ['city', 'sight'] as const) {
        const ranks = places
          .filter((p) => (kind === 'city' ? p.kind !== 'sight' : p.kind === 'sight'))
          .map((p) => p.rank)
          .sort((a, b) => a - b);
        expect(ranks, `${iso} ${kind} ranks`).toEqual(ranks.map((_, i) => i));
      }
      for (const p of places) {
        expect(p.name.trim(), `${iso} ${p.ref}`).not.toBe('');
        expect(p.ref).toMatch(/^(ne:\d+|gn:\d+|wd:Q\d+)$/);
        expect(Math.round(p.lon * 1e5) / 1e5).toBe(p.lon);
        expect(Math.round(p.lat * 1e5) / 1e5).toBe(p.lat);
        if (p.kind === 'sight') expect(categories).toContain(p.category);
      }
    }
  });

  it('keeps the files small', () => {
    for (const iso of subjectIsos) {
      expect(read(`places/${iso}.json`).length, `${iso} bytes`).toBeLessThan(60_000);
    }
  });
});

describe('the licence of the places', () => {
  it('lists the places files and credits Natural Earth, Wikidata and GeoNames', () => {
    const own = JSON.parse(readFileSync(join(MAPS_DIR, '../LICENCES.json'), 'utf8')) as {
      entries: { files: string[]; note?: string }[];
    };
    const maps = own.entries.find((e) => e.files.includes('maps/index.json'));
    expect(maps).toBeDefined();
    const listed = new Set(maps!.files);
    expect(listed.has('maps/places-overrides.json')).toBe(true);
    for (const iso of subjectIsos) expect(listed.has(`maps/places/${iso}.json`)).toBe(true);
    expect(maps!.note).toMatch(/Natural Earth populated places, public domain/);
    expect(maps!.note).toMatch(/Wikidata, CC0/);
    expect(maps!.note).toMatch(/GeoNames, CC BY 4\.0/);
  });
});
