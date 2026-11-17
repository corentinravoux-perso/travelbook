import { geoConicConformal, geoMercator, geoTransverseMercator, type GeoProjection } from 'd3-geo';
import type { MapElement } from './types';

/**
 * How a map is projected. `rotate`, `parallels` and the kind pick the projection; `k`, `tx` and
 * `ty` map its output to the unit coordinates of the baked paths, in which the larger side of the
 * subject's bounds is 1000 and the bounds start at (0, 0). `rotate` is d3's: for the transverse
 * Mercator it is the one of the equivalent plain Mercator (d3 turns it by 90 degrees itself).
 */
export interface ProjectionParams {
  kind: 'transverseMercator' | 'conicConformal' | 'mercator';
  rotate: [number, number, number];
  parallels?: [number, number];
  k: number;
  tx: number;
  ty: number;
}

export type Bounds = [[number, number], [number, number]];

/**
 * A baked map: projected paths in unit coordinates (SVG path strings, y down) and the projection
 * that produced them, so that places given in degrees land on the same plane.
 */
export interface MapGeometry {
  version: 1;
  projection: ProjectionParams;
  /** `[[x0, y0], [x1, y1]]` of the subject's main parts: the default frame. */
  bounds: Bounds;
  /** The same, far-off territories included. */
  remoteBounds: Bounds;
  paths: {
    /** The whole land of the subject, filled. */
    land: string;
    /** The outer boundary of the subject, or of the chosen regions, stroked. */
    outline: string;
    /** The borders between regions, stroked once. Empty when regions are off. */
    regions: string;
    /** The union of the chosen regions, for the highlight. Empty when none is chosen. */
    selected: string;
    /** The neighbouring countries around the subject. Empty when they are off. */
    neighbours: string;
    /**
     * The coasts and borders of the neighbours, stroked: only real lines, none along the frame the
     * build clipped them to. Absent in older assets (the fill path is then stroked).
     */
    neighbourLines?: string;
    /** The major lakes. Empty when there are none, or when lakes are off. */
    lakes: string;
  };
}

/** Coordinates are clamped to this: a place at the far side of a transverse Mercator is infinite. */
const FAR = 1e7;
const MIN_SCALE = 1e-6;
/** A user zoom is kept within this factor of the default fit, either way. */
const ZOOM_LIMIT = 1000;
/** Boxes are kept under this many mm (a kilometre): nothing on a page is larger. */
const MAX_BOX = 1e6;
/** Standard parallels when a conic has none: the middle latitudes. */
const MID_PARALLELS: [number, number] = [30, 60];

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);

/** A longitude in (-180, 180]. */
const wrapLon = (lon: number): number => lon - 360 * Math.ceil((lon - 180) / 360);

/**
 * The projection for a bbox `[west, south, east, north]` in degrees. It is rotated to the centre
 * of the bbox; a bbox with `west > east` crosses the antimeridian and is unwrapped first. A
 * conic conformal serves a wide subject (longitude span over 1.5 times the latitude span, and
 * more than 8 degrees of latitude), a transverse Mercator the others; `mercator` forces a Mercator.
 */
export function chooseProjection(
  bbox: [number, number, number, number],
  mode: 'auto' | 'mercator',
): Omit<ProjectionParams, 'k' | 'tx' | 'ty'> {
  const west = finite(bbox[0]);
  const east0 = finite(bbox[2]);
  const east = east0 < west ? east0 + 360 : east0;
  const south = Math.min(finite(bbox[1]), finite(bbox[3]));
  const north = Math.max(finite(bbox[1]), finite(bbox[3]));
  const centre = wrapLon((west + east) / 2);
  const rotate: [number, number, number] = [0 - centre, 0, 0];
  if (mode === 'mercator') return { kind: 'mercator', rotate };
  const lonSpan = east - west;
  const latSpan = north - south;
  if (lonSpan > 1.5 * latSpan && latSpan > 8) {
    // the one-sixth rule: standard parallels inside the subject
    return {
      kind: 'conicConformal',
      rotate,
      parallels: [south + latSpan / 6, north - latSpan / 6],
    };
  }
  return { kind: 'transverseMercator', rotate };
}

