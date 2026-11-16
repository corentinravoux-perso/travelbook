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

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Spherical area of a ring in km2 (Chamberlain-Duquette). Each longitude step is wrapped to
 * [-180, 180], so a ring that crosses the antimeridian is measured like any other, and the area
 * of a large ring (Alaska) does not depend on one average latitude.
 */
export function ringAreaKm2(ring: number[][]): number {
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0 = 0, y0 = 0] = ring[i] ?? [];
    const [x1 = 0, y1 = 0] = ring[i + 1] ?? [];
    let dx = x1 - x0;
    if (dx > 180) dx -= 360;
    else if (dx < -180) dx += 360;
    sum += dx * rad * (2 + Math.sin(y0 * rad) + Math.sin(y1 * rad));
  }
  return Math.abs((sum * EARTH_RADIUS_KM ** 2) / 2);
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

/** Share of the country polygon's area that a division level must cover to replace it. */
export const COVERAGE_MIN = 0.98;

const polygonAreaKm2 = (polygon: number[][][]): number =>
  polygon.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * ringAreaKm2(ring), 0);

/** Area of a feature in km2, holes removed. */
export const featureAreaKm2 = (feature: Feature): number =>
  polygonsOf(feature.geometry).reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0);

/** Area of the features (holes removed) over the area of `land`; ~ the union's coverage. */
export function coverage(land: Feature, features: Feature[]): number {
  const total = featureAreaKm2(land);
  return total > 0 ? features.reduce((s, f) => s + featureAreaKm2(f), 0) / total : 0;
}

/** Summed area of the regions may exceed the area of their union by this share (border noise). */
export const OVERLAP_TOLERANCE = 0.002;
/** A region at least this much covered by the other regions is a parent (or a duplicate). */
export const PARENT_COVERED_MIN = 0.9;

export interface DroppedRegion {
  id: string;
  name: string;
  /** Share of the region's area that lay under the other regions when it was dropped. */
  covered: number;
  areaKm2: number;
}

export interface OverlapResult {
  kept: Feature[];
  dropped: DroppedRegion[];
  /** Summed area of the regions over the area of their union, before and after. */
  ratio: number;
  ratioAfter: number;
}

/** Areas of the regions, of their union, and of the part of each that lies under another one. */
async function overlapOf(
  regions: Feature[],
): Promise<{ union: number; own: number[]; covered: number[] }> {
  const own = regions.map(featureAreaKm2);
  if (regions.length < 2) return { union: own[0] ?? 0, own, covered: own.map(() => 0) };
  const input = collection(regions.map((r, i) => ({ ...r, properties: { i } })));
  const out = await mapshaper.applyCommands(
    '-i regions.json -mosaic calc="ids=collect(i)" -o format=geojson tiles.json',
    { 'regions.json': input },
  );
  const tiles = (JSON.parse(String(out['tiles.json'])) as Collection).features;
  const covered = regions.map(() => 0);
  let union = 0;
  for (const tile of tiles) {
    const area = featureAreaKm2(tile);
    const ids = (tile.properties.ids ?? []) as number[];
    union += area;
    if (ids.length < 2) continue;
    for (const i of ids) covered[i] = (covered[i] ?? 0) + area;
  }
  return { union, own, covered };
}

/**
 * Overlapping regions are drawn twice: Alaska's "Unorganized Borough" holds "Prince of Wales-Hyder",
 * so the two sum to more than the land they cover. When the regions' summed area exceeds the area
 * of their union by more than `OVERLAP_TOLERANCE`, drop the region that is at least
 * `PARENT_COVERED_MIN` covered by the others, the largest first (a parent that its children tile
 * goes before the children, which the parent covers too), and measure again, until the summed
 * area is back within tolerance or no such region is left. A clean tiling is returned as it is.
 */
