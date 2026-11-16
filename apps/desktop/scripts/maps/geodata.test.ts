import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapIndex } from './build-geodata.ts';
import { OVERTURE_RELEASE } from './overture.ts';
import {
  coverage,
  dropSmallHoles,
  extentKm,
  mainBbox,
  minAreaKm2,
  pickLandLevel,
  scaleBbox,
  toleranceMetres,
  type Feature,
} from './simplify.ts';
import { selectSubjects, subjectDefs } from './subjects.ts';

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
