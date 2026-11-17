import { geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from './bake';

/**
 * A place farther than this from every region polygon belongs to none. The polygons of the base
 * files are simplified, so a coastal town can lie a few km outside its own region.
 */
export const NEAREST_REGION_KM = 10;

/** Place to region, for the regions of one subject topology. */
export interface RegionAssigner {
  /** The region id the point belongs to, or `null` (see `regionAssigner`). */
  regionOf(lon: number, lat: number): string | null;
  /** Whether the topology has a polygon for this region id. */
  has(regionId: string): boolean;
}

type Shape = Feature<Polygon | MultiPolygon>;
type Ring = number[][];

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON_EQUATOR = 111.32;
/** Regions whose box is farther than this (degrees) from a point are not measured. */
const BOX_MARGIN_DEG = 0.3;

const ringsOf = (shape: Shape): Ring[] =>
  shape.geometry.type === 'Polygon'
    ? shape.geometry.coordinates
    : shape.geometry.coordinates.flat();

/**
 * Km from `(lon, lat)` to the nearest edge (not vertex) of the rings, on a local equirectangular
 * plane centred on the point: accurate to well under a percent at the 10 km scale.
 */
function edgeDistanceKm(rings: Ring[], lon: number, lat: number): number {
  const kx = Math.cos((lat * Math.PI) / 180) * KM_PER_DEG_LON_EQUATOR;
  const local = (p: number[]): [number, number] => [
    (((((p[0]! - lon + 540) % 360) + 360) % 360) - 180) * kx,
    (p[1]! - lat) * KM_PER_DEG_LAT,
  ];
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = local(ring[i - 1]!);
      const [bx, by] = local(ring[i]!);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      // the point is the origin: project it on the segment
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/**
 * Assigns a point to ONE region of a subject topology (the `regions` object, whose geometries carry
 * the id in `properties.id`): the region whose polygon contains it (spherical `geoContains`), else
 * the nearest region by distance to polygon edges when that is at most `NEAREST_REGION_KM`, else
 * none. Nearest-wins keeps Reggio di Calabria in Calabria although it is 2.6 km from Sicily's
 * polygon. Answers are cached per point. `null` when the topology has no areal region geometry.
 */
export function regionAssigner(topology: Topology): RegionAssigner | null {
  const object = topology.objects['regions'];
  if (!object || object.type !== 'GeometryCollection') return null;
  const regions: {
    id: string;
    shape: Shape;
    rings: Ring[];
    box: [number, number, number, number];
  }[] = [];
  for (const g of object.geometries) {
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
    const id = (g.properties as { id?: unknown } | undefined)?.id ?? g.id;
    if (typeof id !== 'string') continue;
    const shape = feature(topology, g) as unknown as Shape;
    const rings = ringsOf(shape);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) {
      for (const [x, y] of ring as [number, number][]) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
    regions.push({ id, shape, rings, box });
  }
  if (regions.length === 0) return null;
  const cache = new Map<string, string | null>();
  const ids = new Set(regions.map((r) => r.id));
  const near = (r: (typeof regions)[number], lon: number, lat: number): boolean => {
    const [w, s, e, n] = r.box;
    const k = BOX_MARGIN_DEG;
    return (
      lat >= s - k &&
      lat <= n + k &&
      lon >= w - k / Math.cos((lat * Math.PI) / 180) &&
      lon <= e + k / Math.cos((lat * Math.PI) / 180)
    );
  };
  const compute = (lon: number, lat: number): string | null => {
    const candidates = regions.filter((r) => near(r, lon, lat));
    for (const r of candidates) if (geoContains(r.shape, [lon, lat])) return r.id;
    let best: string | null = null;
    let bestKm = NEAREST_REGION_KM;
    for (const r of candidates) {
      const km = edgeDistanceKm(r.rings, lon, lat);
      if (km <= bestKm) {
        best = r.id;
        bestKm = km;
      }
    }
    return best;
  };
  return {
    regionOf(lon, lat) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const key = `${lon},${lat}`;
      if (!cache.has(key)) cache.set(key, compute(lon, lat));
      return cache.get(key) ?? null;
    },
    has: (regionId) => ids.has(regionId),
  };
}