export async function dropCoveredRegions(regions: Feature[]): Promise<OverlapResult> {
  let kept = regions;
  const dropped: DroppedRegion[] = [];
  let measured = await overlapOf(kept);
  const ratioOf = (m: typeof measured): number =>
    m.union > 0 ? m.own.reduce((a, b) => a + b, 0) / m.union : 1;
  const ratio = ratioOf(measured);
  while (ratioOf(measured) > 1 + OVERLAP_TOLERANCE) {
    const m = measured;
    const candidates = kept
      .map((region, i) => ({
        region,
        i,
        area: m.own[i] ?? 0,
        share: (m.covered[i] ?? 0) / (m.own[i] || 1),
      }))
      .filter((c) => c.share >= PARENT_COVERED_MIN)
      .sort(
        (a, b) =>
          b.area - a.area ||
          String(a.region.properties.id).localeCompare(String(b.region.properties.id)),
      );
    const parent = candidates[0];
    if (!parent) break;
    dropped.push({
      id: String(parent.region.properties.id),
      name: String(parent.region.properties.name),
      covered: parent.share,
      areaKm2: parent.area,
    });
    kept = kept.filter((_, i) => i !== parent.i);
    measured = await overlapOf(kept);
  }
  return { kept, dropped, ratio, ratioAfter: ratioOf(measured) };
}

/**
 * The first level, in the order given, whose features cover at least 98 % of the country or
 * dependency polygon (callers pass region, county, locality): Overture's polygon of a country is
 * sometimes far coarser than its divisions.
 * `null` when no level qualifies (the caller keeps the country polygon).
 */
export async function pickLandLevel<L extends string>(
  land: Feature,
  levels: { name: L; load: () => Promise<Feature[]> }[],
): Promise<{ name: L; features: Feature[] } | null> {
  for (const level of levels) {
    const features = await level.load();
    if (features.length > 0 && coverage(land, features) >= COVERAGE_MIN) {
      return { name: level.name, features };
    }
  }
  return null;
}

/** One polygon feature holding every polygon of the features, for bbox and extent maths. */
export function mergeGeometry(features: Feature[]): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: features.flatMap((f) => polygonsOf(f.geometry)),
    },
  };
}

export interface TopologyInput {
  /** The country polygon, or (when `dissolve`) the polygons to be dissolved into the land. */
  land: Feature | Feature[];
  /** `land` is a set of divisions: dissolve it into one feature before simplifying. */
  dissolve?: boolean;
  /** The dissolved land is the regions layer itself, so the two share their edges. */
  landIsRegions?: boolean;
  landProperties: { id: string; name: string };
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
  const landFeatures = Array.isArray(input.land) ? input.land : [input.land];
  const sharedLand = input.dissolve === true && input.landIsRegions === true;
  const layers: Record<string, Feature[]> = {
    land: sharedLand ? [] : landFeatures.map(holes),
    regions: input.regions.map(holes),
    neighbours: input.neighbours.map(holes),
    lakes: input.lakes.map(holes),
  };
  const present = OBJECTS.filter((name) => (layers[name] ?? []).length > 0);
  if (sharedLand && !present.includes('regions')) throw new Error('landIsRegions without regions');
  const files: Record<string, string> = {};
  for (const name of present) files[`${name}.json`] = collection(layers[name] ?? []);
  const [x0, y0, x1, y1] = input.frame;
  const commands: string[] = [`-i ${present.map((n) => `${n}.json`).join(' ')} combine-files`];
  if (sharedLand) commands.push('-dissolve + name=land target=regions');
  else if (input.dissolve) commands.push('-dissolve target=land');
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
  const geometries = objects.land?.geometries as { properties?: unknown }[] | undefined;
  const landGeometry = geometries?.[0];
  if (landGeometry) landGeometry.properties = input.landProperties;
  return { ...topology, objects };
}

/** How the regions of a pack share their borders (see `buildPack`). */
export type PackMode = 'per-region' | 'finest';

/** TopoJSON quantization that resolves `metres` over the larger side (degrees) of `box`. */
export function quantizationFor(box: Bbox, metres: number): number {
  const span = Math.max(box[2] - box[0], box[3] - box[1], 1e-6);
  return Math.min(1e9, Math.max(QUANTIZATION, Math.ceil((span * 111_320) / metres)));
}

const regionExtent = (feature: Feature): number => extentKm(mainBbox(feature));

