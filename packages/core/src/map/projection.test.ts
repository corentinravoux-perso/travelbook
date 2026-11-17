import { describe, expect, it } from 'vitest';
import {
  chooseProjection,
  projectPlace,
  unprojectPlace,
  type ProjectionParams,
} from './projection';

const params = (bbox: [number, number, number, number]): ProjectionParams => ({
  ...chooseProjection(bbox, 'auto'),
  k: 100,
  tx: 50,
  ty: 60,
});

describe('chooseProjection', () => {
  it('rotates to the centre of a bbox that crosses the antimeridian (Fiji)', () => {
    const p = chooseProjection([177, -21, -178, -16], 'auto');
    expect(Math.abs(p.rotate[0] + 179.5)).toBeLessThan(1);
    expect(p.kind).toBe('transverseMercator');
  });

  it('unwraps west > east before taking the centre, whatever the side', () => {
    expect(chooseProjection([170, -10, -170, 10], 'auto').rotate[0]).toBeCloseTo(-180, 6);
    // 175..-165 is centred on -175 + 360 / 2 = 185 = -175
    expect(chooseProjection([175, 0, -165, 5], 'auto').rotate[0]).toBeCloseTo(-185 + 360, 6);
  });

  it('rotates a plain bbox to its centre', () => {
    const [lon, lat, roll] = chooseProjection([97.3, 5.6, 105.6, 20.5], 'auto').rotate;
    expect(lon).toBeCloseTo(-101.45, 9);
    expect([lat, roll]).toEqual([0, 0]);
  });

  it('uses a transverse Mercator for a tall subject (Thailand)', () => {
    expect(chooseProjection([97.3, 5.6, 105.6, 20.5], 'auto').kind).toBe('transverseMercator');
  });

  it('uses a conic conformal for a wide subject, standard parallels inside it (US)', () => {
    const p = chooseProjection([-125, 24, -66, 49], 'auto');
    expect(p.kind).toBe('conicConformal');
    const [a, b] = p.parallels ?? [NaN, NaN];
    expect(a).toBeGreaterThan(24);
    expect(b).toBeLessThan(49);
    expect(a).toBeLessThan(b);
  });

  it('keeps a transverse Mercator for a wide subject of 8 degrees or less in latitude', () => {
    expect(chooseProjection([0, 40, 20, 46], 'auto').kind).toBe('transverseMercator');
    expect(chooseProjection([0, 40, 20, 48], 'auto').kind).toBe('transverseMercator'); // = 8
    expect(chooseProjection([0, 40, 30, 48.5], 'auto').kind).toBe('conicConformal');
  });

  it('forces a Mercator when asked', () => {
    const p = chooseProjection([-125, 24, -66, 49], 'mercator');
    expect(p.kind).toBe('mercator');
    expect(p.rotate[0]).toBeCloseTo(95.5, 9);
    expect(p.rotate.slice(1)).toEqual([0, 0]);
    expect(p.parallels).toBeUndefined();
  });

  it('survives a point bbox and non-finite input', () => {
    for (const bbox of [
      [10, 20, 10, 20],
      [NaN, 0, 1, 1],
    ] as [number, number, number, number][]) {
      const p = chooseProjection(bbox, 'auto');
      expect(p.rotate.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('projectPlace', () => {
  it('is deterministic and puts north above south and east right of west', () => {
    const p = params([97.3, 5.6, 105.6, 20.5]);
    const bangkok = projectPlace(p, 100.5, 13.75);
    expect(projectPlace(p, 100.5, 13.75)).toEqual(bangkok);
    const phuket = projectPlace(p, 98.4, 7.9);
    expect(phuket[1]).toBeGreaterThan(bangkok[1]); // y grows downward
    expect(phuket[0]).toBeLessThan(bangkok[0]);
  });

  it('applies k, tx and ty on top of the projection', () => {
    const base = params([97.3, 5.6, 105.6, 20.5]);
    const [x0, y0] = projectPlace({ ...base, k: 1, tx: 0, ty: 0 }, 99, 9);
    const [x1, y1] = projectPlace({ ...base, k: 10, tx: 5, ty: -7 }, 99, 9);
    expect(x1).toBeCloseTo(10 * x0 + 5, 6);
    expect(y1).toBeCloseTo(10 * y0 - 7, 6);
  });

  it('puts both sides of the antimeridian next to each other', () => {
    const p = params([177, -21, -178, -16]);
    const west = projectPlace(p, 179.9, -17);
    const east = projectPlace(p, -179.9, -17);
    expect(Math.abs(east[0] - west[0])).toBeLessThan(5);
  });

  it('returns finite numbers for the poles, the far side and bad input', () => {
    const p = params([97.3, 5.6, 105.6, 20.5]);
    for (const [lon, lat] of [
      [0, 90],
      [0, -90],
      [-80, 0],
      [101.45 + 90, 0],
      [NaN, 12],
      [100, Infinity],
    ] as [number, number][]) {
      const out = projectPlace(p, lon, lat);
      expect(out.every(Number.isFinite)).toBe(true);
    }
    const mercator = { ...p, ...chooseProjection([97.3, 5.6, 105.6, 20.5], 'mercator') };
    expect(projectPlace(mercator, 10, 90).every(Number.isFinite)).toBe(true);
    const conic = { ...p, ...chooseProjection([-125, 24, -66, 49], 'auto') };
    expect(projectPlace(conic, 0, -90).every(Number.isFinite)).toBe(true);
  });
});

describe('unprojectPlace', () => {
  it('is the inverse of projectPlace', () => {
    const p = params([97.3, 5.6, 105.6, 20.5]);
    const [x, y] = projectPlace(p, 100.5, 13.75);
    const [lon, lat] = unprojectPlace(p, x, y);
    expect(lon).toBeCloseTo(100.5, 4);
    expect(lat).toBeCloseTo(13.75, 4);
  });

  it('gives finite degrees for a point that cannot be inverted', () => {
    const p = params([97.3, 5.6, 105.6, 20.5]);
    expect(unprojectPlace(p, Number.NaN, 4).every(Number.isFinite)).toBe(true);
  });
});

describe('unprojectPlace, every projection kind', () => {
  const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const cases: [string, ProjectionParams, [number, number][]][] = [
    [
      'conicConformal',
      {
        kind: 'conicConformal',
        rotate: [-2, 0, 0],
        parallels: [43, 49],
        k: 900,
        tx: 300,
        ty: 400,
      },
      [
        [2.35, 48.85],
        [-4.5, 47.9],
        [7.5, 43.7],
      ],
    ],
    [
      'mercator',
      { kind: 'mercator', rotate: [-100, 0, 0], k: 500, tx: 200, ty: 250 },
      [
        [100.5, 13.75],
        [98.4, 7.9],
        [105, 20],
      ],
    ],
    [
      'Fiji, rotated across the antimeridian',
      { ...chooseProjection([177, -21, -178, -16], 'auto'), k: 800, tx: 100, ty: 100 },
      [
        [178.0, -18.1],
        [179.9, -17],
        [-179.2, -16.7],
        [-178.1, -19.5],
      ],
    ],
  ];
  for (const [name, p, points] of cases) {
    it(`inverts projectPlace for ${name}`, () => {
      for (const [lon, lat] of points) {
        const [x, y] = projectPlace(p, lon, lat);
        const [lon2, lat2] = unprojectPlace(p, x, y);
        expect(wrap(lon2 - lon)).toBeCloseTo(0, 4);
        expect(lat2).toBeCloseTo(lat, 4);
      }
    });
  }
});
