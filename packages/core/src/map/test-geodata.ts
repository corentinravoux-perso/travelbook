import { readFileSync } from 'node:fs';
import type { Topology } from './bake';

/** The bundled geodata of the desktop app, read straight from `resources/maps` by the tests. */
const MAPS = new URL('../../../../apps/desktop/resources/maps/', import.meta.url);

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, MAPS), 'utf8'));

interface IndexSubject {
  id: string;
  regions: { id: string; name: string }[];
}

/** The base TopoJSON of a subject (`land`, `regions`, `neighbours`, `lakes`). */
export const subjectTopology = (id: string): Topology =>
  read(`subjects/${id}.topo.json`) as Topology;

/** The shared coarse world land (`world.topo.json`, one `land` object): the far context of a map. */
export const worldTopology = (): Topology => read('world.topo.json') as Topology;

/** The bundled fine pack of a subject (only the US, GB, IT and GR packs are bundled). */
export const packTopology = (id: string): Topology => read(`packs/${id}.topo.json`) as Topology;

/** The id that `index.json` gives to the region of a subject called `name`. */
export function regionId(subject: string, name: string): string {
  const index = read('index.json') as { subjects: IndexSubject[] };
  const found = index.subjects.find((s) => s.id === subject)?.regions.find((r) => r.name === name);
  if (!found) throw new Error(`no region ${name} in ${subject}`);
  return found.id;
}

/** A clockwise (d3's exterior winding) lon/lat rectangle ring. */
export const box = (west: number, south: number, east: number, north: number): number[][] => [
  [west, south],
  [west, north],
  [east, north],
  [east, south],
  [west, south],
];

/** A small topology whose `land` is the given rectangles; no regions, neighbours or lakes. */
export function rectangles(rings: number[][][]): Topology {
  return {
    type: 'Topology',
    arcs: rings.map((ring) => ring.map(([x = 0, y = 0]) => [x, y])),
    objects: {
      land: {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'MultiPolygon',
            arcs: rings.map((_, i) => [[i]]),
            properties: { id: 'T', name: 'Test' },
          },
        ],
      },
      regions: { type: 'GeometryCollection', geometries: [] },
      neighbours: { type: 'GeometryCollection', geometries: [] },
      lakes: { type: 'GeometryCollection', geometries: [] },
    },
  };
}