/**
 * The fine pack of one country: one TopoJSON whose only object `regions` holds every region.
 *
 * A province is drawn on a page of its own size, so it deserves the tolerance of its own extent
 * (`toleranceMetres(extent)`, islets and holes under `minAreaKm2(extent)` dropped).
 *
 * - `finest` (default): one mapshaper dataset simplified at the finest tolerance of the set. Every
 *   region is at least as fine as its own tolerance asks, and the border of two neighbours stays
 *   one shared arc, so they meet exactly. The file is as large as the smallest region allows:
 *   measured at 1.0 to 1.8 x the `per-region` size on the dev countries.
 * - `per-region`: every region is simplified and cleaned alone at its own tolerance, then the
 *   results are merged. Smaller for a country of very unequal regions, but the shared border of two
 *   neighbours is simplified twice, differently: it becomes many short arcs and may show slivers.
 */
export async function buildPack(regions: Feature[], mode: PackMode = 'finest'): Promise<Topology> {
  if (regions.length === 0) throw new Error('a pack needs at least one region');
  const extents = regions.map(regionExtent);
  const tolerances = extents.map(toleranceMetres);
  const finest = Math.min(...tolerances);
  let union: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const region of regions) {
    const [a, b, c, d] = bboxOf(region);
    union = [
      Math.min(union[0], a),
      Math.min(union[1], b),
      Math.max(union[2], c),
      Math.max(union[3], d),
    ];
  }
  const quantization = quantizationFor(union, Math.max(finest / 2, 0.5));
  const toTopology = async (files: Record<string, string>, commands: string): Promise<Topology> => {
    const out = await mapshaper.applyCommands(commands, files);
    return JSON.parse(String(out['out.topo.json'])) as Topology;
  };
  let topology: Topology;
  if (mode === 'finest') {
    const minArea = Math.min(...extents.map(minAreaKm2));
    const features = regions.map((r) => dropSmallHoles(r, minArea));
    topology = await toTopology(
      { 'regions.json': collection(features) },
      `-i regions.json -simplify dp interval=${finest}m keep-shapes ` +
        `-filter-islands min-area=${minArea}km2 remove-empty ` +
        `-o format=topojson quantization=${quantization} target=* out.topo.json`,
    );
  } else {
    const parts: Record<string, string> = {};
    for (const [i, region] of regions.entries()) {
      const extent = extents[i] ?? 0;
      const minArea = minAreaKm2(extent);
      const out = await mapshaper.applyCommands(
        `-i in.json -simplify dp interval=${toleranceMetres(extent)}m keep-shapes ` +
          `-filter-islands min-area=${minArea}km2 remove-empty -o format=geojson out.json`,
        { 'in.json': collection([dropSmallHoles(region, minArea)]) },
      );
      parts[`r${i}.json`] = String(out['out.json']);
    }
    topology = await toTopology(
      parts,
      `-i ${Object.keys(parts).join(' ')} combine-files -merge-layers name=regions ` +
        `-o format=topojson quantization=${quantization} target=* out.topo.json`,
    );
  }
  const object = topology.objects.regions;
  if (!object) throw new Error('pack: mapshaper produced no regions object');
  return { ...topology, objects: { regions: object } };
}

/** `finest` is kept unless its file is more than this many times the `per-region` one. */
export const FINEST_MAX_RATIO = 3;

/** The mode of a pack from the sizes of both builds: `finest`, unless it is far larger. */
export function pickPackMode(finestBytes: number, perRegionBytes: number): PackMode {
  return finestBytes > FINEST_MAX_RATIO * perRegionBytes ? 'per-region' : 'finest';
}

/**
 * The pack of one subject as JSON, and the mode it was built with. A forced `mode` builds that one.
 * Otherwise both are built and `pickPackMode` chooses; `ratio` is then the size of `finest` over
 * `per-region` (`null` when the mode is forced).
 */
export async function buildBestPack(
  regions: Feature[],
  forced?: PackMode,
  build: typeof buildPack = buildPack,
): Promise<{ json: string; mode: PackMode; ratio: number | null }> {
  if (forced)
    return { json: JSON.stringify(await build(regions, forced)), mode: forced, ratio: null };
  const finest = JSON.stringify(await build(regions, 'finest'));
  const perRegion = JSON.stringify(await build(regions, 'per-region'));
  const [a, b] = [Buffer.byteLength(finest), Buffer.byteLength(perRegion)];
  const mode = pickPackMode(a, b);
  return { json: mode === 'finest' ? finest : perRegion, mode, ratio: a / b };
}
