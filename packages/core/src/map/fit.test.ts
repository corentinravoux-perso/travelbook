import { describe, expect, it } from 'vitest';
import { bakeGeometry } from './bake';
import { chooseProjection, fitFrame, projectPlace, type MapGeometry } from './projection';
import { subjectTopology } from './test-geodata';

const subject = (id: string) => ({
  id,
  regions: [],
  showRegions: true,
  showNeighbours: false,
  showLakes: true,
  includeRemote: false,
});

const th = bakeGeometry(subjectTopology('TH'), null, subject('TH'), 'auto', null, 1);
const hi = bakeGeometry(subjectTopology('US-HI'), null, subject('US-HI'), 'auto', null, 1);

/** Where the bounds land in the box, mm. */
function placed(
  g: MapGeometry,
  fit: { scale: number; dx: number; dy: number },
  remote = false,
): { x0: number; y0: number; x1: number; y1: number } {
  const [[a, b], [c, d]] = remote ? g.remoteBounds : g.bounds;
  return {
    x0: a * fit.scale + fit.dx,
    y0: b * fit.scale + fit.dy,
    x1: c * fit.scale + fit.dx,
    y1: d * fit.scale + fit.dy,
  };
}

describe('fitFrame', () => {
  it('fits Thailand into 200 x 280 mm with a 6 % margin and one uniform scale', () => {
    const fit = fitFrame(th, { w: 200, h: 280 }, null, false);
    const p = placed(th, fit);
    const eps = 1e-6;
    expect(p.x0).toBeGreaterThanOrEqual(200 * 0.06 - eps);
    expect(p.x1).toBeLessThanOrEqual(200 * 0.94 + eps);
    expect(p.y0).toBeGreaterThanOrEqual(280 * 0.06 - eps);
    expect(p.y1).toBeLessThanOrEqual(280 * 0.94 + eps);
    // it touches the margin on the limiting side, and is centred
    const touchesW = Math.abs(p.x1 - p.x0 - 200 * 0.88) < 1e-6;
    const touchesH = Math.abs(p.y1 - p.y0 - 280 * 0.88) < 1e-6;
    expect(touchesW || touchesH).toBe(true);
    expect((p.x0 + p.x1) / 2).toBeCloseTo(100, 6);
    expect((p.y0 + p.y1) / 2).toBeCloseTo(140, 6);
    expect(fit.scale).toBeGreaterThan(0);
  });

  it('takes a custom margin', () => {
    const fit = fitFrame(th, { w: 200, h: 280 }, null, false, 0.1);
    const p = placed(th, fit);
    expect(p.x0).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(p.y1).toBeLessThanOrEqual(280 * 0.9 + 1e-6);
  });

  it('keeps the land inside a 300 x 40 mm strip and a 20 x 20 mm square', () => {
    for (const [w, h] of [
      [300, 40],
      [20, 20],
    ] as const) {
      const fit = fitFrame(th, { w, h }, null, false);
      expect(Number.isFinite(fit.scale + fit.dx + fit.dy)).toBe(true);
      expect(fit.scale).toBeGreaterThan(0);
      const p = placed(th, fit);
      expect(p.x0).toBeGreaterThanOrEqual(0);
      expect(p.y0).toBeGreaterThanOrEqual(0);
      expect(p.x1).toBeLessThanOrEqual(w);
      expect(p.y1).toBeLessThanOrEqual(h);
    }
  });

  it('frames the far territories only when asked', () => {
    const near = fitFrame(hi, { w: 200, h: 200 }, null, false);
    const far = fitFrame(hi, { w: 200, h: 200 }, null, true);
    expect(near.scale).toBeGreaterThan(2 * far.scale);
    const p = placed(hi, far, true);
    expect(p.x0).toBeGreaterThanOrEqual(200 * 0.06 - 1e-6);
    expect(p.x1).toBeLessThanOrEqual(200 * 0.94 + 1e-6);
  });

  it('shows more context in a larger box, with the same land size per mm of box', () => {
    const small = fitFrame(th, { w: 100, h: 100 }, null, false);
    const big = fitFrame(th, { w: 200, h: 200 }, null, false);
    expect(big.scale).toBeCloseTo(2 * small.scale, 9);
  });

  describe('with a frame of the user', () => {
    const box = { w: 200, h: 280 };
    const base = fitFrame(th, box, null, false);
    const centre = (lon: number, lat: number): [number, number] =>
      projectPlace(th.projection, lon, lat);

    it('puts the centre of the frame in the middle of the box and multiplies the scale', () => {
      const fit = fitFrame(th, box, { center: [99, 8], scale: 2.5 }, false);
      expect(fit.scale).toBeCloseTo(2.5 * base.scale, 9);
      const [x, y] = centre(99, 8);
      expect(x * fit.scale + fit.dx).toBeCloseTo(100, 6);
      expect(y * fit.scale + fit.dy).toBeCloseTo(140, 6);
    });

    it('is the default fit when the frame is the default one', () => {
      const [cx, cy] = [
        (th.bounds[0][0] + th.bounds[1][0]) / 2,
        (th.bounds[0][1] + th.bounds[1][1]) / 2,
      ];
      expect(cx * base.scale + base.dx).toBeCloseTo(100, 6);
      expect(cy * base.scale + base.dy).toBeCloseTo(140, 6);
    });

    it('falls back to the default on a frame it cannot use', () => {
      for (const frame of [
        { center: [99, 8], scale: 0 },
        { center: [99, 8], scale: -2 },
        { center: [99, 8], scale: NaN },
        { center: [99, 8], scale: Infinity },
        { center: [NaN, 8], scale: 2 },
      ] as { center: [number, number]; scale: number }[]) {
        const fit = fitFrame(th, box, frame, false);
        expect(Number.isFinite(fit.scale + fit.dx + fit.dy)).toBe(true);
        expect(fit.scale).toBeGreaterThan(0);
      }
      expect(fitFrame(th, box, { center: [99, 8], scale: 0 }, false)).toEqual(base);
    });
  });

  it('survives a box with no size and a geometry with no extent', () => {
    for (const b of [
      { w: 0, h: 0 },
      { w: -5, h: 10 },
      { w: NaN, h: 10 },
    ]) {
      const fit = fitFrame(th, b, null, false);
      expect(Number.isFinite(fit.scale + fit.dx + fit.dy)).toBe(true);
      expect(fit.scale).toBeGreaterThan(0);
    }
    const point: MapGeometry = {
      version: 1,
      projection: { ...chooseProjection([0, 0, 1, 1], 'auto'), k: 1, tx: 0, ty: 0 },
      bounds: [
        [5, 5],
        [5, 5],
      ],
      remoteBounds: [
        [5, 5],
        [5, 5],
      ],
      paths: { land: '', outline: '', regions: '', selected: '', neighbours: '', lakes: '' },
    };
    const fit = fitFrame(point, { w: 100, h: 100 }, null, false);
    expect(Number.isFinite(fit.scale + fit.dx + fit.dy)).toBe(true);
    expect(fit.scale).toBeGreaterThan(0);
  });
});