/** The d3 projection of the parameters: its output is in unit coordinates. */
export function d3Projection(p: ProjectionParams): GeoProjection {
  const projection =
    p.kind === 'conicConformal'
      ? geoConicConformal().parallels(p.parallels ?? MID_PARALLELS)
      : p.kind === 'mercator'
        ? geoMercator()
        : geoTransverseMercator();
  return projection.rotate(p.rotate).scale(p.k).translate([p.tx, p.ty]).precision(0.25);
}

/** A place, in degrees, on the plane of the baked paths. Always finite. */
export function projectPlace(p: ProjectionParams, lon: number, lat: number): [number, number] {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [0, 0];
  const out = d3Projection(p)([lon, lat]);
  if (!out) return [0, 0];
  const clamp = (n: number): number => Math.max(-FAR, Math.min(FAR, finite(n)));
  return [clamp(out[0]), clamp(out[1])];
}

/** Degrees at a point of the plane of the baked paths (the inverse of `projectPlace`). Always finite. */
export function unprojectPlace(p: ProjectionParams, x: number, y: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const out = d3Projection(p).invert?.([x, y]);
  if (!out || !Number.isFinite(out[0]) || !Number.isFinite(out[1])) return [0, 0];
  return [out[0], Math.max(-90, Math.min(90, out[1]))];
}

/**
 * Where the map goes in a box of `box` mm: a unit coordinate `(x, y)` is at
 * `(x * scale + dx, y * scale + dy)` mm. The default frame fits the subject's `bounds` (or the
 * `remoteBounds`) into the box minus `marginRatio` on every side, uniformly and centred, so a
 * taller or wider box shows more context and never stretches the land.
 *
 * A user `frame` is a pan and a zoom: `center` (degrees) goes to the middle of the box, and `scale`
 * multiplies the default fit (1 is the default zoom, kept within 1/1000..1000), so it still means
 * the same after a resize.
 * A frame that cannot be used is the default frame. The result is always finite, `scale > 0`.
 */
/**
 * How far the user zoomed, as a multiple of the default fit: 1 with no frame. The marks drawn over
 * the land (markers, labels, route, medallions) are scaled by it, so a zoom magnifies the whole map.
 */
export function frameZoom(frame: { scale: number } | null): number {
  if (!frame || !(frame.scale > 0) || !Number.isFinite(frame.scale)) return 1;
  return Math.min(ZOOM_LIMIT, Math.max(1 / ZOOM_LIMIT, frame.scale));
}

export function fitFrame(
  g: MapGeometry,
  box: { w: number; h: number },
  frame: MapElement['frame'],
  includeRemote: boolean,
  marginRatio = 0.06,
): { scale: number; dx: number; dy: number } {
  const [[x0, y0], [x1, y1]] = includeRemote ? g.remoteBounds : g.bounds;
  const w = Math.min(MAX_BOX, Math.max(0, finite(box.w)));
  const h = Math.min(MAX_BOX, Math.max(0, finite(box.h)));
  const margin = Math.min(0.49, Math.max(0, finite(marginRatio)));
  const bw = x1 - x0;
  const bh = y1 - y0;
  const fit = Math.min(
    bw > 0 ? (w * (1 - 2 * margin)) / bw : Infinity,
    bh > 0 ? (h * (1 - 2 * margin)) / bh : Infinity,
  );
  const base = Number.isFinite(fit) ? Math.max(fit, MIN_SCALE) : bw > 0 || bh > 0 ? MIN_SCALE : 1;
  let scale = base;
  let cx = (x0 + x1) / 2;
  let cy = (y0 + y1) / 2;
  if (
    frame &&
    frame.scale > 0 &&
    Number.isFinite(frame.scale) &&
    Number.isFinite(frame.center[0]) &&
    Number.isFinite(frame.center[1])
  ) {
    scale = base * frameZoom(frame);
    [cx, cy] = projectPlace(g.projection, frame.center[0], frame.center[1]);
  }
  return { scale, dx: w / 2 - scale * cx, dy: h / 2 - scale * cy };
}
