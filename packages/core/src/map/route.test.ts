import { describe, expect, it } from 'vitest';
import { legPath, routeNumbers, routeSegments } from './route';
import { mapElement } from './test-helpers';
import type { MapLeg, MapPlace, MapRoute } from './types';

const leg = (over: Partial<MapLeg> = {}): MapLeg => ({
  mode: 'train',
  curve: 'droit',
  bend: 0,
  icon: false,
  ...over,
});

const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('legPath', () => {
  it('draws a straight line for a "droit" leg, with its middle and direction', () => {
    const out = legPath([0, 0], [10, 0], leg());
    expect(out.d).toBe('M0 0L10 0');
    expect(out.mid).toEqual([5, 0]);
    expect(out.angle).toBe(0);
  });

  it('gives the angle in degrees, y pointing down', () => {
    expect(legPath([0, 0], [0, 10], leg()).angle).toBeCloseTo(90, 6);
    expect(legPath([0, 0], [-10, 0], leg()).angle).toBeCloseTo(180, 6);
    expect(legPath([0, 0], [10, -10], leg()).angle).toBeCloseTo(-45, 6);
  });

  it('draws a "courbe" leg with bend 0 as a straight line', () => {
    expect(legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 0 })).d).toBe('M0 0L10 0');
  });

  it('draws bend 1 as a quadratic whose control point is on the left normal', () => {
    // travelling east on screen (y down), left is up: negative y
    const out = legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 1 }));
    const [ax, ay, cx, cy, bx, by] = numbers(out.d);
    expect(out.d.startsWith('M0 0Q')).toBe(true);
    expect([ax, ay, bx, by]).toEqual([0, 0, 10, 0]);
    expect(cx).toBeCloseTo(5, 6);
    expect(cy).toBeLessThan(0);
    // the curve passes through the middle at half of the control point's offset
    expect(out.mid[0]).toBeCloseTo(5, 6);
    expect(out.mid[1]).toBeCloseTo((cy ?? 0) / 2, 6);
    expect(out.angle).toBe(0);
  });

  it('bends to the right for a negative bend, and grows with the length of the leg', () => {
    const right = legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: -1 }));
    expect(numbers(right.d)[3]).toBeGreaterThan(0);
    const half = numbers(legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 0.5 })).d)[3] ?? 0;
    const full = numbers(legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 1 })).d)[3] ?? 0;
    expect(half).toBeCloseTo(full / 2, 6);
    const long = numbers(legPath([0, 0], [100, 0], leg({ curve: 'courbe', bend: 1 })).d)[3] ?? 0;
    expect(long).toBeCloseTo(full * 10, 6);
  });

  it('clamps a bend outside -1..1', () => {
    const wild = legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 40 }));
    const full = legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: 1 }));
    expect(wild.d).toBe(full.d);
  });

  it('returns an empty d, no NaN, for identical or non-finite points', () => {
    for (const [a, b] of [
      [
        [3, 4],
        [3, 4],
      ],
      [
        [3, 4],
        [3 + 1e-12, 4],
      ],
      [
        [NaN, 4],
        [3, 4],
      ],
      [
        [3, 4],
        [Infinity, 4],
      ],
    ] as [[number, number], [number, number]][]) {
      for (const l of [leg(), leg({ curve: 'courbe', bend: 1 })]) {
        const out = legPath(a, b, l);
        expect(out.d).toBe('');
        expect(out.mid.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(out.angle)).toBe(true);
      }
    }
  });

  it('treats a non-finite bend as 0', () => {
    expect(legPath([0, 0], [10, 0], leg({ curve: 'courbe', bend: NaN })).d).toBe('M0 0L10 0');
  });
});

describe('routeNumbers', () => {
  const route = (stops: string[]): MapRoute => ({ stops, legs: [], numbered: true });

  it('numbers the stops from 1 and lists every number of a repeated place', () => {
    const out = routeNumbers(route(['A', 'B', 'A']));
    expect(out.get('A')).toEqual([1, 3]);
    expect(out.get('B')).toEqual([2]);
    expect(out.size).toBe(2);
  });

  it('handles one stop and no stop', () => {
    expect(routeNumbers(route(['A'])).get('A')).toEqual([1]);
    expect(routeNumbers(route([])).size).toBe(0);
  });
});

describe('routeSegments', () => {
  const place = (id: string, lon: number, lat: number): MapPlace => ({
    ...mapElement().places[0]!,
    id,
    lon,
    lat,
  });
  const places = [place('A', 1, 1), place('B', 2, 2), place('C', 3, 3)];

  it('pairs each leg with the places it joins', () => {
    const route: MapRoute = {
      stops: ['A', 'B', 'C'],
      legs: [leg({ mode: 'bus' }), leg({ mode: 'avion' })],
      numbered: true,
    };
    const out = routeSegments(route, places);
    expect(out.map((s) => [s.index, s.from.id, s.to.id, s.leg.mode])).toEqual([
      [0, 'A', 'B', 'bus'],
      [1, 'B', 'C', 'avion'],
    ]);
  });

  it('skips what cannot be drawn: a missing leg, an unknown place', () => {
    const route: MapRoute = {
      stops: ['A', 'B', 'X', 'C', 'C'],
      legs: [leg(), leg(), leg()], // 4 expected, 3 given
      numbered: true,
    };
    expect(routeSegments(route, places).map((s) => s.index)).toEqual([0]);
    const ok: MapRoute = { stops: ['A', 'B', 'C'], legs: [leg()], numbered: true };
    expect(routeSegments(ok, places).map((s) => s.index)).toEqual([0]);
    const extra: MapRoute = { stops: ['A', 'B'], legs: [leg(), leg(), leg()], numbered: true };
    expect(routeSegments(extra, places)).toHaveLength(1);
    expect(routeSegments({ stops: [], legs: [], numbered: false }, places)).toEqual([]);
  });

  it('takes the first of two places with the same id', () => {
    const twin = [...places, place('A', 50, 50)];
    const route: MapRoute = { stops: ['A', 'B'], legs: [leg()], numbered: true };
    expect(routeSegments(route, twin)[0]?.from.lon).toBe(1);
  });
});
