import { geoArea, geoBounds, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import rough from 'roughjs';
import { feature, merge, mesh } from 'topojson-client';
import {
  filter,
  presimplify,
  simplify,
  sphericalRingArea,
  sphericalTriangleArea,
} from 'topojson-simplify';
import type {
  GeometryCollection,
  GeometryObject,
  MultiPolygon,
  Objects,
  Polygon,
  Topology as TopoJson,
} from 'topojson-specification';
import {
  chooseProjection,
  d3Projection,
  type Bounds,
  type MapGeometry,
  type ProjectionParams,
} from './projection';
import type { MapElement } from './types';

/** A TopoJSON topology, as the `topojson-*` functions take it (properties are not typed). */
export type Topology = TopoJson<Objects>;
type Areal = Polygon | MultiPolygon;

/** A polygon as GeoJSON has it: its rings, the first being the exterior. */
type PolygonCoords = number[][][];
/** `[west, south, east, north]` in degrees; `west > east` when it crosses the antimeridian. */
type Box = [number, number, number, number];

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEG = 111.32;
const KM_PER_DEG_LAT = 110.57;

/** Parts under this share of the total area may be remote. */
const REMOTE_SHARE = 0.01;
/** The remote rule applies only when the parts over `REMOTE_SHARE` hold this share of the area. */
const MAIN_COVERAGE = 0.5;
/** The side of the unit plane: the larger side of a subject's bounds. */
const UNITS = 1000;

const wrapDelta = (d: number): number => Math.abs(((((d + 180) % 360) + 360) % 360) - 180);

const multi = (polygons: PolygonCoords[]): GeoPermissibleObjects => ({
  type: 'MultiPolygon',
  coordinates: polygons,
});

const geometriesOf = (topology: Topology, name: string): GeometryObject[] => {
  const object = topology.objects[name];
  return object?.type === 'GeometryCollection' ? object.geometries : [];
};

const collection = (geometries: GeometryObject[]): GeometryCollection => ({
  type: 'GeometryCollection',
  geometries,
});

const isAreal = (g: GeometryObject): g is Areal =>
  g.type === 'Polygon' || g.type === 'MultiPolygon';

const idOf = (g: GeometryObject): string | undefined => {
  const id = (g.properties as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};

/** The polygons of the geometries, as GeoJSON coordinates (in degrees). */
function polygonsOf(topology: Topology, geometries: GeometryObject[]): PolygonCoords[] {
  const { features } = feature(topology, collection(geometries)) as unknown as {
    features: { geometry: { type: string; coordinates: unknown } | null }[];
  };
  const out: PolygonCoords[] = [];
  for (const { geometry } of features) {
    if (geometry?.type === 'Polygon') out.push(geometry.coordinates as PolygonCoords);
    else if (geometry?.type === 'MultiPolygon')
      out.push(...(geometry.coordinates as PolygonCoords[]));
  }
  return out;
}

function boxOf(polygons: PolygonCoords[]): Box | null {
  if (polygons.length === 0) return null;
  const [[west, south], [east, north]] = geoBounds(multi(polygons));
  return [west, south, east, north].every(Number.isFinite) ? [west, south, east, north] : null;
}

const lonCentreHalf = ([west, , east]: Box): [number, number] => {
  const span = east >= west ? east - west : east - west + 360;
  return [west + span / 2, span / 2];
};

/** Larger extent of a box, in km: the unit that the simplification tolerance is stated in. */
function extentKm(box: Box | null): number {
  if (!box) return 0;
  const [, south, , north] = box;
  const mid = (((south + north) / 2) * Math.PI) / 180;
  return Math.max(
    lonCentreHalf(box)[1] * 2 * KM_PER_DEG * Math.cos(mid),
    (north - south) * KM_PER_DEG_LAT,
  );
}

/** Distance in km between two boxes (0 when they meet); an estimate, good for a rule of thumb. */
function gapKm(a: Box, b: Box): number {
  const [ac, ah] = lonCentreHalf(a);
  const [bc, bh] = lonCentreHalf(b);
  const dLon = Math.max(0, wrapDelta(bc - ac) - (ah + bh));
  const dLat = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  const mid = (((a[1] + a[3] + b[1] + b[3]) / 4) * Math.PI) / 180;
  return Math.hypot(dLon * KM_PER_DEG * Math.cos(mid), dLat * KM_PER_DEG_LAT);
}

interface Framing {
  /** The main parts: those that frame the subject by default. */
  main: PolygonCoords[];
  all: PolygonCoords[];
  mainBox: Box | null;
  allBox: Box | null;
}

/**
 * The parts of a subject that frame it. Remote parts are left out of `main`: those under 1 % of
 * the total area that lie farther than one subject-width (the larger extent of the parts over 1 %)
 * from the bbox of the parts over 1 %. When those parts are under half of the area (an archipelago
 * of islets), nothing is remote.
 */
function framing(polygons: PolygonCoords[]): Framing {
  const areas = polygons.map((p) => geoArea({ type: 'Polygon', coordinates: p }));
  const total = areas.reduce((a, b) => a + b, 0);
  const big = polygons.filter((_, i) => (areas[i] ?? 0) >= total * REMOTE_SHARE);
  const bigArea = areas.filter((a) => a >= total * REMOTE_SHARE).reduce((a, b) => a + b, 0);
  const bigBox = boxOf(big);
  let main = polygons;
  if (bigBox && bigArea >= total * MAIN_COVERAGE) {
    const width = extentKm(bigBox);
    main = polygons.filter((p, i) => {
      if ((areas[i] ?? 0) >= total * REMOTE_SHARE) return true;
      const box = boxOf([p]);
      return !box || gapKm(bigBox, box) <= width;
    });
  }
  return { main, all: polygons, mainBox: boxOf(main), allBox: boxOf(polygons) };
}

interface Sources {
  base: Topology;
  pack: Topology | null;
}

/** Where the regions come from: the fine pack when there is one. */
const regionsTopology = (src: Sources): Topology => src.pack ?? src.base;

const regionsOf = (src: Sources): Areal[] =>
  geometriesOf(regionsTopology(src), 'regions').filter(isAreal);

const chosenRegions = (src: Sources, wanted: Set<string>): Areal[] =>
  regionsOf(src).filter((g) => {
    const id = idOf(g);
    return id !== undefined && wanted.has(id);
  });

/** The parts that the subject's frame is made of: the chosen regions, else the whole land. */
function framingOf(src: Sources, wanted: Set<string>): Framing {
  const chosen = chosenRegions(src, wanted);
  if (chosen.length > 0) return framing(polygonsOf(regionsTopology(src), chosen));
  const regions = src.pack ? regionsOf(src) : [];
  if (src.pack && regions.length > 0) return framing(polygonsOf(src.pack, regions));
  return framing(polygonsOf(src.base, geometriesOf(src.base, 'land')));
}

const ringKey = (ring: number[]): string => ring.join(',');

/**
 * The topology with the points under a tolerance removed and the islets that it would leave
 * dropped, on shared arcs, so the border of two regions stays one line. The tolerance is the
 * build's (0.05 mm on a 400 mm page, for a subject of `extentKm`) times `factor`: points whose
 * triangle with their neighbours (Visvalingam) is under tolerance squared go. Rings under the
 * build's islet size (0.3 mm on the page) times `factor` go too, holes included, except the largest
 * ring of each land or region geometry: a chosen region never vanishes.
 */
export function simplifyTopology(topology: Topology, extentKm: number, factor: number): Topology {
  if (!(extentKm > 0) || !(factor > 0)) return topology;
  const tolerance = (0.125 * extentKm * factor) / (EARTH_RADIUS_KM * 1000);
  const simplified = simplify(
    presimplify(topology, sphericalTriangleArea),
    tolerance * tolerance,
  ) as Topology;
  const isletKm = (0.75 * extentKm * factor) / 1000;
  const isletArea = (isletKm / EARTH_RADIUS_KM) ** 2;

  const rings = (object: GeometryObject | undefined): number[][][] => {
    const out: number[][][] = [];
    const walk = (g: GeometryObject): void => {
      if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
      else if (g.type === 'Polygon') out.push(g.arcs);
      else if (g.type === 'MultiPolygon') out.push(...g.arcs);
    };
    if (object) walk(object);
    return out;
  };
  const areas = new Map<string, number>();
  const areaOf = (ring: number[], interior: boolean): number => {
    const key = `${interior ? 'i' : 'e'}${ringKey(ring)}`;
    let area = areas.get(key);
    if (area === undefined) {
      const f = feature(simplified, { type: 'Polygon', arcs: [ring] } as never) as unknown as {
        geometry: { coordinates: number[][][] };
      };
      area = sphericalRingArea((f.geometry.coordinates[0] ?? []) as never, interior);
      areas.set(key, area);
    }
    return area;
  };
  const keep = new Set<string>();
  const walkLargest = (g: GeometryObject): void => {
    if (g.type === 'GeometryCollection') {
      g.geometries.forEach(walkLargest);
      return;
    }
    const polygons = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    let best: number[] | undefined;
    let most = -1;
    for (const [exterior] of polygons) {
      if (!exterior) continue;
      const area = areaOf(exterior, false);
      if (area > most) [best, most] = [exterior, area];
    }
    if (best) keep.add(ringKey(best));
  };
  for (const name of ['land', 'regions']) {
    const object = simplified.objects[name];
    if (object) walkLargest(object);
  }
  // the neighbours are a context layer: their islets are dropped nine times larger, as in the build
  const neighbourRings = new Set(rings(simplified.objects.neighbours).flat().map(ringKey));

  return filter(simplified, ((ring: number[], interior: boolean) => {
    const key = ringKey(ring);
    if (!interior && keep.has(key)) return true;
    return areaOf(ring, interior) >= (neighbourRings.has(key) ? 9 : 1) * isletArea;
  }) as never) as Topology;
}

const clampDetail = (detail: number): number =>
  Number.isFinite(detail) ? Math.max(0, Math.min(1, detail)) : 1;

const tidy = (d: string): string =>
  d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));

