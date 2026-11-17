import { fitFrame, newId, placeKind, projectPlace, unprojectPlace } from '@travelbook/core';
import type { MapGeometry, MapPlace, MapTopology } from '@travelbook/core';
import { fr } from '../strings/fr';
import { placesInRegions, placeFromBundled } from './dialogModel';
import type { MapSpec } from './dialogModel';
import type { BundledPlace, IndexSubject } from './subjects';

/** A click names its place after the nearest bundled one within this distance. */
export const NEAREST_PLACE_KM = 10;
/** Search offers this many places at most. */
export const MAX_OFFERED = 12;

const EARTH_KM = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance, km. `Infinity` when a coordinate is not finite. */
export function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  if (![aLon, aLat, bLon, bLat].every(Number.isFinite)) return Infinity;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The bundled place nearest to a point, within `NEAREST_PLACE_KM`; `null` otherwise. */
export function nearestBundled(
  bundled: BundledPlace[],
  lon: number,
  lat: number,
): BundledPlace | null {
  let best: BundledPlace | null = null;
  let bestKm = NEAREST_PLACE_KM;
  for (const p of bundled) {
    const km = distanceKm(lon, lat, p.lon, p.lat);
    if (km <= bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}

/** A custom place at a point: named after the nearest bundled place, else "Nouveau lieu". */
export function customPlaceAt(bundled: BundledPlace[], lon: number, lat: number): MapPlace {
  return {
    // a bundled 'city' carries no `kind`: the click is drawn as a custom place
    ...placeFromBundled({ ref: '', kind: 'city', name: '', lon, lat, rank: 0 }),
    id: newId(),
    source: { kind: 'custom' },
    label: nearestBundled(bundled, lon, lat)?.name ?? fr.maps.places.newPlace,
  };
}

/** Lower case without accents, for the search. */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface Offered {
  place: BundledPlace;
  /** `false`: outside the chosen regions (offered after the others). */
  inRegion: boolean;
}

/**
 * The bundled places the user can still add: not already on the map (by `ref`), matching the
 * query (name, accents and case ignored), those inside the chosen regions first, then the others
 * of the country; each group by rank. At most `MAX_OFFERED`.
 */
export function offeredPlaces(
  bundled: BundledPlace[],
  places: MapPlace[],
  subject: IndexSubject | null,
  regionIds: string[],
  base: MapTopology | null,
  query: string,
): Offered[] {
  const used = new Set(places.flatMap((p) => (p.source.kind === 'custom' ? [] : [p.source.ref])));
  const q = fold(query.trim());
  const left = bundled.filter(
    (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && !used.has(p.ref),
  );
  const matching = q ? left.filter((p) => fold(p.name).includes(q)) : left;
  const inside = new Set(placesInRegions(matching, subject, regionIds, base));
  const byRank = (a: BundledPlace, b: BundledPlace): number => a.rank - b.rank;
  const first = matching.filter((p) => inside.has(p)).sort(byRank);
  const rest = matching.filter((p) => !inside.has(p)).sort(byRank);
  return [
    ...first.map((place) => ({ place, inRegion: true })),
    ...rest.map((place) => ({ place, inRegion: false })),
  ].slice(0, MAX_OFFERED);
}

/** Where a place is in the box, mm; `null` when its coordinates are not finite. */
export function placePointMm(
  g: MapGeometry,
  box: { w: number; h: number },
  spec: Pick<MapSpec, 'frame' | 'subject'>,
  lon: number,
  lat: number,
): [number, number] | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const fit = fitFrame(g, box, spec.frame, spec.subject.includeRemote);
  const [x, y] = projectPlace(g.projection, lon, lat);
  return [x * fit.scale + fit.dx, y * fit.scale + fit.dy];
}

/** The degrees under a point of the box (mm): the inverse of `placePointMm`. */
export function lonLatAtMm(
  g: MapGeometry,
  box: { w: number; h: number },
  spec: Pick<MapSpec, 'frame' | 'subject'>,
  xMm: number,
  yMm: number,
): [number, number] {
  const fit = fitFrame(g, box, spec.frame, spec.subject.includeRemote);
  return unprojectPlace(g.projection, (xMm - fit.dx) / fit.scale, (yMm - fit.dy) / fit.scale);
}

/**
 * The offset (mm at zoom 1, from the point to the centre of the label) the label is drawn at now,
 * read from the preview; `null` when the label is not drawn or the place has no point. `zoom` is
 * the frame's (`frameZoom`): the preview draws offsets that many times larger.
 */
export function drawnLabelOffset(
  root: ParentNode,
  placeId: string,
  point: [number, number] | null,
  zoom = 1,
): { dx: number; dy: number } | null {
  if (!point) return null;
  const node = Array.from(root.querySelectorAll('[data-label]')).find(
    (n) => n.getAttribute('data-label') === placeId,
  );
  const x = Number(node?.getAttribute('x'));
  const y = Number(node?.getAttribute('y'));
  if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { dx: (x - point[0]) / zoom, dy: (y - point[1]) / zoom };
}

/** The place at `index` replaced by its patched copy; the other places are kept as they are. */
export function patchPlace(
  places: MapPlace[],
  index: number,
  patch: Partial<MapPlace>,
): MapPlace[] {
  return places.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

/** Rows of a place list: its index (duplicate ids and bad coordinates are tolerated) and place. */
export interface Row {
  index: number;
  place: MapPlace;
}

/**
 * Villes (capital and cities), Sites (sights) and Lieux ajoutés, in list order, by what the place
 * is drawn as (`placeKind`): a clicked place made a city is listed with the cities.
 */
export function groupPlaces(places: MapPlace[]): {
  cities: Row[];
  sights: Row[];
  custom: Row[];
} {
  const rows = places.map((place, index) => ({ index, place, kind: placeKind(place) }));
  const pick = (keep: (k: string) => boolean): Row[] =>
    rows.filter((r) => keep(r.kind)).map(({ index, place }) => ({ index, place }));
  return {
    cities: pick((k) => k === 'capital' || k === 'city'),
    sights: pick((k) => k === 'sight'),
    custom: pick((k) => k === 'custom'),
  };
}
