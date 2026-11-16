import { geoArea, geoBounds, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { difference } from 'polygon-clipping';
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
/** Rings whose box is under this many units on both sides stay clean even in rough: no wobble shows there. */
const HAND_MIN_UNITS = 6;
/** Context is drawn within this many selection extents (larger side of its bounds), centred on it. */
const CONTEXT_EXTENTS = 8;

/**
 * The edges of the erased rectangle get a vertex every so many degrees, so that they stay
 * parallels.
 */
const ERASE_STEP_DEG = 1;

/**
 * The far context is simplified this many times coarser than the subject itself (see
 * `simplifyTopology`).
 */
const FAR_FACTOR = 20;

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
function framing(parts: PolygonCoords[]): Framing {
  // a polygon that d3 reads as over a hemisphere is wound the wrong way: it frames nothing
  const sized = parts.map((p) => ({ p, area: geoArea({ type: 'Polygon', coordinates: p }) }));
  const sane = sized.filter(({ area }) => area <= 2 * Math.PI);
  const polygons = sane.map(({ p }) => p);
  const areas = sane.map(({ area }) => area);
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

/** `[west, south, east, north]` of the polygons' points, planar and in the file's longitudes. */
function planarBox(polygons: PolygonCoords[]): Box | null {
  let box: Box | null = null;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0] ?? []) {
      if (x === undefined || y === undefined) continue;
      if (!box) box = [x, y, x, y];
      else
        box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
    }
  }
  return box;
}

/**
 * The rectangle that the build clipped the neighbours to, read from the neighbours themselves: the
 * planar bbox of the subject's `neighbours` object. It is exact on every side that the clip cut,
 * and smaller than the build's frame on an open-sea side, where the fine layer has nothing and the
 * coarse far land may show. Null when there are no neighbours.
 */
const neighboursFrame = (topology: Topology): Box | null =>
  planarBox(polygonsOf(topology, geometriesOf(topology, 'neighbours')));

/**
 * The rectangle the far land must not enter: the neighbours' bbox, else (a subject with no
 * neighbours, such as an island) the bbox of its own land, which then holds the only land of the
 * build's empty clip.
 */
const erasedBox = (topology: Topology): Box | null =>
  neighboursFrame(topology) ?? planarBox(polygonsOf(topology, geometriesOf(topology, 'land')));

/** Slack of the frame edges: two quantization steps of the topology, which rounds its points. */
function frameEps(topology: Topology): number {
  const scale = (topology as { transform?: { scale?: number[] } }).transform?.scale;
  const step = scale ? Math.max(...scale.filter(Number.isFinite)) : NaN;
  return Number.isFinite(step) && step > 0 ? 2 * step : 0.005;
}

/**
 * The lines of `mesh` without the segments that lie along a side of `frame`: the cut that the build
 * made, which is no coast and no border. Runs of kept segments stay one line.
 */
function realLines(lines: number[][][], frame: Box | null, eps: number): number[][][] {
  if (!frame) return lines;
  const on = (a: number[], b: number[], i: 0 | 1, edge: number): boolean =>
    Math.abs((a[i] ?? NaN) - edge) < eps && Math.abs((b[i] ?? NaN) - edge) < eps;
  const cut = (a: number[], b: number[]): boolean =>
    on(a, b, 0, frame[0]) ||
    on(a, b, 0, frame[2]) ||
    on(a, b, 1, frame[1]) ||
    on(a, b, 1, frame[3]);
  const out: number[][][] = [];
  for (const line of lines) {
    let run: number[][] = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as number[];
      const b = line[i] as number[];
      if (cut(a, b)) {
        if (run.length > 1) out.push(run);
        run = [];
      } else {
        if (run.length === 0) run.push(a);
        run.push(b);
      }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/** A ring around the box with a vertex at least every `ERASE_STEP_DEG`. */
function boxRing([west, south, east, north]: Box): [number, number][] {
  const edge = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
    const n = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / ERASE_STEP_DEG),
    );
    return Array.from({ length: n }, (_, i) => [
      x0 + ((x1 - x0) * i) / n,
      y0 + ((y1 - y0) * i) / n,
    ]);
  };
  const ring = [
    ...edge(west, south, east, south),
    ...edge(east, south, east, north),
    ...edge(east, north, west, north),
    ...edge(west, north, west, south),
  ] as [number, number][];
  return [...ring, ring[0] as [number, number]];
}

/**
 * The world land without the rectangle `erase` (planar, in lon/lat): the far context, which starts
 * where the subject's own neighbours stop. Polygons clear of the rectangle are kept as they are.
 * Rings come out clockwise like the topology's (d3's exterior winding).
 */
