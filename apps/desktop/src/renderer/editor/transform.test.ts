import { newBook, newElement, type Element, type Spread } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { describe, expect, it } from 'vitest';
import {
  elementAt,
  enclosedBy,
  isCorner,
  keepsRatioOnCorners,
  resizeRect,
  rotateAbout,
  scaleWith,
  snapAngle,
  withGroups,
  angleFrom,
} from './transform';

const box = (x: number, y: number, w: number, h: number, patch: Partial<Element> = {}): Element =>
  ({
    ...newElement('shape', { x, y, w, h }),
    ...patch,
  }) as Element;

const spreadOf = (elements: Element[]): Spread => ({
  ...newBook({ title: 't' }).spreads[0]!,
  elements,
});

describe('hit testing', () => {
  it('picks the topmost selectable element', () => {
    const under = box(0, 0, 50, 50);
    const over = box(10, 10, 50, 50);
    const locked = box(0, 0, 100, 100, { locked: true });
    const hidden = box(0, 0, 100, 100, { hidden: true });
    const spread = spreadOf([under, over, locked, hidden]);
    expect(elementAt(spread, { x: 20, y: 20 })?.id).toBe(over.id);
    expect(elementAt(spread, { x: 5, y: 5 })?.id).toBe(under.id);
    expect(elementAt(spread, { x: 90, y: 90 })).toBeUndefined();
  });

  it('hits a rotated frame where it is, not where its unrotated box was', () => {
    const el = box(0, 0, 100, 10, { rotation: 90 });
    const spread = spreadOf([el]);
    expect(elementAt(spread, { x: 50, y: 45 })?.id).toBe(el.id);
    expect(elementAt(spread, { x: 90, y: 5 })).toBeUndefined();
  });

  it('selects the group with one of its members', () => {
    const a = box(0, 0, 10, 10, { groupId: 'g' });
    const b = box(50, 0, 10, 10, { groupId: 'g' });
    const c = box(90, 0, 10, 10);
    expect(withGroups(spreadOf([a, b, c]), [a.id])).toEqual([a.id, b.id]);
  });
});

describe('marquee', () => {
  it('takes the elements it encloses, not those it only touches', () => {
    const inside = box(10, 10, 20, 20);
    const touching = box(80, 10, 40, 20);
    const outside = box(200, 200, 10, 10);
    const locked = box(15, 15, 5, 5, { locked: true });
    const got = enclosedBy(spreadOf([inside, touching, outside, locked]), {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    });
    expect(got).toEqual([inside.id]);
  });
});

describe('resizeRect', () => {
  const r = { x: 10, y: 10, w: 40, h: 20 };
  it('moves only the dragged edges', () => {
    expect(resizeRect(r, 'e', 10, 99, false)).toEqual({ x: 10, y: 10, w: 50, h: 20 });
    expect(resizeRect(r, 'nw', 5, 5, false)).toEqual({ x: 15, y: 15, w: 35, h: 15 });
  });
  it('keeps the ratio on a corner, following the larger change', () => {
    const out = resizeRect(r, 'se', 20, 1, true);
    expect(out.w / out.h).toBeCloseTo(2);
    expect(out).toMatchObject({ x: 10, y: 10, w: 60, h: 30 });
  });
  it('keeps the ratio from an edge, growing about the centre', () => {
    expect(resizeRect(r, 'e', 20, 0, true)).toEqual({ x: 10, y: 5, w: 60, h: 30 });
  });
  it('never goes under the minimum size', () => {
    expect(resizeRect(r, 'w', 100, 0, false).w).toBe(2);
    expect(resizeRect(r, 'se', -100, -100, true).h).toBeGreaterThanOrEqual(2);
  });
});

describe('resizing a map', () => {
  it('keeps no ratio on a corner: a map shows more context, it is never a picture to scale', () => {
    expect(keepsRatioOnCorners(mapElement())).toBe(false);
    // photos and stickers still do
    expect(keepsRatioOnCorners(newElement('photo', { x: 0, y: 0, w: 10, h: 10 }))).toBe(true);
    expect(keepsRatioOnCorners(newElement('sticker', { x: 0, y: 0, w: 10, h: 10 }))).toBe(true);
  });

  it('changes the width and the height independently from a corner', () => {
    const map = mapElement();
    const start = { x: map.x, y: map.y, w: map.w, h: map.h };
    const keep = isCorner('se') && keepsRatioOnCorners(map);
    expect(resizeRect(start, 'se', 40, -30, keep)).toEqual({
      x: map.x,
      y: map.y,
      w: map.w + 40,
      h: map.h - 30,
    });
  });
});

describe('rotation', () => {
  it('measures angles clockwise from up', () => {
    expect(angleFrom({ x: 0, y: 0 }, { x: 0, y: -5 })).toBeCloseTo(0);
    expect(angleFrom({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(90);
  });
  it('snaps to a step', () => {
    expect(snapAngle(37, 15)).toBe(30);
    expect(snapAngle(38, 15)).toBe(45);
  });
  it('turns one element about its own centre', () => {
    const el = box(10, 10, 20, 10);
    const [t] = rotateAbout([el], { x: 20, y: 15 }, 40.3, 15);
    expect(t).toMatchObject({ id: el.id, x: 10, y: 10, rotation: 45 });
  });
  it('orbits several elements about the pivot', () => {
    const el = box(10, 0, 10, 10);
    const [t] = rotateAbout([el, box(0, 0, 1, 1)], { x: 0, y: 5 }, 90);
    expect(t).toMatchObject({ rotation: 90 });
    expect(t!.x! + 5).toBeCloseTo(0); // centre (15, 5) turns to (0, 20)
    expect(t!.y! + 5).toBeCloseTo(20);
  });
});

describe('scaleWith', () => {
  it('stretches positions and sizes with the box', () => {
    const el = box(10, 10, 10, 10);
    const [t] = scaleWith([el], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 50 });
    expect(t).toMatchObject({ x: 20, y: 5, w: 20, h: 5 });
  });
});
