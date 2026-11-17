import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from './bake';

/**
 * A point-in-region test for one region of a subject's topology (the `regions` object, whose
 * geometries carry the region id in `properties.id`). Spherical (`d3-geo` `geoContains`), so it
 * holds across the antimeridian. `null` when the topology has no areal geometry for that id.
 */
export function regionContains(
  topology: Topology,
  regionId: string,
): ((lon: number, lat: number) => boolean) | null {
  const object = topology.objects['regions'];
  if (!object || object.type !== 'GeometryCollection') return null;
  const hits = object.geometries.filter(
    (g) =>
      (g.type === 'Polygon' || g.type === 'MultiPolygon') &&
      ((g.properties as { id?: unknown } | undefined)?.id === regionId || g.id === regionId),
  );
  if (hits.length === 0) return null;
  const shapes = hits.map((g) => feature(topology, g));
  return (lon, lat) =>
    Number.isFinite(lon) && Number.isFinite(lat) && shapes.some((s) => geoContains(s, [lon, lat]));
}
