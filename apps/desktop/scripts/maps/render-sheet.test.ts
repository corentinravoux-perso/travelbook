import { describe, expect, it } from 'vitest';
import { centralLongitude, nearRings, pickZoomWindow } from './render-sheet.ts';

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
});
