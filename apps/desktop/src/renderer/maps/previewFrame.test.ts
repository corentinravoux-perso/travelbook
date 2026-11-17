import { chooseProjection, fitFrame, type MapGeometry } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, panFrame, zoomFrame } from './previewFrame';

const geometry: MapGeometry = {
  version: 1,
  projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
  bounds: [
    [0, 0],
    [1000, 600],
  ],
  remoteBounds: [
    [0, 0],
    [2000, 900],
  ],
  paths: { land: '', outline: '', regions: '', selected: '', neighbours: '', lakes: '' },
};
const box = { w: 120, h: 160 };

describe('panFrame', () => {
  it('moves the land with the pointer, by the same number of mm', () => {
    const before = fitFrame(geometry, box, null, false);
    const frame = panFrame(geometry, box, null, false, 12, -5);
    const after = fitFrame(geometry, box, frame, false);
    expect(after.scale).toBeCloseTo(before.scale, 9);
    expect(after.dx - before.dx).toBeCloseTo(12, 6);
    expect(after.dy - before.dy).toBeCloseTo(-5, 6);
  });

  it('adds up over several moves and keeps the zoom', () => {
    const zoomed = { center: [10, 20] as [number, number], scale: 3 };
    const once = panFrame(geometry, box, zoomed, false, 4, 4);
    const twice = panFrame(geometry, box, once, false, 4, 4);
    const base = fitFrame(geometry, box, zoomed, false);
    const end = fitFrame(geometry, box, twice, false);
    expect(twice.scale).toBeCloseTo(3, 9);
    expect(end.dx - base.dx).toBeCloseTo(8, 6);
    expect(end.dy - base.dy).toBeCloseTo(8, 6);
  });
});

describe('zoomFrame', () => {
  it('keeps the point under the pointer where it is', () => {
    const at: [number, number] = [90, 40];
    const before = fitFrame(geometry, box, null, false);
    const unit = [(at[0] - before.dx) / before.scale, (at[1] - before.dy) / before.scale];
    const frame = zoomFrame(geometry, box, null, false, 2, at);
    const after = fitFrame(geometry, box, frame, false);
    expect(after.scale).toBeCloseTo(before.scale * 2, 9);
    expect(unit[0]! * after.scale + after.dx).toBeCloseTo(at[0], 6);
    expect(unit[1]! * after.scale + after.dy).toBeCloseTo(at[1], 6);
    expect(frame.scale).toBeCloseTo(2, 9);
  });

  it('stays within the zoom limits', () => {
    let frame = zoomFrame(geometry, box, null, false, 1e9, [60, 80]);
    expect(frame.scale).toBe(MAX_ZOOM);
    frame = zoomFrame(geometry, box, null, false, 1e-9, [60, 80]);
    expect(frame.scale).toBe(MIN_ZOOM);
  });

  it('is relative to the default fit of the box, remote parts included when asked', () => {
    const frame = zoomFrame(geometry, box, null, true, 1.5, [60, 80]);
    expect(frame.scale).toBeCloseTo(1.5, 9);
    const fit = fitFrame(geometry, box, frame, true);
    expect(fit.scale).toBeCloseTo(fitFrame(geometry, box, null, true).scale * 1.5, 9);
  });
});

describe('a frame on a projection rotated across the antimeridian (Fiji)', () => {
  const fiji: MapGeometry = {
    ...geometry,
    projection: { ...chooseProjection([177, -21, -178, -16], 'auto'), k: 900, tx: 500, ty: 300 },
  };

  it('pan then fitFrame moves the land by the dragged distance', () => {
    const before = fitFrame(fiji, box, null, false);
    const frame = panFrame(fiji, box, null, false, 20, 10);
    expect(frame.center.every(Number.isFinite)).toBe(true);
    const after = fitFrame(fiji, box, frame, false);
    expect(after.scale).toBeCloseTo(before.scale, 8);
    expect(after.dx - before.dx).toBeCloseTo(20, 4);
    expect(after.dy - before.dy).toBeCloseTo(10, 4);
  });

  it('zoom about a point keeps it fixed, after a pan that crossed 180 degrees', () => {
    const panned = panFrame(fiji, box, null, false, -400, 0);
    const at: [number, number] = [30, 50];
    const before = fitFrame(fiji, box, panned, false);
    const unit = [(at[0] - before.dx) / before.scale, (at[1] - before.dy) / before.scale];
    const frame = zoomFrame(fiji, box, panned, false, 3, at);
    const after = fitFrame(fiji, box, frame, false);
    expect(unit[0]! * after.scale + after.dx).toBeCloseTo(at[0], 4);
    expect(unit[1]! * after.scale + after.dy).toBeCloseTo(at[1], 4);
  });
});
