import { feature, neighbors } from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { bakeGeometry, farLand, simplifyTopology, type Topology } from './bake';
import { d3Projection, projectPlace, type MapGeometry } from './projection';
import {
  box,
  packTopology,
  rectangles,
  regionId,
  subjectTopology,
  worldTopology,
} from './test-geodata';
import type { MapElement } from './types';

type Subject = MapElement['subject'];

const subject = (id: string, over: Partial<Subject> = {}): Subject => ({
  id,
  regions: [],
  showRegions: true,
  showNeighbours: true,
  showLakes: true,
  includeRemote: false,
  ...over,
});

const PATHS = ['land', 'outline', 'regions', 'selected', 'neighbours', 'lakes'] as const;

/** Every number of a path string, as [x, y] pairs. */
function points(d: string): [number, number][] {
  const n = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i] ?? 0, n[i + 1] ?? 0]);
  return out;
}
const commands = (d: string): number => (d.match(/[A-Za-z]/g) ?? []).length;
const size = (g: MapGeometry): { w: number; h: number } => ({
  w: g.bounds[1][0] - g.bounds[0][0],
  h: g.bounds[1][1] - g.bounds[0][1],
});

const th = subjectTopology('TH');
const bakeTh = (over: Partial<Subject> = {}, detail = 1): MapGeometry =>
  bakeGeometry(th, null, subject('TH', over), 'auto', null, detail);

