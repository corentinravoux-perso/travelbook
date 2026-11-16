import type { MapLeg, MapPlace, MapRoute } from './types';

/** Under this many units, two points are one point: a leg between them is not drawn. */
const SAME_POINT = 1e-6;

const round = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The path of a leg between two points of the unit plane (or of any plane: it is scale free),
 * its middle, and its direction there in degrees, as SVG `rotate()` takes it (y down, 0 pointing
 * right). A `droit` leg, or a `courbe` leg with no bend, is a straight line. Otherwise it is a
 * quadratic whose control point is on the normal at the middle of the chord, at `bend` half of
 * the chord's length: positive bends to the left of the travel, negative to the right.
 * Identical or non-finite points give an empty `d`.
 */
export function legPath(
  a: [number, number],
  b: [number, number],
  leg: MapLeg,
): { d: string; mid: [number, number]; angle: number } {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < SAME_POINT) {
    const mid: [number, number] = [Number.isFinite(ax) ? ax : 0, Number.isFinite(ay) ? ay : 0];
    return { d: '', mid, angle: 0 };
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const bend = Number.isFinite(leg.bend) ? Math.max(-1, Math.min(1, leg.bend)) : 0;
  const move = `M${round(ax)} ${round(ay)}`;
  if (leg.curve === 'droit' || bend === 0) {
    return {
      d: `${move}L${round(bx)} ${round(by)}`,
      mid: [(ax + bx) / 2, (ay + by) / 2],
      angle,
    };
  }
  // the left of the travel, y down: (dy, -dx) turned to a unit vector
  const off = (bend * length) / 2;
  const nx = (dy / length) * off;
  const ny = (-dx / length) * off;
  const cx = (ax + bx) / 2 + nx;
  const cy = (ay + by) / 2 + ny;
  return {
    d: `${move}Q${round(cx)} ${round(cy)} ${round(bx)} ${round(by)}`,
    // the middle of a quadratic is half-way to its control point
    mid: [(ax + bx) / 2 + nx / 2, (ay + by) / 2 + ny / 2],
    angle,
  };
}

/** Place id to the numbers of its stops, from 1 (a place visited twice has both). */
export function routeNumbers(route: MapRoute): Map<string, number[]> {
  const out = new Map<string, number[]>();
  route.stops.forEach((id, i) => {
    const numbers = out.get(id);
    if (numbers) numbers.push(i + 1);
    else out.set(id, [i + 1]);
  });
  return out;
}

export interface RouteSegment {
  /** Index of the leg, from the stop `index` to the stop `index + 1`. */
  index: number;
  from: MapPlace;
  to: MapPlace;
  leg: MapLeg;
}

/**
 * The legs of a route that can be drawn, with the places they join. The model does not tie the
 * three lists together, so a leg is skipped when it has no entry in `legs` or when one of its
 * stops is no place; of two places with one id, the first is used.
 */
export function routeSegments(route: MapRoute, places: MapPlace[]): RouteSegment[] {
  const byId = new Map<string, MapPlace>();
  for (const place of places) if (!byId.has(place.id)) byId.set(place.id, place);
  const out: RouteSegment[] = [];
  for (let index = 0; index + 1 < route.stops.length; index++) {
    const leg = route.legs[index];
    const from = byId.get(route.stops[index] ?? '');
    const to = byId.get(route.stops[index + 1] ?? '');
    if (leg && from && to) out.push({ index, from, to, leg });
  }
  return out;
}
