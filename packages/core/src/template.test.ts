import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { newElement } from './factory';
import {
  TemplateSchema,
  layoutTemplate,
  type FreeSlot,
  type LayoutNode,
  type Template,
} from './template';

const box = { x: 0, y: 0, w: 210, h: 297 };
const photo: LayoutNode = { slot: 'photo' };

function grid(root: LayoutNode, photoCount: number, fullBleed = false): Template {
  return {
    id: 't',
    name: 'Test',
    category: 'photos',
    scope: 'page',
    photoCount,
    origin: 'bundled',
    grid: { root, fullBleed },
  };
}

function expectRect(r: object, e: { x: number; y: number; w: number; h: number }): void {
  const g = r as Record<string, number>;
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(g[k]).toBeCloseTo(e[k], 9);
}

describe('layoutTemplate', () => {
  it('one photo slot fills the box minus the margin', () => {
    const out = layoutTemplate(grid(photo, 1), box, 3, { margin: 10, gap: 4 });
    expect(out).toHaveLength(1);
    expectRect(out[0]!, { x: 10, y: 10, w: 190, h: 277 });
    expect(out[0]).toMatchObject({ kind: 'photo', rotation: 0 });
  });

  it('row of two photos splits by weight with a gap', () => {
    const t = grid({ split: 'row', weights: [1, 1], children: [photo, photo] }, 2);
    const out = layoutTemplate(t, box, 3, { margin: 10, gap: 4 });
    expectRect(out[0]!, { x: 10, y: 10, w: 93, h: 277 });
    expectRect(out[1]!, { x: 107, y: 10, w: 93, h: 277 });
  });

  it('col [2,1] with a nested row gives three slots in reading order', () => {
    const t = grid(
      {
        split: 'col',
        weights: [2, 1],
        children: [{ split: 'row', weights: [1, 1], children: [photo, photo] }, photo],
      },
      3,
    );
    const out = layoutTemplate(t, box, 3, { margin: 10, gap: 4 });
    expect(out).toHaveLength(3);
    expect(out[0]!.x).toBeLessThan(out[1]!.x);
    expect(out[0]!.y).toBeCloseTo(out[1]!.y, 9);
    expect(out[2]!.y).toBeGreaterThan(out[0]!.y);
    expect(out[0]!.h / out[2]!.h).toBeCloseTo(2, 9);
    expect(out[0]!.h + out[2]!.h + 4).toBeCloseTo(277, 9);
  });

  it('fullBleed ignores the margin and grows by the bleed', () => {
    const out = layoutTemplate(grid(photo, 1, true), box, 3, { margin: 10, gap: 4 });
    expectRect(out[0]!, { x: -3, y: -3, w: 216, h: 303 });
  });

  it('free slot maps 0..1 onto the box and keeps rotation, role and mask', () => {
    const t: Template = {
      id: 'f',
      name: 'Libre',
      category: 'photos',
      scope: 'page',
      photoCount: 1,
      origin: 'bundled',
      free: {
        slots: [
          {
            kind: 'photo',
            x: 0.1,
            y: 0.2,
            w: 0.5,
            h: 0.25,
            rotation: -4,
            mask: { kind: 'ellipse' },
          },
        ],
        decorations: [],
      },
    };
    const out = layoutTemplate(t, box, 3, { margin: 10, gap: 4 });
    expectRect(out[0]!, { x: 21, y: 59.4, w: 105, h: 74.25 });
    expect(out[0]).toMatchObject({ rotation: -4, mask: { kind: 'ellipse' } });
  });

  it('free slots are sorted in reading order with a 0.5 mm row tolerance', () => {
    const s = (x: number, y: number): FreeSlot => ({
      kind: 'photo',
      x,
      y,
      w: 0.1,
      h: 0.1,
      rotation: 0,
    });
    const t: Template = {
      id: 'f',
      name: 'Libre',
      category: 'photos',
      scope: 'page',
      photoCount: 3,
      origin: 'bundled',
      free: { slots: [s(0.6, 0.1), s(0.1, 0.5), s(0.1, 0.1 + 0.3 / 297)], decorations: [] },
    };
    const out = layoutTemplate(t, box, 0, { margin: 0, gap: 0 });
    expect(out.map((r) => Math.round(r.x))).toEqual([21, 126, 21]);
    expect(out[2]!.y).toBeGreaterThan(out[0]!.y + 100);
  });

  it('grid slots of one visual row stay left to right despite float noise in y', () => {
    // With margin 0.3 and gap 0.1 the two columns' second rows differ by ~3e-14 mm in y.
    const col = (w: number): LayoutNode => ({
      split: 'col',
      weights: [w, w],
      children: [photo, photo],
    });
    const t = grid({ split: 'row', weights: [1, 1], children: [col(1), col(7)] }, 4);
    const out = layoutTemplate(t, box, 0, { margin: 0.3, gap: 0.1 });
    expect(out[2]!.y).not.toBe(out[3]!.y);
    expect(out.map((r) => Math.round(r.x))).toEqual([0, 105, 0, 105]);
  });

  it('text slots keep their role', () => {
    const t = grid(
      { split: 'col', weights: [3, 1], children: [photo, { slot: 'text', textRole: 'caption' }] },
      1,
    );
    const out = layoutTemplate(t, box, 0, { margin: 0, gap: 0 });
    expect(out[1]).toMatchObject({ kind: 'text', textRole: 'caption' });
  });
});

describe('TemplateSchema', () => {
  it('accepts a valid grid template', () => {
    expect(TemplateSchema.safeParse(grid(photo, 1)).success).toBe(true);
  });
  it('rejects a split whose weights and children differ in length', () => {
    const t = grid({ split: 'row', weights: [1], children: [photo, photo] }, 2);
    expect(TemplateSchema.safeParse(t).success).toBe(false);
  });
  it('rejects non-positive weights', () => {
    const t = grid({ split: 'row', weights: [1, 0], children: [photo, photo] }, 2);
    expect(TemplateSchema.safeParse(t).success).toBe(false);
  });
  it('rejects a template with neither grid nor free', () => {
    const t: Partial<Template> = grid(photo, 1);
    delete t.grid;
    expect(TemplateSchema.safeParse(t).success).toBe(false);
  });
  it('rejects a template with both grid and free', () => {
    const t = { ...grid(photo, 1), free: { slots: [], decorations: [] } };
    expect(TemplateSchema.safeParse(t).success).toBe(false);
  });
  it('validates decorations with ElementSchema', () => {
    const deco = newElement('shape', { x: 0, y: 0, w: 1, h: 1 });
    const ok = {
      ...grid(photo, 1),
      grid: undefined,
      free: {
        slots: [{ kind: 'photo', x: 0, y: 0, w: 1, h: 1, rotation: 0 }],
        decorations: [deco],
      },
    };
    expect(TemplateSchema.safeParse(ok).success).toBe(true);
    const bad = { ...ok, free: { ...ok.free, decorations: [{ type: 'nope' }] } };
    expect(TemplateSchema.safeParse(bad).success).toBe(false);
  });
  it('schema output equals the hand-written type (compile-time)', () => {
    expectTypeOf<z.output<typeof TemplateSchema>>().toEqualTypeOf<Template>();
  });
});