describe('bakeGeometry, a whole subject', () => {
  const g = bakeTh();

  it('bakes Thailand in a transverse Mercator, in unit coordinates', () => {
    expect(g.version).toBe(1);
    expect(g.projection.kind).toBe('transverseMercator');
    expect(g.bounds[0]).toEqual([0, 0]);
    const { w, h } = size(g);
    expect(Math.max(w, h)).toBeCloseTo(1000, 6);
    expect(h).toBeGreaterThan(w); // Thailand is taller than wide
  });

  it('has every path, none of them with a NaN, and no selection', () => {
    for (const name of PATHS) {
      if (name === 'selected') continue;
      expect(g.paths[name].length).toBeGreaterThan(100);
    }
    expect(g.paths.selected).toBe('');
    for (const name of PATHS) expect(g.paths[name]).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it('has bounds that cover the drawn land', () => {
    const all = points(g.paths.land);
    const xs = all.map(([x]) => x);
    const ys = all.map(([, y]) => y);
    expect(Math.min(...xs)).toBeGreaterThan(g.bounds[0][0] - 1);
    expect(Math.max(...xs)).toBeLessThan(g.bounds[1][0] + 1);
    expect(Math.min(...ys)).toBeGreaterThan(g.bounds[0][1] - 1);
    expect(Math.max(...ys)).toBeLessThan(g.bounds[1][1] + 1);
  });

  it('puts places inside the bounds with the same projection', () => {
    const [x, y] = projectPlace(g.projection, 100.5, 13.75); // Bangkok
    expect(x).toBeGreaterThan(g.bounds[0][0]);
    expect(x).toBeLessThan(g.bounds[1][0]);
    expect(y).toBeGreaterThan(g.bounds[0][1]);
    expect(y).toBeLessThan(g.bounds[1][1]);
  });

  it('has no remote part in Thailand: the two bounds are the same', () => {
    expect(g.remoteBounds[0][0]).toBeCloseTo(g.bounds[0][0], 6);
    expect(g.remoteBounds[1][1]).toBeCloseTo(g.bounds[1][1], 6);
  });

  it('leaves out the layers that the subject switches off', () => {
    expect(bakeTh({ showRegions: false }).paths.regions).toBe('');
    expect(bakeTh({ showNeighbours: false }).paths.neighbours).toBe('');
    expect(bakeTh({ showLakes: false }).paths.lakes).toBe('');
    expect(bakeTh({ showLakes: false }).paths.land).toBe(g.paths.land);
  });

  it('is deterministic and does not change its input', () => {
    const before = JSON.stringify(th);
    expect(bakeTh()).toEqual(g);
    expect(JSON.stringify(th)).toBe(before);
  });

  it('forces a Mercator when asked', () => {
    const m = bakeGeometry(th, null, subject('TH'), 'mercator', null, 1);
    expect(m.projection.kind).toBe('mercator');
    expect(m.paths.land).not.toBe(g.paths.land);
  });
});

describe('bakeGeometry, chosen regions', () => {
  const krabi = regionId('TH', 'Krabi');
  const phuket = regionId('TH', 'Phuket');
  const g = bakeTh({ regions: [krabi, phuket] });

  it('selects Krabi and Phuket from the index ids', () => {
    expect([krabi, phuket]).toEqual(['TH-81', 'TH-83']);
    expect(g.paths.selected.length).toBeGreaterThan(100);
  });

  it('frames the selection: bounds around it, the country is context outside', () => {
    expect(Math.max(size(g).w, size(g).h)).toBeCloseTo(1000, 6);
    for (const [lon, lat] of [
      [98.9, 8.1], // Krabi
      [98.4, 7.9], // Phuket
    ] as const) {
      const [x, y] = projectPlace(g.projection, lon, lat);
      expect(x).toBeGreaterThan(g.bounds[0][0]);
      expect(x).toBeLessThan(g.bounds[1][0]);
      expect(y).toBeGreaterThan(g.bounds[0][1]);
      expect(y).toBeLessThan(g.bounds[1][1]);
    }
    const [, bangkokY] = projectPlace(g.projection, 100.5, 13.75);
    expect(bangkokY).toBeLessThan(g.bounds[0][1] - 100);
    const landY = points(g.paths.land).map(([, y]) => y);
    expect(Math.min(...landY)).toBeLessThan(g.bounds[0][1] - 100);
  });

  it('keeps the selection inside the bounds', () => {
    for (const [x, y] of points(g.paths.selected)) {
      expect(x).toBeGreaterThan(g.bounds[0][0] - 1);
      expect(x).toBeLessThan(g.bounds[1][0] + 1);
      expect(y).toBeGreaterThan(g.bounds[0][1] - 1);
      expect(y).toBeLessThan(g.bounds[1][1] + 1);
    }
  });

  it('draws the outline of the selection, not of the country', () => {
    expect(commands(g.paths.outline)).toBeLessThan(commands(bakeTh().paths.outline));
    const ys = points(g.paths.outline).map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThan(g.bounds[0][1] - 1);
  });

  it('ignores a region id that the subject does not have', () => {
    expect(bakeTh({ regions: [krabi, 'TH-NOPE'] })).toEqual(bakeTh({ regions: [krabi] }));
    expect(bakeTh({ regions: ['TH-NOPE'] })).toEqual(bakeTh());
  });

  it('takes the regions from the fine pack when there is one, and the land with them', () => {
    const us = subjectTopology('US');
    const pack = packTopology('US');
    const ca = bakeGeometry(us, pack, subject('US', { regions: ['US-CA'] }), 'auto', null, 1);
    expect(ca.paths.selected.length).toBeGreaterThan(100);
    const { w, h } = size(ca);
    expect(Math.max(w, h)).toBeCloseTo(1000, 6);
    expect(h).toBeGreaterThan(w); // California is taller than wide
    const [x, y] = projectPlace(ca.projection, -119.4, 36.8);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(w);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(h);
    for (const name of PATHS) expect(ca.paths[name]).not.toMatch(/NaN|Infinity/);
  });

  it('draws the land of a pack as the union of its regions, in the same frame as the regions', () => {
    const crete = bakeGeometry(
      subjectTopology('GR'),
      packTopology('GR'),
      subject('GR', { regions: [regionId('GR', 'Crète')] }),
      'auto',
      null,
      1,
    );
    const { w, h } = size(crete);
    expect(w).toBeCloseTo(1000, 6);
    expect(w / h).toBeGreaterThan(2); // Crete is a long island
    // the rest of Greece is context, and right side up: nothing runs off to infinity
    for (const [x, y] of points(crete.paths.land)) {
      expect(Math.abs(x)).toBeLessThan(10_000);
      expect(Math.abs(y)).toBeLessThan(10_000);
    }
    expect(Math.min(...points(crete.paths.land).map(([x]) => x))).toBeLessThan(-500);
  });

  describe('with a pack, on California', () => {
    const us = subjectTopology('US');
    const pack = packTopology('US');
    const chosen = subject('US', { regions: ['US-CA'] });
    const clean = bakeGeometry(us, pack, chosen, 'auto', null, 1);
    const hand = bakeGeometry(us, pack, chosen, 'auto', { seed: 1, roughness: 1 }, 1);
    const total = (g: MapGeometry): number => Object.values(g.paths).join('').length;

    it('clips the context to a window of eight selection extents around the selection', () => {
      // California is 1000 units high: the window is 8000 units wide, centred on the bounds
      const cx = (clean.bounds[0][0] + clean.bounds[1][0]) / 2;
      const cy = (clean.bounds[0][1] + clean.bounds[1][1]) / 2;
      for (const name of ['land', 'regions', 'neighbours', 'lakes'] as const) {
        for (const [x, y] of points(clean.paths[name])) {
          expect(Math.abs(x - cx)).toBeLessThanOrEqual(4000.01);
          expect(Math.abs(y - cy)).toBeLessThanOrEqual(4000.01);
        }
      }
      // and the window does hold context: the east coast is three extents away
      expect(Math.max(...points(clean.paths.land).map(([x]) => x))).toBeGreaterThan(2500);
    });

    it('is smaller than before the window (3 949 768 characters), and under 8 M with rough', () => {
      // the bound is from before `neighbourLines` (4.03 M with them): the window effect is measured without
      const lines = clean.paths.neighbourLines?.length ?? 0;
      expect(total(clean) - lines).toBeLessThan(3_949_768);
      expect(total(clean)).toBeLessThan(4_100_000);
      expect(total(hand)).toBeLessThan(8_000_000);
    });

    it('draws only the outline and the borders of the selection by hand', () => {
      expect(hand.paths.outline).not.toBe(clean.paths.outline);
      for (const name of ['land', 'selected', 'neighbours', 'lakes'] as const) {
        expect(hand.paths[name]).toBe(clean.paths[name]);
      }
      // the borders of the context states stay straight lines, those of California are curves
      expect(hand.paths.regions).toMatch(/L/);
      expect(hand.paths.regions).toMatch(/C/);
      expect(hand.paths.regions.length).toBeLessThan(clean.paths.regions.length * 2);
      expect(hand.bounds).toEqual(clean.bounds);
      expect(hand.projection).toEqual(clean.projection);
    });

    it('leaves the borders of the context states byte for byte as in the clean bake', () => {
      // the context borders come first, clean; the borders of California follow, by hand
      const cleanPart = (g: MapGeometry): string => {
        const firstCurve = g.paths.regions.indexOf('C');
        return g.paths.regions.slice(0, g.paths.regions.lastIndexOf('M', firstCurve));
      };
      const other = bakeGeometry(us, pack, chosen, 'auto', { seed: 77, roughness: 2.5 }, 1);
      const context = cleanPart(hand);
      expect(context.length).toBeGreaterThan(1_000_000);
      expect(context).not.toMatch(/C/);
      // not a function of the seed or of the roughness
      expect(cleanPart(other)).toBe(context);
      // and made of the clean bake's own vertices
      const vertices = new Set(points(clean.paths.regions).map(([x, y]) => `${x},${y}`));
      for (const [x, y] of points(context)) expect(vertices.has(`${x},${y}`)).toBe(true);
    });
  });

  describe('with a pack, the whole US and no region chosen', () => {
    const us = subjectTopology('US');
    const pack = packTopology('US');
    const whole = subject('US');
    const clean = bakeGeometry(us, pack, whole, 'auto', null, 1);
    const hand = bakeGeometry(us, pack, whole, 'auto', { seed: 1, roughness: 1 }, 1);
    const total = (g: MapGeometry): number => Object.values(g.paths).join('').length;

    it('stays under 8 M characters with rough (measured 15.1 M with every border by hand)', () => {
      expect(total(hand)).toBeLessThan(8_000_000);
    });

    it('draws the outline by hand and everything else clean', () => {
      expect(hand.paths.outline).not.toBe(clean.paths.outline);
      expect(hand.paths.outline).toMatch(/C/);
      for (const name of ['land', 'regions', 'selected', 'neighbours', 'lakes'] as const) {
        expect(hand.paths[name]).toBe(clean.paths[name]);
      }
    });
  });

  it('treats a pack without regions as no pack', () => {
    const empty = { type: 'Topology', arcs: [], objects: {} } as Topology;
    expect(bakeGeometry(th, empty, subject('TH'), 'auto', null, 1)).toEqual(bakeTh());
  });
});

describe('bakeGeometry, detail', () => {
  const full = bakeTh({}, 1);
  const coarse = bakeTh({}, 0);
  const middle = bakeTh({}, 0.5);

  it('simplifies less detail into fewer path commands, in every layer', () => {
    for (const name of ['land', 'outline', 'regions', 'neighbours'] as const) {
      const a = commands(full.paths[name]);
      const b = commands(middle.paths[name]);
      const c = commands(coarse.paths[name]);
      expect(b).toBeLessThan(a);
      expect(c).toBeLessThan(b);
    }
    expect(commands(coarse.paths.land)).toBeLessThan(commands(full.paths.land) / 2);
  });

  it('keeps the regions drawn on shared borders, so they still meet', () => {
    const regionsOf = (t: Topology): GeometryCollection => t.objects.regions as GeometryCollection;
    const sorted = (n: number[][]): number[][] => n.map((l) => [...l].sort((x, y) => x - y));
    const before = neighbors(regionsOf(th).geometries);
    const after = neighbors(regionsOf(simplifyTopology(th, 1600, 64)).geometries);
    expect(before.flat().length).toBeGreaterThan(200);
    expect(sorted(after)).toEqual(sorted(before));
  });

  it('drops the islets of the land, but never the last part of a region', () => {
    const coarse = simplifyTopology(th, 1600, 64);
    const geometries = (t: Topology, name: string): { type: string | null; arcs?: unknown[] }[] =>
      (t.objects[name] as GeometryCollection).geometries as { type: string | null }[];
    const parts = (g?: { type: string | null; arcs?: unknown[] }): number =>
      g?.type === 'MultiPolygon' ? (g.arcs?.length ?? 0) : g?.type === 'Polygon' ? 1 : 0;
    expect(parts(geometries(coarse, 'land')[0])).toBeLessThan(parts(geometries(th, 'land')[0]) / 4);
    const regions = geometries(coarse, 'regions');
    expect(regions).toHaveLength(77);
    expect(regions.every((g) => parts(g) >= 1)).toBe(true); // Phuket is under the islet size
  });

  it('merges two neighbouring regions into one shape even at the coarsest detail', () => {
    const krabi = regionId('TH', 'Krabi');
    const phangNga = regionId('TH', 'Phang Nga');
    const one = (regions: string[]): number =>
      (bakeTh({ regions }, 0).paths.selected.match(/M/g) ?? []).length;
    // the two main parts fuse: a shared border that is not shared would leave both rings
    expect(one([krabi, phangNga])).toBeLessThan(one([krabi]) + one([phangNga]));
  });

  it('does not move the frame with the detail: same projection and bounds at every level', () => {
    for (const other of [coarse, middle]) {
      expect(other.projection).toEqual(full.projection);
      expect(other.bounds).toEqual(full.bounds);
      expect(other.remoteBounds).toEqual(full.remoteBounds);
    }
  });

  it('detail 1 leaves the geometry as it is, and a bad detail is detail 1', () => {
    expect(bakeTh({}, 1)).toEqual(full);
    expect(bakeTh({}, NaN)).toEqual(full);
    expect(bakeTh({}, 7)).toEqual(full);
    expect(bakeTh({}, -3)).toEqual(bakeTh({}, 0));
  });

  it('never loses a selected region to the islet filter', () => {
    const phuket = regionId('TH', 'Phuket');
    expect(bakeTh({ regions: [phuket] }, 0).paths.selected.length).toBeGreaterThan(20);
  });
});

describe('bakeGeometry, slivers that collapse inside out', () => {
  // A thin crescent A -> B (outer edge bulging west, three points) back through P: clockwise, with
  // the junctions A, B and P an anticlockwise triangle. Dropping the bulge leaves that triangle,
  // which d3 reads as the whole globe minus a speck.
  const A = [20, 5];
  const B = [20, 5.004];
  const P = [19.9999, 5.002];
  const crescent: Topology = {
    type: 'Topology',
    arcs: [
      box(0, 0, 10, 10),
      [A, [19.9998, 5.001], [19.99975, 5.002], [19.9998, 5.003], B],
      [B, P],
      [P, A],
    ],
    objects: {
      land: {
        type: 'GeometryCollection',
        geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1, 2, 3]]], properties: { id: 'X' } }],
      },
      regions: { type: 'GeometryCollection', geometries: [] },
      neighbours: { type: 'GeometryCollection', geometries: [] },
      lakes: { type: 'GeometryCollection', geometries: [] },
    },
  };

  it.each([1, 0.5, 0])('keeps finite paths and bounds at detail %s', (detail) => {
    const g = bakeGeometry(crescent, null, subject('X'), 'auto', null, detail);
    expect(g.paths.land).not.toMatch(/NaN|Infinity/);
    expect(g.bounds[1][0] - g.bounds[0][0]).toBeGreaterThan(900);
    expect(g.bounds.flat().every(Number.isFinite)).toBe(true);
    for (const [x, y] of points(g.paths.land)) {
      expect(Math.abs(x)).toBeLessThan(5000);
      expect(Math.abs(y)).toBeLessThan(5000);
    }
  });

  it('drops the collapsed ring, and any ring of fewer than four points', () => {
    const coarse = simplifyTopology(crescent, 1100, 8);
    const land = coarse.objects.land as GeometryCollection;
    expect((land.geometries[0] as { arcs: unknown[] }).arcs).toHaveLength(1);
  });

  it('drops a ring that collapsed to two points whatever its size', () => {
    // a ring of two 2-point arcs: topojson pads it to four points, and it has no area
    const flat: Topology = {
      type: 'Topology',
      arcs: [box(0, 0, 10, 10), [A, B], [B, A]],
      objects: {
        land: {
          type: 'GeometryCollection',
          geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1, 2]]], properties: { id: 'X' } }],
        },
        regions: { type: 'GeometryCollection', geometries: [] },
        neighbours: { type: 'GeometryCollection', geometries: [] },
        lakes: { type: 'GeometryCollection', geometries: [] },
      },
    };
    for (const factor of [1e-9, 1, 8]) {
      const out = simplifyTopology(flat, 1100, factor);
      const land = out.objects.land as GeometryCollection;
      expect((land.geometries[0] as { arcs: unknown[] }).arcs).toHaveLength(1);
    }
    const g = bakeGeometry(flat, null, subject('X'), 'auto', null, 0.5);
    expect(g.paths.land).not.toMatch(/NaN|Infinity/);
  });

  it('frames a subject whose raw data holds an inside-out ring as if it were not there', () => {
    const inside = JSON.parse(JSON.stringify(crescent)) as Topology;
    // walk the crescent's ring the other way round: anticlockwise, the complement to d3
    (inside.objects.land as GeometryCollection).geometries = [
      { type: 'MultiPolygon', arcs: [[[0]], [[~3, ~2, ~1]]], properties: { id: 'X' } },
    ];
    const g = bakeGeometry(inside, null, subject('X'), 'auto', null, 1);
    expect(g.bounds.flat().every(Number.isFinite)).toBe(true);
    expect(g.bounds[1][0] - g.bounds[0][0]).toBeGreaterThan(900);
  });
});

