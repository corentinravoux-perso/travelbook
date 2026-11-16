/**
 * Geometry helpers and the mapshaper wrapper that turns the raw Overture polygons of one subject
 * into its quantized TopoJSON. Pure apart from `buildTopology`, which runs mapshaper in memory.
 */
import mapshaper from 'mapshaper';

export type Bbox = [number, number, number, number];

export interface Feature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: Geometry;
}
export type Geometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };
export interface Collection {
  type: 'FeatureCollection';
  features: Feature[];
}

const KM_PER_DEG = 111.32;
const QUANTIZATION = 100_000;

/** Largest extent (km) of a lon/lat bbox, the unit the tolerance rule is stated in. */
export function extentKm([x0, y0, x1, y1]: Bbox): number {
  const mid = (((y0 + y1) / 2) * Math.PI) / 180;
  return Math.max((x1 - x0) * KM_PER_DEG * Math.cos(mid), (y1 - y0) * 110.57);
}

/**
 * Douglas-Peucker tolerance in metres: 0.05 mm on paper when the subject's larger extent fills a
 * 400 mm page, so 0.05 x extentKm x 1000 / 400.
 */
export function toleranceMetres(extent: number): number {
  return (0.05 * extent * 1000) / 400;
}

/** Ground size (m) of 0.3 mm on paper at the same scale. */
const smallMetres = (extent: number): number => (0.3 * extent * 1000) / 400;

/** Islets and holes smaller than (0.3 mm on paper)^2 are dropped, in km2. */
export function minAreaKm2(extent: number): number {
  return (smallMetres(extent) / 1000) ** 2;
}

/** Planar area of a ring in km2, longitudes scaled by cos(latitude): enough to rank small rings. */
export function ringAreaKm2(ring: number[][]): number {
  let sum = 0;
  let lat = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0 = 0, y0 = 0] = ring[i] ?? [];
    const [x1 = 0, y1 = 0] = ring[i + 1] ?? [];
    sum += x0 * y1 - x1 * y0;
    lat += y0;
  }
  const cos = Math.cos(((lat / Math.max(1, ring.length - 1)) * Math.PI) / 180);
  return Math.abs(sum / 2) * KM_PER_DEG * 110.57 * cos;
}

export function polygonsOf(geometry: Geometry): number[][][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

export function bboxOfPolygons(polygons: number[][][][]): Bbox {
  const box: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const [x = 0, y = 0] of polygon[0] ?? []) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return box;
}

export const bboxOf = (feature: Feature): Bbox => bboxOfPolygons(polygonsOf(feature.geometry));

/**
 * Bbox of the main landmass: the polygons holding at least 1 % of the total area. Keeps Hawaii,
 * the Aleutians or the Chatham Islands from stretching the frame (and the tolerance) of a country.
 */
export function mainBbox(feature: Feature): Bbox {
  const polygons = polygonsOf(feature.geometry);
  const areas = polygons.map((polygon) => ringAreaKm2(polygon[0] ?? []));
  const total = areas.reduce((a, b) => a + b, 0);
  const main = polygons.filter((_, i) => (areas[i] ?? 0) >= total * 0.01);
  return bboxOfPolygons(main.length > 0 ? main : polygons);
}

/** The bbox grown by `factor` around its centre. */
export function scaleBbox([x0, y0, x1, y1]: Bbox, factor: number): Bbox {
  const dx = ((x1 - x0) * (factor - 1)) / 2;
  const dy = ((y1 - y0) * (factor - 1)) / 2;
  return [
    Math.max(-180, x0 - dx),
    Math.max(-90, y0 - dy),
    Math.min(180, x1 + dx),
    Math.min(90, y1 + dy),
  ];
}

export const bboxesOverlap = (a: Bbox, b: Bbox): boolean =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Drop the interior rings (holes) smaller than `minKm2`; exteriors are left to mapshaper. */
export function dropSmallHoles(feature: Feature, minKm2: number): Feature {
  const clean = (polygon: number[][][]): number[][][] => [
    ...polygon.slice(0, 1),
    ...polygon.slice(1).filter((ring) => ringAreaKm2(ring) >= minKm2),
  ];
  const geometry: Geometry =
    feature.geometry.type === 'Polygon'
      ? { type: 'Polygon', coordinates: clean(feature.geometry.coordinates) }
      : { type: 'MultiPolygon', coordinates: feature.geometry.coordinates.map(clean) };
  return { ...feature, geometry };
}

const collection = (features: Feature[]): string =>
  JSON.stringify({ type: 'FeatureCollection', features } satisfies Collection);

export interface TopologyInput {
  land: Feature;
  regions: Feature[];
  neighbours: Feature[];
  lakes: Feature[];
  /** Larger extent of the subject, km (decides the tolerance). */
  extent: number;
  /** Frame the neighbours are clipped to (1.3 x the main bbox). */
  frame: Bbox;
}

interface TopoObject {
  type: 'GeometryCollection';
  geometries: unknown[];
}
export interface Topology {
  type: 'Topology';
  objects: Record<string, TopoObject>;
  [key: string]: unknown;
}

const OBJECTS = ['land', 'regions', 'neighbours', 'lakes'] as const;

/**
 * One subject as quantized TopoJSON with the objects `land`, `regions`, `neighbours` and `lakes`
 * (always present, possibly empty). Neighbours are simplified three times coarser than the rest.
 */
export async function buildTopology(input: TopologyInput): Promise<Topology> {
  const tolerance = toleranceMetres(input.extent);
  const minArea = minAreaKm2(input.extent);
  const holes = (feature: Feature): Feature => dropSmallHoles(feature, minArea);
  const layers: Record<string, Feature[]> = {
    land: [holes(input.land)],
    regions: input.regions.map(holes),
    neighbours: input.neighbours.map(holes),
    lakes: input.lakes.map(holes),
  };
  const present = OBJECTS.filter((name) => (layers[name] ?? []).length > 0);
  const files: Record<string, string> = {};
  for (const name of present) files[`${name}.json`] = collection(layers[name] ?? []);
  const [x0, y0, x1, y1] = input.frame;
  const commands: string[] = [`-i ${present.map((n) => `${n}.json`).join(' ')} combine-files`];
  if (present.includes('neighbours')) {
    commands.push(
      `-clip bbox=${x0},${y0},${x1},${y1} target=neighbours`,
      `-simplify dp interval=${tolerance * 3}m keep-shapes target=neighbours`,
      `-filter-islands min-area=${minArea * 9}km2 remove-empty target=neighbours`,
    );
  }
  if (present.includes('lakes')) commands.push('-clip land target=lakes');
  commands.push(
    `-simplify dp interval=${tolerance}m keep-shapes target=land,regions${present.includes('lakes') ? ',lakes' : ''}`,
    `-filter-islands min-area=${minArea}km2 remove-empty target=land,regions${present.includes('lakes') ? ',lakes' : ''}`,
    `-o target=* format=topojson quantization=${QUANTIZATION} out.topo.json`,
  );
  const out = await mapshaper.applyCommands(commands.join(' '), files);
  const topology = JSON.parse(String(out['out.topo.json'])) as Topology;
  const objects: Record<string, TopoObject> = {};
  for (const name of OBJECTS) {
    objects[name] = topology.objects[name] ?? { type: 'GeometryCollection', geometries: [] };
  }
  return { ...topology, objects };
}
