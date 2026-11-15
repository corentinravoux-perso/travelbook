import { ElementSchema } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { SHAPE_KINDS, drawnShape } from './shapeActions';

describe('drawnShape', () => {
  it('makes a valid element of every kind', () => {
    for (const kind of SHAPE_KINDS) {
      const el = drawnShape(kind, { x: 10, y: 10 }, { x: 60, y: 40 }, true);
      expect(ElementSchema.safeParse(el).success).toBe(true);
      expect(el.shape).toBe(kind);
    }
  });

  it('draws a box from its two corners, whichever way the pointer went', () => {
    const el = drawnShape('rect', { x: 60, y: 40 }, { x: 10, y: 10 }, true);
    expect([el.x, el.y, el.w, el.h]).toEqual([10, 10, 50, 30]);
  });

  it('gives a click a default size, at the point clicked', () => {
    const el = drawnShape('ellipse', { x: 20, y: 30 }, { x: 20, y: 30 }, false);
    expect([el.x, el.y, el.w, el.h]).toEqual([20, 30, 40, 40]);
  });

  it('draws a line along the two points, turned to follow them', () => {
    const el = drawnShape('line', { x: 0, y: 0 }, { x: 0, y: 20 }, true);
    expect(el.w).toBe(20);
    expect(el.rotation).toBe(90);
    expect(el.fill).toBeNull();
    expect(el.stroke).not.toBeNull();
  });

  it('gives an arrow a head as high as its box', () => {
    const el = drawnShape('arrow', { x: 0, y: 0 }, { x: 30, y: 0 }, true);
    expect(el.h).toBe(6);
    expect(el.w).toBe(30);
  });

  it('starts a polygon as a hexagon and a star with five branches', () => {
    const at = { x: 0, y: 0 };
    expect(drawnShape('polygon', at, at, false).points).toBe(6);
    expect(drawnShape('star', at, at, false).points).toBe(5);
  });
});