describe('bakeGeometry, hand-drawn', () => {
  const clean = bakeTh();
  const hand = (seed: number): MapGeometry =>
    bakeGeometry(th, null, subject('TH'), 'auto', { seed, roughness: 1.5 }, 1);

  it('draws only the lines by hand, and only when rough is set', () => {
    const g = hand(3);
    expect(g.paths.outline).not.toBe(clean.paths.outline);
    // nothing chosen: only the outline is by hand, the inner borders stay clean
    expect(g.paths.regions).toBe(clean.paths.regions);
    expect(g.paths.land).toBe(clean.paths.land);
    expect(g.paths.selected).toBe(clean.paths.selected);
    expect(g.paths.neighbours).toBe(clean.paths.neighbours);
    expect(g.paths.outline).not.toMatch(/NaN|undefined/);
    expect(g.bounds).toEqual(clean.bounds);
  });

  it('is stable for a seed, and changes with it', () => {
    expect(hand(3)).toEqual(hand(3));
    expect(hand(4).paths.outline).not.toBe(hand(3).paths.outline);
  });

  it('is stable for seed 0 as well (roughjs takes 0 for "random")', () => {
    expect(hand(0)).toEqual(hand(0));
  });
});

describe('bakeGeometry, antimeridian subjects', () => {
  it('draws Fiji in a frame of its own size, not as wide as the world', () => {
    const fiji = rectangles([
      box(177.3, -18.3, 178.7, -17.2), // Viti Levu
      box(178.3, -17, 179.9, -16.1), // Vanua Levu
      box(-179.9, -17.1, -179.8, -16.7), // Taveuni, east of the antimeridian
      box(-178.9, -19.2, -178, -18.2), // the Lau group
    ]);
    const g = bakeGeometry(fiji, null, subject('FJ'), 'auto', null, 1);
    expect(Math.abs(g.projection.rotate[0] + 179.5)).toBeLessThan(1);
    const { w, h } = size(g);
    expect(w).toBeLessThan(2 * h);
    expect(g.paths.land).not.toMatch(/NaN/);
  });

  it('draws Alaska, which reaches the Aleutians across 180 degrees, in a conic', () => {
    const g = bakeGeometry(
      subjectTopology('US-AK'),
      null,
      subject('US-AK', { showNeighbours: false }),
      'auto',
      null,
      1,
    );
    expect(g.projection.kind).toBe('conicConformal');
    const { w, h } = size(g);
    expect(w / h).toBeGreaterThan(0.5);
    expect(w / h).toBeLessThan(3);
    for (const name of PATHS) expect(g.paths[name]).not.toMatch(/NaN|Infinity/);
  });
});

