import { visibleRect } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { MAX_SCALE, clampCrop, dimClip, panCrop, zoomCrop } from './cropMath';

const pixel = { w: 4000, h: 3000 };
const wide = { w: 200, h: 100 }; // frame ratio 2, the image 1.333: limited by width
const tall = { w: 100, h: 200 };
const none = { h: false, v: false };

describe('clampCrop', () => {
  it('keeps the scale within 1 and 8', () => {
    expect(clampCrop(pixel, wide, { scale: 0.2, cx: 0.5, cy: 0.5 }).scale).toBe(1);
    expect(clampCrop(pixel, wide, { scale: 50, cx: 0.5, cy: 0.5 }).scale).toBe(MAX_SCALE);
  });
  it('pulls the centre in so that the window stays inside the image', () => {
    const crop = clampCrop(pixel, wide, { scale: 2, cx: 0.99, cy: 0.01 });
    const { sx, sy, sw, sh } = visibleRect(pixel, wide, crop);
    expect(sx + sw).toBeLessThanOrEqual(pixel.w + 1e-6);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sh).toBeGreaterThan(0);
    expect(crop.cx).toBeLessThan(0.99);
    expect(crop.cy).toBeGreaterThan(0.01);
  });
  it('centres an axis the image does not overflow', () => {
    // At scale 1 in a wide frame the full width shows: no slack along x.
    expect(clampCrop(pixel, wide, { scale: 1, cx: 0.9, cy: 0.5 }).cx).toBe(0.5);
  });
  it('gives a valid crop for a frame without size', () => {
    expect(clampCrop(pixel, { w: 0, h: 10 }, { scale: 2, cx: 0.3, cy: 0.3 })).toEqual({
      scale: 2,
      cx: 0.5,
      cy: 0.5,
    });
  });
});

describe('panCrop', () => {
  it('moves the window against the drag, scaled to the frame', () => {
    // Scale 2 in a wide frame: the window is 2000 px wide for 200 mm, so 10 mm are 100 px.
    const start = { scale: 2, cx: 0.5, cy: 0.5 };
    const moved = panCrop(pixel, wide, start, 10, 0, none);
    expect(moved.cx).toBeCloseTo(0.5 - 100 / 4000, 4);
    expect(moved.cy).toBe(0.5);
    const down = panCrop(pixel, wide, start, 0, 10, none);
    // The window is 2000 x 1000 px for 200 x 100 mm: 10 mm are 100 px either way.
    expect(down.cy).toBeCloseTo(0.5 - 100 / 3000, 4);
  });
  it('goes the same way as the pointer on a flipped axis', () => {
    const start = { scale: 2, cx: 0.5, cy: 0.5 };
    expect(panCrop(pixel, wide, start, 10, 0, { h: true, v: false }).cx).toBeCloseTo(
      0.5 + 100 / 4000,
      4,
    );
    expect(panCrop(pixel, wide, start, 0, 10, { h: false, v: true }).cy).toBeCloseTo(
      0.5 + 100 / 3000,
      4,
    );
  });
  it('stops at the edge of the image', () => {
    const start = { scale: 2, cx: 0.5, cy: 0.5 };
    const far = panCrop(pixel, wide, start, -10_000, 10_000, none);
    const { sx, sy, sw, sh } = visibleRect(pixel, wide, far);
    expect(sx + sw).toBeCloseTo(pixel.w, 0);
    expect(sy).toBeCloseTo(0, 0);
    expect(sh).toBeCloseTo(1000, 0);
  });
  it('cannot move an axis the image fills', () => {
    const start = { scale: 1, cx: 0.5, cy: 0.5 };
    expect(panCrop(pixel, wide, start, 50, 0, none).cx).toBe(0.5);
    // In a tall frame the height is the limit: the image overflows along x.
    expect(panCrop(pixel, tall, start, 0, 50, none).cy).toBe(0.5);
    expect(panCrop(pixel, tall, start, 20, 0, none).cx).toBeLessThan(0.5);
  });
});

describe('zoomCrop', () => {
  it('zooms about the same centre', () => {
    const crop = zoomCrop(pixel, wide, { scale: 1, cx: 0.5, cy: 0.5 }, 2);
    expect(crop).toEqual({ scale: 2, cx: 0.5, cy: 0.5 });
  });
  it('moves the centre back inside the image when zooming out', () => {
    const zoomedIn = panCrop(pixel, wide, { scale: 4, cx: 0.5, cy: 0.5 }, -1000, 0, none);
    const out = zoomCrop(pixel, wide, zoomedIn, 1);
    expect(out.cx).toBe(0.5);
  });
});

describe('dimClip', () => {
  it('cuts the window of the frame out of the full image', () => {
    const clip = dimClip(pixel, wide, { scale: 1, cx: 0.5, cy: 0.5 });
    // Wide frame, image 4:3: the window is all the width and 3000 * (4/3)/2 = 2000 px of height.
    expect(clip).toBe(
      'polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 0% 16.6667%, 0% 83.3333%, 100% 83.3333%, 100% 16.6667%, 0% 16.6667%)',
    );
  });
});