const handDrawn = rough.generator();

/** roughjs treats the seed 0 as "no seed" and then draws at random: map any integer to 1..2^31-1. */
const roughSeed = (seed: number): number => (Math.abs(Math.trunc(seed)) % (2 ** 31 - 1)) + 1;

/** A seeded roughjs line along `d`: always the same wobble for the same seed. */
function hand(d: string, seed: number, roughness: number): string {
  if (d === '') return d;
  const drawable = handDrawn.path(d, {
    seed: roughSeed(seed),
    roughness: Math.max(0, Number.isFinite(roughness) ? roughness : 0),
    bowing: 1,
    // one stroke through the vertices, so the line stays on the edge of the fill
    disableMultiStroke: true,
    preserveVertices: true,
    fill: 'none',
  });
  return tidy(
    handDrawn
      .toPaths(drawable)
      .map((p) => p.d)
      .join(''),
  );
}

const EMPTY_BOUNDS: Bounds = [
  [0, 0],
  [0, 0],
];

/**
 * Bakes a subject into paths on the projected plane: land, the outline of the subject (or of its
 * chosen regions), the borders between regions, the chosen regions, the neighbours and the lakes.
 *
 * - `base` is the subject's bundled TopoJSON; `pack` its fine pack, when there is one. With a
 *   pack the regions, the land and the outline come from it, so that the borders of the regions
 *   meet exactly; the neighbours and lakes always come from the base.
 * - `subject.regions` selects regions by id (ids that do not exist are ignored); the frame then is
 *   the union of the chosen regions and the rest of the land is context. `showRegions`,
 *   `showNeighbours` and `showLakes` leave their layer out (an empty path).
 * - The default frame ignores the remote parts (see `framing`) unless `includeRemote`.
 * - `detail` (0..1) simplifies the shared topology: tolerance and islet size grow by
 *   2^(6 x (1 - detail)) over the build's; 1 leaves it as it is.
 * - `rough` draws the outline and the region borders with roughjs, seeded; the fills are clean.
 */