describe('bakeGeometry, remote parts', () => {
  const hi = subjectTopology('US-HI');
  const kure: [number, number] = [-178.3, 28.4];
  const hilo: [number, number] = [-155.1, 19.7];
  const g = bakeGeometry(hi, null, subject('US-HI'), 'auto', null, 1);

  it('drives the default frame of Hawaii by the main islands, not the far islets', () => {
    const inside = ([x, y]: [number, number]): boolean =>
      x >= g.bounds[0][0] && x <= g.bounds[1][0] && y >= g.bounds[0][1] && y <= g.bounds[1][1];
    expect(inside(projectPlace(g.projection, ...hilo))).toBe(true);
    expect(inside(projectPlace(g.projection, ...kure))).toBe(false);
    // the main islands span ~10 degrees (Nihoa and Necker lie within a width of them); Kure is 24
    expect(g.remoteBounds[1][0] - g.remoteBounds[0][0]).toBeGreaterThan(2 * size(g).w);
  });

  it('has remote bounds that hold the far islets', () => {
    const [x, y] = projectPlace(g.projection, ...kure);
    expect(x).toBeGreaterThanOrEqual(g.remoteBounds[0][0] - 1);
    expect(y).toBeGreaterThanOrEqual(g.remoteBounds[0][1] - 1);
    expect(y).toBeLessThanOrEqual(g.remoteBounds[1][1] + 1);
  });

  it('draws the far islets in the land path anyway', () => {
    const xs = points(g.paths.land).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(g.bounds[0][0] - 500);
  });

  it('includes the remote territories when asked, in the projection too', () => {
    const all = bakeGeometry(hi, null, subject('US-HI', { includeRemote: true }), 'auto', null, 1);
    // centred on the whole extent, not on the main islands
    expect(all.projection.rotate[0] - g.projection.rotate[0]).toBeGreaterThan(3);
    expect(all.remoteBounds[1][0] - all.remoteBounds[0][0]).toBeGreaterThan(
      0.9 * (g.remoteBounds[1][0] - g.remoteBounds[0][0]),
    );
  });
});

