import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  dpiLevel,
  effectiveDpi,
  exportBox,
  MM_TO_PX,
  mmToPxAtDpi,
  pageBox,
  sideOfElement,
  spineBox,
  spreadSize,
  visibleRect,
} from './geometry';
import { newBook, newElement } from './factory';

const book = newBook({ title: 't' });
const inner = book.spreads[1]!;
const first = book.spreads[0]!;
const last = book.spreads[book.spreads.length - 1]!;
const spineBook = { ...newBook({ title: 's' }), spineWidth: 10 };
const px = { w: 6000, h: 4000 };
const sq = { w: 100, h: 100 };

describe('page geometry', () => {
  it('spreadSize', () => {
    expect(MM_TO_PX).toBeCloseTo(3.7795, 4);
    expect(spreadSize(book, inner)).toEqual({ w: 420, h: 297 });
    expect(spreadSize(spineBook, spineBook.cover)).toEqual({ w: 430, h: 297 });
  });
  it('pageBox', () => {
    expect(pageBox(book, inner, 'left')).toEqual({ x: 0, y: 0, w: 210, h: 297 });
    expect(pageBox(book, inner, 'right')).toEqual({ x: 210, y: 0, w: 210, h: 297 });
    expect(pageBox(book, first, 'left')).toBeNull();
    expect(pageBox(book, first, 'right')).not.toBeNull();
    expect(pageBox(book, last, 'right')).toBeNull();
    expect(pageBox(spineBook, spineBook.cover, 'left')).toEqual({ x: 0, y: 0, w: 210, h: 297 });
    expect(pageBox(spineBook, spineBook.cover, 'right')?.x).toBe(220);
    expect(spineBox(spineBook)).toEqual({ x: 210, y: 0, w: 10, h: 297 });
  });
  it('exportBox', () => {
    expect(exportBox(book, inner, 'right', true)).toEqual({ x: 207, y: -3, w: 216, h: 303 });
    expect(exportBox(book, inner, 'right', false)).toEqual({ x: 210, y: 0, w: 210, h: 297 });
    const b = { ...spineBook, coverBleed: 5 };
    expect(exportBox(b, b.cover, 'left', true)).toEqual({ x: -5, y: -5, w: 220, h: 307 });
    expect(() => exportBox(book, first, 'left', true)).toThrow(RangeError);
  });
  it('sideOfElement', () => {
    const el = (x: number) => newElement('shape', { x, y: 0, w: 20, h: 20 });
    expect(sideOfElement(book, inner, el(190))).toBe('left'); // centre 200
    expect(sideOfElement(book, inner, el(200))).toBe('right'); // centre 210 = spine
    expect(sideOfElement(spineBook, spineBook.cover, el(190))).toBe('left');
    expect(sideOfElement(spineBook, spineBook.cover, el(200))).toBe('right'); // centre 210 = W
    expect(sideOfElement(spineBook, spineBook.cover, el(210))).toBe('right'); // spine zone
  });
  it('boundingBox', () => {
    const e = newElement('shape', { x: 0, y: 0, w: 100, h: 50 });
    e.rotation = 90;
    const b = boundingBox(e);
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
    expect(b.x + b.w / 2).toBeCloseTo(50);
    expect(b.y + b.h / 2).toBeCloseTo(25);
  });
});

describe('crop and dpi', () => {
  it('visibleRect', () => {
    expect(visibleRect(px, sq, { scale: 1, cx: 0.5, cy: 0.5 })).toEqual({
      sx: 1000,
      sy: 0,
      sw: 4000,
      sh: 4000,
    });
    expect(visibleRect(px, sq, { scale: 2, cx: 0.5, cy: 0.5 })).toEqual({
      sx: 2000,
      sy: 1000,
      sw: 2000,
      sh: 2000,
    });
    expect(visibleRect(px, sq, { scale: 1, cx: 0, cy: 0.5 }).sx).toBe(0);
    expect(visibleRect(px, sq, { scale: 1, cx: 1, cy: 0.5 }).sx).toBe(2000);
    // portrait frame on landscape image, and tall image on wide frame
    expect(visibleRect(px, { w: 50, h: 100 }, { scale: 1, cx: 0.5, cy: 0.5 })).toEqual({
      sx: 1000 + 1000,
      sy: 0,
      sw: 2000,
      sh: 4000,
    });
    expect(
      visibleRect({ w: 1000, h: 3000 }, { w: 100, h: 50 }, { scale: 1, cx: 0.5, cy: 0.5 }),
    ).toEqual({ sx: 0, sy: 1000 + 250, sw: 1000, sh: 500 });
  });
  it('effectiveDpi', () => {
    expect(effectiveDpi(px, sq, { scale: 1, cx: 0.5, cy: 0.5 })).toBe(1016);
    expect(effectiveDpi(px, sq, { scale: 2, cx: 0.5, cy: 0.5 })).toBe(508);
  });
  it('dpiLevel', () => {
    const s = book.settings;
    expect(dpiLevel(200, s)).toBe('ok');
    expect(dpiLevel(250, s)).toBe('good');
    expect(dpiLevel(150, s)).toBe('ok');
    expect(dpiLevel(149, s)).toBe('low');
  });
  it('mmToPxAtDpi', () => {
    expect(mmToPxAtDpi(216, 300)).toBe(2551);
  });
});
