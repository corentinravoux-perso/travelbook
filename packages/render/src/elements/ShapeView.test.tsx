import { render } from '@testing-library/react';
import { MM_TO_PX, type ShapeElement } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { shape } from '../test-helpers';
import { ShapeView } from './ShapeView';

function draw(patch: Partial<ShapeElement>, rect = { x: 0, y: 0, w: 40, h: 20 }) {
  const { container } = render(<ShapeView el={shape(rect, patch)} />);
  const svg = container.querySelector('svg');
  const q = <T extends Element>(s: string) => container.querySelector<T>(s);
  return { svg, q, group: q<SVGGElement>('svg > g') };
}

const attr = (node: Element | null | undefined, name: string): string | null | undefined =>
  node?.getAttribute(name);
const nums = (node: Element | null | undefined, names: string[]): (number | undefined)[] =>
  names.map((n) => {
    const v = node?.getAttribute(n);
    return v === null || v === undefined ? undefined : Number(v);
  });

describe('ShapeView', () => {
  it('is an SVG as large as the element, with user units in mm', () => {
    const { svg, group } = draw({});
    expect(svg?.style.width).toBe('100%');
    expect(svg?.style.height).toBe('100%');
    expect(svg?.style.overflow).toBe('visible');
    expect(attr(group, 'transform')).toBe(`scale(${MM_TO_PX})`);
  });

  describe('rect', () => {
    it('fills the box, with a corner radius', () => {
      const { q } = draw({ shape: 'rect', fill: '#ff0000', stroke: null, radius: 3 });
      const rect = q('rect');
      expect(nums(rect, ['x', 'y', 'width', 'height', 'rx'])).toEqual([0, 0, 40, 20, 3]);
      expect(attr(rect, 'fill')).toBe('#ff0000');
      expect(attr(rect, 'stroke')).toBe('none');
    });

    it('keeps the stroke inside the box: the rect is inset by half the stroke width', () => {
      const { q } = draw({
        shape: 'rect',
        fill: null,
        stroke: { width: 2, color: '#00ff00' },
        radius: 4,
      });
      const rect = q('rect');
      expect(nums(rect, ['x', 'y', 'width', 'height', 'rx'])).toEqual([1, 1, 38, 18, 3]);
      expect(attr(rect, 'fill')).toBe('none');
      expect(attr(rect, 'stroke')).toBe('#00ff00');
      expect(attr(rect, 'stroke-width')).toBe('2');
    });

    it('never rounds more than half the shorter side', () => {
      const { q } = draw({ shape: 'rect', fill: '#000', radius: 100 });
      expect(attr(q('rect'), 'rx')).toBe('10');
    });
  });

  it('draws an ellipse as large as the box', () => {
    const { q } = draw({ shape: 'ellipse', fill: '#123456', stroke: { width: 1, color: '#fff' } });
    expect(nums(q('ellipse'), ['cx', 'cy', 'rx', 'ry'])).toEqual([20, 10, 19.5, 9.5]);
    expect(attr(q('ellipse'), 'fill')).toBe('#123456');
  });

  it('draws a line across the middle of the box with the stroke', () => {
    const { q } = draw({
      shape: 'line',
      fill: '#abcdef',
      stroke: { width: 1.5, color: '#000000' },
    });
    const line = q('line');
    expect(nums(line, ['x1', 'y1', 'x2', 'y2'])).toEqual([0, 10, 40, 10]);
    expect(attr(line, 'stroke')).toBe('#000000');
    expect(attr(line, 'stroke-width')).toBe('1.5');
    expect(attr(line, 'stroke-linecap')).toBe('butt');
  });

  it('draws a line of zero height', () => {
    const { q } = draw(
      { shape: 'line', stroke: { width: 1, color: '#000' } },
      { x: 0, y: 0, w: 40, h: 0 },
    );
    expect(nums(q('line'), ['y1', 'y2'])).toEqual([0, 0]);
  });

  it('draws nothing for a line that has no stroke', () => {
    const { group } = draw({ shape: 'line', fill: '#ff0000', stroke: null });
    expect(group?.childElementCount).toBe(0);
  });

  it('draws an arrow as a shaft and a head at the right end', () => {
    const { q } = draw({ shape: 'arrow', stroke: { width: 1, color: '#102030' } });
    const shaft = q('line');
    const head = q('polygon');
    // Head as long as the box is tall; the shaft stops where the head starts.
    expect(nums(shaft, ['x1', 'y1', 'x2', 'y2'])).toEqual([0, 10, 20, 10]);
    expect(attr(head, 'points')).toBe('40,10 20,0 20,20');
    expect(attr(head, 'fill')).toBe('#102030');
    expect(attr(shaft, 'stroke')).toBe('#102030');
  });

  it('draws an arrow in a box shorter than its head with a head as long as the box', () => {
    const { q } = draw(
      { shape: 'arrow', stroke: { width: 1, color: '#000' } },
      { x: 0, y: 0, w: 10, h: 30 },
    );
    expect(attr(q('polygon'), 'points')).toBe('10,15 0,0 0,30');
    expect(nums(q('line'), ['x2'])).toEqual([0]);
  });

  it('draws a regular polygon with one vertex at the top, inscribed in the box', () => {
    const { q } = draw({ shape: 'polygon', points: 4, fill: '#888' }, { x: 0, y: 0, w: 20, h: 20 });
    const points = (attr(q('polygon'), 'points') ?? '')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual([10, 0]);
    expect(points[1]?.[0]).toBeCloseTo(20, 3);
    expect(points[1]?.[1]).toBeCloseTo(10, 3);
    expect(points[2]?.[0]).toBeCloseTo(10, 3);
    expect(points[2]?.[1]).toBeCloseTo(20, 3);
  });

  it('draws a star with twice as many vertices as points, alternating tips and inner corners', () => {
    const { q } = draw({ shape: 'star', points: 6, fill: '#888' }, { x: 0, y: 0, w: 20, h: 20 });
    const points = (attr(q('polygon'), 'points') ?? '')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(12);
    const radius = ([x, y]: number[]) => Math.hypot((x ?? 0) - 10, (y ?? 0) - 10);
    expect(radius(points[0] as number[])).toBeCloseTo(10, 3);
    expect(radius(points[1] as number[])).toBeCloseTo(5, 3);
    expect(radius(points[2] as number[])).toBeCloseTo(10, 3);
  });

  it('uses no fill and no stroke when the element has neither', () => {
    const { q } = draw({ shape: 'rect', fill: null, stroke: null });
    expect(attr(q('rect'), 'fill')).toBe('none');
    expect(attr(q('rect'), 'stroke')).toBe('none');
  });
});