describe('bakeGeometry, the window never clips the selection', () => {
  // region R: a 10 degree square and a 1 degree islet 100 degrees east, far beyond eight extents
  // of the main bounds; the islet is remote (under 1 % of the area, farther than one width)
  const islet = box(100, 0, 101, 1);
  const world: Topology = {
    type: 'Topology',
    arcs: [box(0, 0, 10, 10), islet, box(-30, -30, -20, -20)],
    objects: {
      land: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'MultiPolygon', arcs: [[[0]], [[1]], [[2]]], properties: { id: 'W' } },
        ],
      },
      regions: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'MultiPolygon', arcs: [[[0]], [[1]]], properties: { id: 'W-R' } },
          { type: 'Polygon', arcs: [[2]], properties: { id: 'W-S' } },
        ],
      },
      neighbours: { type: 'GeometryCollection', geometries: [] },
      lakes: { type: 'GeometryCollection', geometries: [] },
    },
  };

  it.each([false, true])(
    'keeps a chosen remote part beyond the window (includeRemote %s)',
    (includeRemote) => {
      const g = bakeGeometry(
        world,
        null,
        subject('W', { regions: ['W-R'], includeRemote }),
        'auto',
        null,
        1,
      );
      const [west, east] = [g.bounds[0][0], g.bounds[1][0]];
      expect(east - west).toBeGreaterThan(0);
      const reach = Math.max(...points(g.paths.selected).map(([x]) => x));
      // the islet lies about ten main widths east, past the 4 widths that the main bounds would allow
      expect(reach).toBeGreaterThan(east + 4000);
      expect(reach).toBeGreaterThan(g.remoteBounds[1][0] - 20);
      expect(Math.max(...points(g.paths.land).map(([x]) => x))).toBeGreaterThan(east + 4000);
    },
  );

  it('still clips the context that is not selected', () => {
    const g = bakeGeometry(world, null, subject('W', { regions: ['W-R'] }), 'auto', null, 1);
    // the other square is far west of the islet, beyond the window, and not selected
    const wanted = points(g.paths.regions).concat(points(g.paths.land));
    expect(wanted.length).toBeGreaterThan(0);
    const [cx0, cx1] = [g.remoteBounds[0][0], g.remoteBounds[1][0]];
    const reach = (4 * (cx1 - cx0)) / 1; // eight extents wide: four each side of the centre
    const centre = (cx0 + cx1) / 2;
    for (const [x] of wanted) expect(Math.abs(x - centre)).toBeLessThanOrEqual(reach + 0.01);
  });
});

