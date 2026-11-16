import { describe, expect, it } from 'vitest';
import type { MapIndex } from './build-geodata.ts';
import {
  cellOf,
  centralLongitude,
  loadSubject,
  nearRings,
  pickZoomWindow,
  renderSheet,
} from './render-sheet.ts';

type Ring = [number, number][];

/** A 100 x 100 square whose top edge, between x = 60 and 100, is a saw of 20 teeth. */
function squareWithSawEdge(): Ring {
  const top: Ring = [];
  for (let i = 0; i <= 40; i++) top.push([100 - i, 100 - (i % 2 === 0 ? 0 : 3)]);
  return [[0, 0], [100, 0], ...top, [60, 100], [0, 100], [0, 0]];
}

describe('the contact sheet', () => {
  it('zooms on the most indented stretch of coast', () => {
    const window = pickZoomWindow([squareWithSawEdge()], 20);
    expect(window).not.toBeNull();
    expect(window?.x).toBeGreaterThan(60);
    expect(window?.y).toBeGreaterThan(80);
  });

  it('does not count a border as coast', () => {
    const ring = squareWithSawEdge();
    // a neighbour whose edge runs along the saw: the plain edges are all that is left
    const border = nearRings(
      [
        [
          [60, 98],
          [100, 98],
        ],
      ],
      6,
    );
    const window = pickZoomWindow([ring], 20, border);
    expect(window?.y).toBeLessThan(80);
  });

  it('cuts the longitudes at the widest empty band, across the antimeridian', () => {
    expect(centralLongitude([172, 179, -178, -176])).toBeCloseTo(178, 6);
    expect(centralLongitude([10, 20, 30])).toBeCloseTo(20, 6);
  });

  const entry = (extra: Partial<MapIndex['subjects'][number]> = {}) =>
    ({
      id: 'XX',
      name: 'Land',
      landSource: 'region',
      regions: [],
      ...extra,
    }) as MapIndex['subjects'][number];
  const topology = (landArcs: number[]) => ({
    arcs: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ] as [number, number][],
    ],
    objects: { land: { geometries: [{ type: 'Polygon', arcs: [landArcs] }] } },
  });

  it('draws a ring from its arcs, forward or reversed', () => {
    expect(loadSubject(entry(), topology([0])).land).toHaveLength(1);
    expect(loadSubject(entry(), topology([~0])).land).toHaveLength(1);
  });

  it('throws on an arc index that is not in the topology, instead of drawing an open ring', () => {
    expect(() => loadSubject(entry(), topology([7]))).toThrow(/arc 7 is not in the topology/);
    expect(() => loadSubject(entry(), topology([~7]))).toThrow(/arc -8 is not in the topology/);
  });

  it('cuts the name and the land source to the width of the info column', () => {
    const long = loadSubject(
      entry({
        name: 'République démocratique du Congo',
        landSource: 'locality-of-a-very-long-name' as never,
      }),
      topology([0]),
    );
    const { svg } = cellOf(long, 0, 0);
    expect(svg).toContain('République démocratiq…');
    expect(svg).toContain('land: locality-of-a-v…');
    expect(svg).not.toContain('Congo');
    expect(svg).not.toContain('very-long-name');
  });

  it('refuses an empty list of subjects', async () => {
    await expect(renderSheet([], '/nonexistent/sheet')).rejects.toThrow(/no subject ids/);
  });
});
