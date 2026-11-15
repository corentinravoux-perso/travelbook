import { describe, expect, it } from 'vitest';
import { constrainBox, constrainLine, lineBox } from './draw';

describe('constrainBox', () => {
  it('leaves the end alone without Shift and makes a square with it, in any direction', () => {
    expect(constrainBox({ x: 0, y: 0 }, { x: 10, y: 4 }, false)).toEqual({ x: 10, y: 4 });
    expect(constrainBox({ x: 0, y: 0 }, { x: 10, y: 4 }, true)).toEqual({ x: 10, y: 10 });
    expect(constrainBox({ x: 5, y: 5 }, { x: 1, y: 4 }, true)).toEqual({ x: 1, y: 1 });
  });
});

describe('constrainLine', () => {
  it('snaps to 15 degrees keeping the length', () => {
    const to = constrainLine({ x: 0, y: 0 }, { x: 10, y: 0.5 }, true);
    expect(to.x).toBeCloseTo(Math.hypot(10, 0.5));
    expect(to.y).toBeCloseTo(0);
  });
  it('is free without Shift', () => {
    expect(constrainLine({ x: 0, y: 0 }, { x: 3, y: 1 }, false)).toEqual({ x: 3, y: 1 });
  });
});

describe('lineBox', () => {
  it('is centred on the middle of the segment, as long as it, turned along it', () => {
    const { rect, rotation } = lineBox({ x: 10, y: 20 }, { x: 40, y: 20 }, 3);
    expect(rect).toEqual({ x: 10, y: 18.5, w: 30, h: 3 });
    expect(rotation).toBe(0);
  });
  it('turns clockwise for a segment going down', () => {
    const { rect, rotation } = lineBox({ x: 0, y: 0 }, { x: 0, y: 10 }, 2);
    expect(rotation).toBe(90);
    expect(rect.w).toBe(10);
    expect(rect.x).toBe(-5);
    expect(rect.y).toBe(4);
  });
});
