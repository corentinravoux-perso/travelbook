import { layoutTemplate, type Template } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { polygonPoints, thumbOf } from './thumbModel';

const box = { w: 210, h: 297 };
const params = { margin: 10, gap: 4 };
const base = {
  id: 'b-x',
  name: 'X',
  category: 'photos',
  scope: 'page',
  origin: 'bundled',
} as const;

describe('thumbOf', () => {
  it('draws the frames layoutTemplate gives, for the margin and gap asked', () => {
    const t: Template = {
      ...base,
      photoCount: 2,
      grid: {
        root: { split: 'row', weights: [1, 1], children: [{ slot: 'photo' }, { slot: 'photo' }] },
        fullBleed: false,
      },
    };
    const thumb = thumbOf(t, box, 3, params);
    const expected = layoutTemplate(t, { x: 0, y: 0, ...box }, 3, params);
    expect(thumb.slots.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(
      expected.map(({ x, y, w, h }) => ({ x, y, w, h })),
    );
    expect(thumb.slots.every((s) => s.kind === 'photo' && !s.round)).toBe(true);
    const wider = thumbOf(t, box, 3, { margin: 30, gap: 20 });
    expect(wider.slots[0]!.w).toBeLessThan(thumb.slots[0]!.w);
    expect(thumb).toMatchObject({ w: 210, h: 297, background: null, decorations: [] });
  });

  it('a full-bleed grid grows past the page by the bleed, and a spread template uses two pages', () => {
    const t: Template = {
      ...base,
      scope: 'spread',
      category: 'double',
      photoCount: 1,
      grid: { root: { slot: 'photo' }, fullBleed: true },
    };
    const thumb = thumbOf(t, { w: 420, h: 297 }, 3, params);
    expect(thumb.slots[0]).toMatchObject({ x: -3, y: -3, w: 426, h: 303 });
    expect(thumb.w).toBe(420);
  });

  it('keeps rotation, round masks and the text roles of a free template, with lines to draw', () => {
    const t: Template = {
      ...base,
      photoCount: 3,
      free: {
        slots: [
          {
            kind: 'photo',
            x: 0.1,
            y: 0.1,
            w: 0.4,
            h: 0.3,
            rotation: -4,
            mask: { kind: 'ellipse' },
          },
          {
            kind: 'photo',
            x: 0.5,
            y: 0.1,
            w: 0.3,
            h: 0.3,
            rotation: 0,
            mask: { kind: 'preset', preset: 'heart' },
          },
          {
            kind: 'photo',
            x: 0.1,
            y: 0.5,
            w: 0.3,
            h: 0.3,
            rotation: 0,
            mask: { kind: 'preset', preset: 'arch' },
          },
          { kind: 'text', x: 0.1, y: 0.85, w: 0.8, h: 0.05, rotation: 0, textRole: 'title' },
          { kind: 'text', x: 0.1, y: 0.2, w: 0.8, h: 0.3, rotation: 0, textRole: 'body' },
        ],
        decorations: [],
      },
    };
    const { slots } = thumbOf(t, box, 3, params);
    const photos = slots.filter((s) => s.kind === 'photo');
    expect(photos.map((s) => s.round).sort()).toEqual([false, true, true]);
    expect(photos.find((s) => s.rotation === -4)).toBeTruthy();
    const title = slots.find((s) => s.textRole === 'title')!;
    expect(title.lines).toHaveLength(1);
    const body = slots.find((s) => s.textRole === 'body')!;
    expect(body.lines.length).toBeGreaterThan(3);
    expect(body.lines.every((y) => y > body.y && y < body.y + body.h)).toBe(true);
  });

  it('scales decorations to the box and carries the background of the template', () => {
    const t: Template = {
      ...base,
      photoCount: 0,
      background: { kind: 'color', color: '#eadcc4' },
      free: {
        slots: [],
        decorations: [
          {
            id: 'd1',
            type: 'shape',
            x: 0.1,
            y: 0.2,
            w: 0.5,
            h: 0.25,
            rotation: 7,
            opacity: 0.5,
            locked: false,
            hidden: false,
            shape: 'ellipse',
            fill: '#f2c46d',
            stroke: null,
            radius: 0,
            points: 5,
          },
          {
            id: 'd2',
            type: 'sticker',
            x: 0,
            y: 0,
            w: 0.1,
            h: 0.1,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            assetId: 'a',
            flipH: false,
            flipV: false,
            tint: null,
          },
        ],
      },
    };
    const thumb = thumbOf(t, box, 3, params);
    expect(thumb.background).toEqual({ kind: 'color', color: '#eadcc4' });
    // A sticker is an asset the tile cannot draw: only shapes are kept.
    expect(thumb.decorations).toHaveLength(1);
    const [d] = thumb.decorations;
    expect([d!.x, d!.y, d!.w, d!.h].map((v) => Math.round(v * 100) / 100)).toEqual([
      21, 59.4, 105, 74.25,
    ]);
    expect(d).toMatchObject({ rotation: 7, opacity: 0.5, fill: '#f2c46d', shape: 'ellipse' });
  });
});

describe('polygonPoints', () => {
  it('draws a triangle tip up inside its box', () => {
    const pts = polygonPoints({ x: 0, y: 0, w: 100, h: 100, points: 3, shape: 'polygon' }).split(
      ' ',
    );
    expect(pts).toHaveLength(3);
    expect(pts[0]).toBe('50,0');
  });
  it('a star has twice as many corners as points', () => {
    const pts = polygonPoints({ x: 0, y: 0, w: 10, h: 10, points: 5, shape: 'star' }).split(' ');
    expect(pts).toHaveLength(10);
  });
});