describe('bakeGeometry, odd input', () => {
  it('bakes an empty topology without throwing', () => {
    const empty = rectangles([]);
    const g = bakeGeometry(empty, null, subject('X'), 'auto', null, 0.4);
    expect(g.paths.land).toBe('');
    expect(g.bounds.flat().every(Number.isFinite)).toBe(true);
    expect(g.remoteBounds.flat().every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(g.projection.k)).toBe(true);
  });

  it('bakes a subject of one tiny polygon', () => {
    const dot = rectangles([box(10, 10, 10.001, 10.001)]);
    const g = bakeGeometry(dot, null, subject('X'), 'auto', null, 1);
    expect(g.projection.k).toBeGreaterThan(0);
    expect(Number.isFinite(g.projection.k)).toBe(true);
  });

  it('bakes a topology that has no neighbours, lakes or regions objects', () => {
    const bare = rectangles([box(0, 0, 4, 4)]);
    delete (bare.objects as Record<string, unknown>).regions;
    delete (bare.objects as Record<string, unknown>).lakes;
    delete (bare.objects as Record<string, unknown>).neighbours;
    const g = bakeGeometry(bare, null, subject('X', { regions: ['a'] }), 'auto', null, 0.5);
    expect(g.paths.land.length).toBeGreaterThan(10);
    expect(g.paths.regions).toBe('');
    expect(g.paths.lakes).toBe('');
    expect(g.paths.selected).toBe('');
  });
});