export function farLand(
  world: Topology,
  erase: Box | null,
  clip: typeof difference = difference,
): PolygonCoords[] {
  const polygons = polygonsOf(world, geometriesOf(world, 'land'));
  if (!erase) return polygons;
  const hole = boxRing(erase);
  const out: PolygonCoords[] = [];
  for (const polygon of polygons) {
    const box = planarBox([polygon]);
    const clear =
      !box || box[2] <= erase[0] || box[0] >= erase[2] || box[3] <= erase[1] || box[1] >= erase[3];
    if (clear) {
      out.push(polygon);
      continue;
    }
    try {
      for (const piece of clip(polygon as [number, number][][], [hole])) {
        out.push(piece.map((ring) => ring.slice().reverse()));
      }
    } catch {
      // polygon-clipping can throw on a degenerate ring: keep the polygon whole, it is drawn under
      // the neighbours, and the map is still baked
      out.push(polygon);
    }
  }
  return out;
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
 * ring of each land or region geometry: a chosen region never vanishes. Rings that the
 * simplification collapsed (no area) or turned inside out go whatever their size.
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
  // topojson-client pads a ring of under four points, so a collapsed ring comes out here with no area
  const areas = new Map<string, number>();
  const areaOf = (ring: number[], interior: boolean): number => {
    const key = `${interior ? 'i' : 'e'}${ringKey(ring)}`;
    let area = areas.get(key);
    if (area === undefined) {
      const f = feature(simplified, { type: 'Polygon', arcs: [ring] } as never) as unknown as {
        geometry: { coordinates: number[][][] };
      };
      const coordinates = f.geometry.coordinates[0] ?? [];
      area = sphericalRingArea(coordinates as never, interior);
      // The simplification can leave a sliver inside out (anticlockwise): d3 reads it as the whole
      // sphere minus a speck, about 4 pi. No ring of a map is over a hemisphere: that one has no area.
      if (!(area <= 2 * Math.PI)) area = 0;
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
    let most = 0;
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
    const area = areaOf(ring, interior);
    const key = ringKey(ring);
    if (!interior && keep.has(key)) return true;
    return area >= (neighbourRings.has(key) ? 9 : 1) * isletArea;
  }) as never) as Topology;
}

const clampDetail = (detail: number): number =>
  Number.isFinite(detail) ? Math.max(0, Math.min(1, detail)) : 1;

/** Rounds the numbers of a path to `digits` decimals. */
const tidy = (d: string, digits: number): string => {
  const f = 10 ** digits;
  return d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * f) / f));
};

let generator: ReturnType<typeof rough.generator> | undefined;
/** roughjs's generator, made when a map first needs it: core is imported everywhere. */
const handDrawn = (): NonNullable<typeof generator> => (generator ??= rough.generator());

/** roughjs treats the seed 0 as "no seed" and then draws at random: map any integer to 1..2^31-1. */
const roughSeed = (seed: number): number => (Math.abs(Math.trunc(seed)) % (2 ** 31 - 1)) + 1;

/** A seeded roughjs line along one subpath `d`. */
function wobble(d: string, seed: number, roughness: number): string {
  const gen = handDrawn();
  const drawable = gen.path(d, {
    seed: roughSeed(seed),
    roughness: Math.max(0, Number.isFinite(roughness) ? roughness : 0),
    bowing: 1,
    // one stroke through the vertices, so the line stays on the edge of the fill
    disableMultiStroke: true,
    preserveVertices: true,
    fill: 'none',
  });
  // a tenth of a unit is 0.04 mm on a 400 mm page: curves carry six numbers per vertex
  return tidy(
    gen
      .toPaths(drawable)
      .map((p) => p.d)
      .join(''),
    1,
  );
}

/** Both sides of the box of a subpath's points are under `HAND_MIN_UNITS`. */
function isSpeck(d: string): boolean {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const spans = [0, 1].map((k) => {
    const v = n.filter((_, i) => i % 2 === k);
    return Math.max(...v) - Math.min(...v);
  });
  return spans.every((span) => span < HAND_MIN_UNITS);
}

/**
 * A seeded roughjs line along `d`: always the same wobble for the same seed. The subpaths that
 * are specks (islets under 0.6 % of the frame) stay as they are: the wobble would not show, and
 * a coast of thousands of islets would cost four times its size.
 */
