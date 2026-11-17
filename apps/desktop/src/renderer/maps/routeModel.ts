import type { MapLeg, MapRoute } from '@travelbook/core';

export const DEFAULT_LEG: MapLeg = { mode: 'voiture', curve: 'droit', bend: 0, icon: false };

const copyLeg = (leg: MapLeg): MapLeg => ({ ...leg });

/**
 * The route with exactly `stops - 1` legs: missing legs are the default, extra ones are dropped.
 * The schema does not tie the two lists together, so every edit starts here. Never mutates.
 */
export function repairRoute(route: MapRoute): MapRoute {
  const legs = Array.from({ length: Math.max(0, route.stops.length - 1) }, (_, i) =>
    copyLeg(route.legs[i] ?? DEFAULT_LEG),
  );
  return { stops: [...route.stops], legs, numbered: route.numbered };
}

/** A stop at the end, with a default leg from the previous one. A place may be added again. */
export function addStop(route: MapRoute | null, placeId: string): MapRoute {
  if (!route) return { stops: [placeId], legs: [], numbered: true };
  const fixed = repairRoute(route);
  return {
    ...fixed,
    stops: [...fixed.stops, placeId],
    legs: fixed.stops.length > 0 ? [...fixed.legs, copyLeg(DEFAULT_LEG)] : fixed.legs,
  };
}

/**
 * Remove the stop at `index`. A leg stays attached to its "from" stop, so the leg that left the
 * removed stop goes (the leg that arrived at it, from the previous stop, now reaches the next
 * one); for the last stop, which has no leg of its own, the leg that arrived goes. `null` when
 * no stop is left.
 */
export function removeStop(route: MapRoute, index: number): MapRoute | null {
  const fixed = repairRoute(route);
  if (index < 0 || index >= fixed.stops.length) return fixed;
  if (fixed.stops.length === 1) return null;
  const legs = fixed.legs.filter((_, i) => i !== Math.min(index, fixed.stops.length - 2));
  return { ...fixed, stops: fixed.stops.filter((_, i) => i !== index), legs };
}

/**
 * Move a stop; its leg (the one leaving it) moves with it, so the user's choice of mode and
 * curve stays on the stop they were made for. The last stop has no leg: when it ends up
 * elsewhere it gets a default leg, and the leg of whichever stop becomes last is dropped.
 */
export function moveStop(route: MapRoute, from: number, to: number): MapRoute {
  const fixed = repairRoute(route);
  const n = fixed.stops.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return fixed;
  const slots = fixed.stops.map((id, i) => ({ id, leg: fixed.legs[i] ?? null }));
  const [moved] = slots.splice(from, 1);
  slots.splice(to, 0, moved!);
  return {
    ...fixed,
    stops: slots.map((s) => s.id),
    legs: slots.slice(0, -1).map((s) => s.leg ?? copyLeg(DEFAULT_LEG)),
  };
}

/** Change fields of leg `index` (leg `i` goes from stop `i` to stop `i + 1`). */
export function setLeg(route: MapRoute, index: number, patch: Partial<MapLeg>): MapRoute {
  const fixed = repairRoute(route);
  if (index < 0 || index >= fixed.legs.length) return fixed;
  return { ...fixed, legs: fixed.legs.map((l, i) => (i === index ? { ...l, ...patch } : l)) };
}