describe('bakeGeometry, the world far context', () => {
  const world = worldTopology();
  type Box4 = [number, number, number, number];
  /** The bbox of the points of the topology's `neighbours` object: the build's real clip. */
  const neighboursBox = (topology: Topology): Box4 => {
    const { features } = feature(
      topology,
      topology.objects.neighbours as GeometryCollection,
    ) as unknown as {
      features: { geometry: { type: string; coordinates: unknown } | null }[];
    };
    const box: Box4 = [Infinity, Infinity, -Infinity, -Infinity];
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === 'number') {
        box[0] = Math.min(box[0], c[0]);
        box[1] = Math.min(box[1], c[1] as number);
        box[2] = Math.max(box[2], c[0]);
        box[3] = Math.max(box[3], c[1] as number);
      } else if (Array.isArray(c)) c.forEach(walk);
    };
    for (const f of features) walk(f.geometry?.coordinates);
    return box;
  };
  const frameOf = (): Box4 => neighboursBox(th);
  const geometriesLength = (t: Topology): number =>
    (t.objects.neighbours as GeometryCollection).geometries.length;
  const bakeWith = (
    id: string,
    topology: Topology,
    over: Partial<Subject> = {},
    withWorld: Topology | null = world,
    rough: { seed: number; roughness: number } | null = null,
  ): MapGeometry => bakeGeometry(topology, null, subject(id, over), 'auto', rough, 1, withWorld);

  /** The world's contribution: what `paths.neighbours` gained in front of the subject's own. */
  const worldPart = (g: MapGeometry, plain: MapGeometry): string => {
    expect(g.paths.neighbours.endsWith(plain.paths.neighbours)).toBe(true);
    return g.paths.neighbours.slice(0, g.paths.neighbours.length - plain.paths.neighbours.length);
  };

  it('leaves the output byte-identical without a world', () => {
    const plain = bakeTh();
    expect(bakeWith('TH', th, {}, null)).toEqual(plain);
    expect(bakeGeometry(th, null, subject('TH'), 'auto', null, 1, undefined)).toEqual(plain);
    expect(JSON.stringify(bakeWith('TH', th, {}, null))).toBe(JSON.stringify(plain));
  });

  it('keeps the other paths and the bounds as they are with a world', () => {
    const plain = bakeTh();
    const g = bakeWith('TH', th);
    for (const name of PATHS)
      if (name !== 'neighbours') expect(g.paths[name]).toBe(plain.paths[name]);
    expect(g.bounds).toEqual(plain.bounds);
    expect(g.projection).toEqual(plain.projection);
  });

  it('adds land of Thailand, outside the neighbours bbox and none inside it', () => {
    const plain = bakeTh();
    const g = bakeWith('TH', th);
    const added = worldPart(g, plain);
    expect(added.length).toBeGreaterThan(1000);
    const proj = d3Projection(g.projection);
    const [x0, y0, x1, y1] = frameOf();
    const mx = (x1 - x0) * 0.03;
    const my = (y1 - y0) * 0.03;
    let outside = 0;
    for (const p of points(added)) {
      const at = proj.invert?.(p);
      if (!at) continue;
      const [lon, lat] = at;
      const inside = lon > x0 + mx && lon < x1 - mx && lat > y0 + my && lat < y1 - my;
      expect(inside, `vertex ${lon.toFixed(2)}, ${lat.toFixed(2)} inside the frame`).toBe(false);
      if (lon < x0 - 1 || lon > x1 + 1 || lat < y0 - 1 || lat > y1 + 1) outside++;
    }
    expect(outside).toBeGreaterThan(20);
  });

  it('emits the neighbours lines apart: real borders and coasts, none along the clip rectangle', () => {
    for (const id of ['TH', 'PE', 'US-AK', 'US']) {
      const topology = subjectTopology(id);
      for (const withWorld of [world, null]) {
        const g = bakeWith(id, topology, {}, withWorld);
        const lines = g.paths.neighbourLines ?? '';
        expect(lines.length, id).toBeGreaterThan(500);
        expect(lines).not.toMatch(/NaN|Infinity|Z/);
        const proj = d3Projection(g.projection);
        const [x0, y0, x1, y1] = neighboursBox(topology);
        // the path is rounded to 0.1 unit (under 0.01 degree): a point on a side is within 0.02 degree
        const eps = 0.02;
        // A cut shows as a long run along a side (3.3 degrees on TH before the fix). A real coast
        // that reaches the side (Sumatra at lat 4.164, 0.01 degree from it) ends in a short segment
        // that lies within eps of the side too: only a run over 3 % of the box is a cut.
        const long = 0.03 * Math.max(x1 - x0, y1 - y0);
        const along = (a: number[], b: number[], k: 0 | 1, edge: number): boolean =>
          Math.abs(a[k]! - edge) < eps &&
          Math.abs(b[k]! - edge) < eps &&
          Math.abs(a[1 - k]! - b[1 - k]!) > long;
        const onEdge = (a: number[], b: number[]): boolean =>
          along(a, b, 0, x0) || along(a, b, 0, x1) || along(a, b, 1, y0) || along(a, b, 1, y1);
        let segments = 0;
        let inside = 0;
        for (const sub of lines.split(/(?=M)/)) {
          const at = points(sub).map((p) => proj.invert?.(p) as [number, number]);
          for (let i = 1; i < at.length; i++) {
            segments++;
            expect(onEdge(at[i - 1]!, at[i]!), `${id} segment ${i} of ${sub.slice(0, 40)}`).toBe(
              false,
            );
          }
          for (const [lon, lat] of at)
            if (
              lon > x0 + 5 * eps &&
              lon < x1 - 5 * eps &&
              lat > y0 + 5 * eps &&
              lat < y1 - 5 * eps
            )
              inside++;
        }
        expect(segments, id).toBeGreaterThan(100);
        // real borders and coasts, well inside the box
        expect(inside, id).toBeGreaterThan(50);
      }
    }
  });

  it('has no neighbours lines without neighbours', () => {
    expect(bakeWith('TH', th, { showNeighbours: false }).paths.neighbourLines).toBe('');
  });

  it('erases the neighbours bbox of the real files: no far-land vertex inside it, none missing at its edge', () => {
    for (const id of ['TH', 'PE', 'US-AK']) {
      const topology = subjectTopology(id);
      const [x0, y0, x1, y1] = neighboursBox(topology);
      const pieces = farLand(world, [x0, y0, x1, y1]);
      const eps = 1e-6;
      for (const polygon of pieces) {
        for (const [lon, lat] of polygon[0] ?? []) {
          const inside = lon! > x0 + eps && lon! < x1 - eps && lat! > y0 + eps && lat! < y1 - eps;
          expect(inside, `${id} ${lon},${lat}`).toBe(false);
        }
      }
    }
  });

  it('reaches the neighbours bbox with no gap: land on both sides of its south edge, over Malaysia', () => {
    const [, south] = neighboursBox(th);
    expect(south).toBeCloseTo(4.164, 2);
    const pieces = farLand(world, neighboursBox(th));
    const vertices = pieces.flatMap((p) => p.flat());
    const near = (pred: (lat: number) => boolean): boolean =>
      vertices.some(([lon, lat]) => lon! > 100 && lon! < 104 && pred(lat!));
    // far land south of the edge (Peninsular Malaysia) and a vertex right on the edge
    expect(near((lat) => lat < south - 0.5)).toBe(true);
    expect(near((lat) => Math.abs(lat - south) < 1e-9)).toBe(true);
  });

  it('keeps the polygon whole when polygon-clipping throws, and the bake goes on', () => {
    const box = neighboursBox(th);
    const whole = farLand(world, null);
    const pieces = farLand(world, box, () => {
      throw new Error('degenerate ring');
    });
    // every polygon that meets the box is kept unclipped
    expect(pieces.length).toBe(whole.length);
    expect(farLand(world, box).length).toBeGreaterThan(0);
  });

  it('erases the subject own land when it has no neighbours: no far-land vertex inside its bbox', () => {
    const landBox = (topology: Topology): Box4 => {
      const { features } = feature(
        topology,
        topology.objects.land as GeometryCollection,
      ) as unknown as {
        features: { geometry: { coordinates: unknown } | null }[];
      };
      const box: Box4 = [Infinity, Infinity, -Infinity, -Infinity];
      const walk = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === 'number') {
          box[0] = Math.min(box[0], c[0]);
          box[1] = Math.min(box[1], c[1] as number);
          box[2] = Math.max(box[2], c[0]);
          box[3] = Math.max(box[3], c[1] as number);
        } else if (Array.isArray(c)) c.forEach(walk);
      };
      for (const f of features) walk(f.geometry?.coordinates);
      return box;
    };
    for (const id of ['FR-MQ', 'FR-RE', 'US-HI']) {
      const topology = subjectTopology(id);
      expect(topology.objects.neighbours).toBeDefined();
      expect(geometriesLength(topology)).toBe(0);
      const [x0, y0, x1, y1] = landBox(topology);
      const plain = bakeWith(id, topology, {}, null);
      const g = bakeWith(id, topology, {});
      const proj = d3Projection(g.projection);
      const added = worldPart(g, plain);
      expect(added.length, id).toBeGreaterThan(0);
      const eps = 0.002 * Math.max(x1 - x0, y1 - y0);
      for (const p of points(added)) {
        const [lon, lat] = proj.invert?.(p) as [number, number];
        const inside = lon > x0 + eps && lon < x1 - eps && lat > y0 + eps && lat < y1 - eps;
        expect(inside, `${id} ${lon},${lat}`).toBe(false);
      }
    }
  });

  it('bakes with a world when the neighbours object is missing, and when it is empty', () => {
    const island = rectangles([box(10, 10, 11, 11)]);
    delete (island.objects as Record<string, unknown>).neighbours;
    const g = bakeGeometry(island, null, subject('T'), 'auto', null, 1, world);
    expect(g.paths.neighbours).toMatch(/^M/);
    expect(g.paths.neighbourLines).toBe('');
    expect(g.paths.neighbours).not.toMatch(/NaN/);
    const empty = rectangles([box(10, 10, 11, 11)]);
    expect(
      bakeGeometry(empty, null, subject('T'), 'auto', null, 1, world).paths.neighbours,
    ).toMatch(/^M/);
  });

  it('draws the world first, and as clean lines even in rough', () => {
    const rough = bakeWith('TH', th, {}, world, { seed: 3, roughness: 1 });
    const clean = bakeWith('TH', th);
    expect(rough.paths.neighbours).toBe(clean.paths.neighbours);
    expect(rough.paths.neighbours).not.toMatch(/C/);
  });

  it('adds no world land without neighbours', () => {
    const g = bakeWith('TH', th, { showNeighbours: false });
    expect(g.paths.neighbours).toBe('');
    expect(g).toEqual(bakeTh({ showNeighbours: false }));
  });

  it('stays inside the context window: a small island keeps the world land inside the window', () => {
    const big = bakeWith('TH', th);
    const small = bakeWith('FR-MQ', subjectTopology('FR-MQ'));
    const smallPlain = bakeWith('FR-MQ', subjectTopology('FR-MQ'), {}, null);
    expect(small.paths.neighbours.length).toBeGreaterThan(smallPlain.paths.neighbours.length);
    // the window is 8 extents around the selection: no vertex farther than that from it
    const window = (g: MapGeometry): number => {
      const [[a, b], [c, d]] = g.remoteBounds;
      return (8 * Math.max(c - a, d - b)) / 2;
    };
    const check = (g: MapGeometry): void => {
      const [[a, b], [c, d]] = g.remoteBounds;
      const reach = window(g);
      for (const [x, y] of points(g.paths.neighbours)) {
        expect(Math.abs(x - (a + c) / 2)).toBeLessThanOrEqual(reach + 1);
        expect(Math.abs(y - (b + d) / 2)).toBeLessThanOrEqual(reach + 1);
      }
    };
    check(big);
    check(small);
  });

  it('bakes Fiji across the antimeridian: finite paths and no stripe the width of the world', () => {
    const fiji = rectangles([
      box(177.3, -18.3, 178.7, -17.2),
      box(178.3, -17, 179.9, -16.1),
      box(-179.9, -17.1, -179.8, -16.7),
      box(-178.9, -19.2, -178, -18.2),
    ]);
    const plain = bakeGeometry(fiji, null, subject('FJ'), 'auto', null, 1);
    const g = bakeGeometry(fiji, null, subject('FJ'), 'auto', null, 1, world);
    for (const name of PATHS) expect(g.paths[name]).not.toMatch(/NaN|Infinity|undefined|null/);
    const added = worldPart(g, plain);
    expect(added.length).toBeGreaterThan(0);
    // every vertex stays inside the window, so none is the far end of a stripe across the world
    const [[a, b], [c, d]] = g.remoteBounds;
    const reach = (8 * Math.max(c - a, d - b)) / 2;
    for (const [x, y] of points(added)) {
      expect(Math.abs(x - (a + c) / 2)).toBeLessThanOrEqual(reach + 1);
      expect(Math.abs(y - (b + d) / 2)).toBeLessThanOrEqual(reach + 1);
    }
  });

  it('keeps the whole US with rough under 8 M characters with the world', () => {
    const us = subjectTopology('US');
    const usPack = packTopology('US');
    const g = bakeGeometry(us, usPack, subject('US'), 'auto', { seed: 1, roughness: 1 }, 1, world);
    expect(Object.values(g.paths).join('').length).toBeLessThan(8_000_000);
  });
});