function hand(d: string, seed: number, roughness: number): string {
  if (d === '') return d;
  return d
    .split(/(?=M)/)
    .map((sub, i) => (isSpeck(sub) ? sub : wobble(sub, seed + i, roughness)))
    .join('');
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
 * - The default frame ignores the remote parts (see `framing`) unless `includeRemote`. The frame
 *   is taken from the full-detail geometry, so the projection and the bounds do not move when
 *   `detail` does.
 * - `detail` (0..1) simplifies the shared topology: tolerance and islet size grow by
 *   2^(6 x (1 - detail)) over the build's; 1 leaves it as it is.
 * - Context (the land around chosen regions, the neighbours, the lakes) is clipped to a window of
 *   8 selection extents around the selection, in unit space: enough for a pan, or a zoom out to
 *   an extreme box, without carrying a whole country at pack precision. The window is built from
 *   the bounds of all the parts of the selection, so that no part of it is ever clipped.
 * - `paths.neighbourLines` holds the coasts and borders of the neighbours alone (the far land has
 *   no lines), without the segments along the frame the build clipped them to: stroke these, and
 *   fill `paths.neighbours` with no stroke.
 * - `world` (optional, the shared coarse world land) is the far context: with `showNeighbours`, its
 *   land beyond the rectangle the build clipped the neighbours to (1.3 x the main bbox of the
 *   subject's own land) is drawn in front of them in `paths.neighbours`, always clean. Without it
 *   the output is what it was before.
 * - `rough` draws the outline and the borders of the chosen regions with roughjs, seeded; the fills
 *   and the context are always clean, and so are the inner borders when no region is chosen (the
 *   outline alone is the hand-drawn line then: all of them would cost over 8 MB for the US).
 */
export function bakeGeometry(
  base: Topology,
  pack: Topology | null,
  subject: MapElement['subject'],
  projection: 'auto' | 'mercator',
  roughStyle: { seed: number; roughness: number } | null,
  detail: number,
  world: Topology | null = null,
): MapGeometry {
  const wanted = new Set(subject.regions);
  const level = clampDetail(detail);
  // a pack without regions is no pack
  const usablePack = pack && geometriesOf(pack, 'regions').some(isAreal) ? pack : null;
  const full: Sources = { base, pack: usablePack };
  // the frame comes from the full-detail geometry, once
  const frame = framingOf(full, wanted);
  let src = full;
  if (level < 1) {
    const factor = 2 ** (6 * (1 - level));
    const extent = extentKm(subject.includeRemote ? frame.allBox : frame.mainBox);
    src = {
      base: simplifyTopology(base, extent, factor),
      pack: usablePack && simplifyTopology(usablePack, extent, factor),
    };
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

  const projected = d3Projection(params);
  // the selection is never clipped, remote parts included: the window holds all of its parts
  const window = unit(all);
  const reach =
    (CONTEXT_EXTENTS * Math.max(window[1][0] - window[0][0], window[1][1] - window[0][1])) / 2;
  if (reach > 0) {
    const cx = (window[0][0] + window[1][0]) / 2;
    const cy = (window[0][1] + window[1][1]) / 2;
    projected.clipExtent([
      [cx - reach, cy - reach],
      [cx + reach, cy + reach],
    ]);
  }
  const path = geoPath(projected).digits(2);
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
  // the borders between regions, each once; `touching` keeps those that touch a chosen region
  const chosenSet = new Set<GeometryObject>(chosenOnes);
  const bordersOf = (touching: boolean | null): string =>
    draw(
      mesh(regionsTopo, collection(regions), (a, b) => {
        if (a === b) return false;
        return touching === null || (chosenSet.has(a) || chosenSet.has(b)) === touching;
      }),
    );
  let borders = '';
  if (subject.showRegions && regions.length > 0) {
    if (!roughStyle) borders = bordersOf(null);
    else if (chosenSet.size === 0) {
      // the whole subject is the selection, but its inner borders alone would be a country of lines
      borders = bordersOf(null);
    } else {
      borders = bordersOf(false) + hand(bordersOf(true), roughStyle.seed + 1, roughStyle.roughness);
    }
  }
  if (roughStyle) outline = hand(outline, roughStyle.seed, roughStyle.roughness);
  const layer = (show: boolean, name: string): string => {
    const object = src.base.objects[name];
    return show && object ? draw(feature(src.base, object)) : '';
  };

  // the neighbours' coasts and borders, apart from their fill: without the build's clip rectangle
  // (its sides are those of the neighbours' bbox, within two quantization steps; the window's own
  // edges cut a line short, they never add a segment to it)
  let neighbourLines = '';
  const neighboursObject = src.base.objects.neighbours;
  if (subject.showNeighbours && neighboursObject) {
    const lines = (mesh(src.base, neighboursObject) as unknown as { coordinates: number[][][] })
      .coordinates;
    const kept = realLines(lines, neighboursFrame(base), frameEps(base));
    // a tenth of a unit is 0.04 mm on a 400 mm page: lines need no more, and they cost a second
    // path
    const lineString = geoPath(projected).digits(1);
    neighbourLines =
      kept.length > 0 ? (lineString({ type: 'MultiLineString', coordinates: kept }) ?? '') : '';
  }

  // the far context, first: the coarse world land beyond the frame the neighbours were clipped to
  let far = '';
  if (world && subject.showNeighbours) {
    const coarse = simplifyTopology(world, extentKm(framed), FAR_FACTOR);
    const pieces = farLand(coarse, erasedBox(base));
    far = pieces.length > 0 ? draw(multi(pieces)) : '';
  }

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
      neighbours: far + layer(subject.showNeighbours, 'neighbours'),
      neighbourLines,
      lakes: layer(subject.showLakes, 'lakes'),
    },
  };
}