export function bakeGeometry(
  base: Topology,
  pack: Topology | null,
  subject: MapElement['subject'],
  projection: 'auto' | 'mercator',
  roughStyle: { seed: number; roughness: number } | null,
  detail: number,
): MapGeometry {
  const wanted = new Set(subject.regions);
  const level = clampDetail(detail);
  // a pack without regions is no pack
  const usablePack = pack && geometriesOf(pack, 'regions').some(isAreal) ? pack : null;
  let src: Sources = { base, pack: usablePack };
  let frame = framingOf(src, wanted);
  if (level < 1) {
    const factor = 2 ** (6 * (1 - level));
    const extent = extentKm(frame.mainBox);
    src = {
      base: simplifyTopology(base, extent, factor),
      pack: usablePack && simplifyTopology(usablePack, extent, factor),
    };
    frame = framingOf(src, wanted);
  }

  // the projection is chosen for the frame, then scaled so that the default frame is 1000 units
  const framed = (subject.includeRemote ? frame.allBox : frame.mainBox) ?? [0, 0, 0, 0];
  const radians = extentKm(framed) / EARTH_RADIUS_KM;
  const scale0 = radians > 0 ? UNITS / radians : UNITS;
  const chosen = chooseProjection(framed, projection);
  const probe = geoPath(d3Projection({ ...chosen, k: scale0, tx: 0, ty: 0 }));
  const measure = (polygons: PolygonCoords[]): Bounds | null => {
    if (polygons.length === 0) return null;
    const b = probe.bounds(multi(polygons));
    return b.flat().every(Number.isFinite) ? b : null;
  };
  const main = measure(frame.main);
  const all = measure(frame.all) ?? main;
  const side = main ? Math.max(main[1][0] - main[0][0], main[1][1] - main[0][1]) : 0;
  const r = side > 0 ? UNITS / side : 1;
  const [x0, y0] = main?.[0] ?? [0, 0];
  const params: ProjectionParams = {
    ...chosen,
    k: scale0 * r,
    tx: -r * x0,
    ty: -r * y0,
  };
  const unit = (b: Bounds | null): Bounds =>
    b
      ? [
          [(b[0][0] - x0) * r, (b[0][1] - y0) * r],
          [(b[1][0] - x0) * r, (b[1][1] - y0) * r],
        ]
      : EMPTY_BOUNDS;

  const path = geoPath(d3Projection(params)).digits(2);
  const draw = (object: unknown): string => path(object as GeoPermissibleObjects) ?? '';

  const regionsTopo = regionsTopology(src);
  const regions = regionsOf(src);
  const chosenOnes = chosenRegions(src, wanted);
  const baseLand = src.base.objects.land;
  // with a pack, the land is the union of its regions: the coast then is the pack's, like the borders
  const landObject: GeometryObject | undefined = src.pack ? collection(regions) : baseLand;
  const edgeOf = (object: GeometryObject | undefined): string =>
    object ? draw(mesh(regionsTopo, object, (a, b) => a === b)) : '';

  const land = !landObject
    ? ''
    : src.pack
      ? draw(merge(src.pack, regions))
      : draw(feature(src.base, landObject));
  // the outer boundary of the chosen regions, else of the whole land
  let outline = edgeOf(chosenOnes.length > 0 ? collection(chosenOnes) : landObject);
  let borders =
    subject.showRegions && regions.length > 0
      ? draw(mesh(regionsTopo, collection(regions), (a, b) => a !== b))
      : '';
  if (roughStyle) {
    outline = hand(outline, roughStyle.seed, roughStyle.roughness);
    borders = hand(borders, roughStyle.seed + 1, roughStyle.roughness);
  }
  const layer = (show: boolean, name: string): string => {
    const object = src.base.objects[name];
    return show && object ? draw(feature(src.base, object)) : '';
  };

  return {
    version: 1,
    projection: params,
    bounds: unit(main),
    remoteBounds: unit(all),
    paths: {
      land,
      outline,
      regions: borders,
      selected: chosenOnes.length > 0 ? draw(merge(regionsTopo, chosenOnes)) : '',
      neighbours: layer(subject.showNeighbours, 'neighbours'),
      lakes: layer(subject.showLakes, 'lakes'),
    },
  };
}
