import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  AssetRefSchema,
  BackgroundSchema,
  ElementSchema,
  SpreadSchema,
  type AssetRef,
  type Background,
  type Book,
  type Element,
  type Spread,
  BookFormatError,
  BookSchema,
  migrate,
  newBook,
  newElement,
  newSpread,
  pageCount,
  setIdSource,
} from './index';

const rect = { x: 1, y: 2, w: 30, h: 40 };

describe('newBook', () => {
  it('builds a valid default book', () => {
    const b = newBook({ title: 'T' });
    expect(BookSchema.safeParse(b).success).toBe(true);
    expect(b.format).toEqual({ width: 210, height: 297 });
    expect(b.bleed).toBe(3);
    expect(b.coverBleed).toBe(3);
    expect(b.safeMargin).toBe(8);
    expect(b.settings).toEqual({ frenchTypography: true, dpiGood: 250, dpiLow: 150 });
    expect(b.spreads.map((s) => s.kind)).toEqual([
      'first',
      ...Array<string>(11).fill('inner'),
      'last',
    ]);
    expect(pageCount(b)).toBe(24);
  });

  it('honours innerSpreads and format', () => {
    const b = newBook({ title: 'T', format: { width: 210, height: 210 }, innerSpreads: 2 });
    expect(b.spreads).toHaveLength(4);
    expect(b.format.height).toBe(210);
    expect(pageCount(b)).toBe(6);
  });
});

describe('newSpread / newElement', () => {
  it('newSpread is empty', () => {
    const s = newSpread('cover');
    expect(s.kind).toBe('cover');
    expect(s.background).toEqual({});
    expect(s.elements).toEqual([]);
  });

  it('photo defaults', () => {
    const p = newElement('photo', rect);
    expect(p).toMatchObject({ type: 'photo', ...rect, assetId: null, opacity: 1, rotation: 0 });
    expect(p.crop).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    expect(p.adjust).toEqual({ brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0 });
  });

  it('every element type validates inside a book', () => {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    b.assets['a'] = {
      id: 'a',
      kind: 'photo',
      file: 'a.jpg',
      originalName: 'a.jpg',
      sha256: 'x',
    };
    const sticker = newElement('sticker', rect);
    sticker.assetId = 'a';
    b.spreads[1]!.elements.push(
      newElement('photo', rect),
      newElement('text', rect),
      sticker,
      newElement('shape', rect),
    );
    expect(BookSchema.safeParse(b).success).toBe(true);
  });

  it('uses the injected id source', () => {
    let n = 0;
    setIdSource(() => `id-${++n}`);
    try {
      expect(newSpread('inner').id).toBe('id-1');
      expect(newElement('shape', rect).id).toBe('id-2');
    } finally {
      setIdSource(null);
    }
    expect(newSpread('inner').id).not.toBe('id-3');
  });
});

describe('BookSchema', () => {
  it('rejects crop.scale < 1', () => {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    const p = newElement('photo', rect);
    p.crop.scale = 0.5;
    b.spreads[1]!.elements.push(p);
    expect(BookSchema.safeParse(b).success).toBe(false);
  });

  it('rejects opacity > 1', () => {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    const p = newElement('shape', rect);
    p.opacity = 2;
    b.spreads[1]!.elements.push(p);
    expect(BookSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a first spread of kind inner', () => {
    const b = newBook({ title: 'T' });
    b.spreads[0]!.kind = 'inner';
    expect(BookSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a last spread of kind inner', () => {
    const b = newBook({ title: 'T' });
    b.spreads[b.spreads.length - 1]!.kind = 'inner';
    expect(BookSchema.safeParse(b).success).toBe(false);
  });
});

describe('migrate', () => {
  it('throws BookFormatError on {}', () => {
    expect(() => migrate({})).toThrow(BookFormatError);
  });
  it('throws BookFormatError on non-objects', () => {
    expect(() => migrate(null)).toThrow(BookFormatError);
    expect(() => migrate('x')).toThrow(BookFormatError);
  });
  it('returns a valid v1 book unchanged', () => {
    const b = newBook({ title: 'T' });
    expect(migrate(b)).toEqual(b);
  });
  it('rejects a newer version', () => {
    const b = { ...newBook({ title: 'T' }), schemaVersion: 2 };
    expect(() => migrate(b)).toThrow(/version plus récente/);
  });
  it('reports invalid v1 content as BookFormatError', () => {
    const b = { ...newBook({ title: 'T' }), bleed: -1 };
    expect(() => migrate(b)).toThrow(BookFormatError);
  });
});

describe('schema and interfaces agree (compile-time, checked by typecheck)', () => {
  it('z.output equals the hand-written types', () => {
    expectTypeOf<z.output<typeof BookSchema>>().toEqualTypeOf<Book>();
    expectTypeOf<z.output<typeof ElementSchema>>().toEqualTypeOf<Element>();
    expectTypeOf<z.output<typeof SpreadSchema>>().toEqualTypeOf<Spread>();
    expectTypeOf<z.output<typeof BackgroundSchema>>().toEqualTypeOf<Background>();
    expectTypeOf<z.output<typeof AssetRefSchema>>().toEqualTypeOf<AssetRef>();
  });
  it('rejects a text element without doc', () => {
    const t = newElement('text', rect) as unknown as Record<string, unknown>;
    delete t['doc'];
    expect(ElementSchema.safeParse(t).success).toBe(false);
    t['doc'] = { type: 'paragraph' };
    expect(ElementSchema.safeParse(t).success).toBe(false);
  });
});
