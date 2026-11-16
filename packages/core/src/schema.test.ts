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
  type PhotoElement,
  type Spread,
  BookFormatError,
  BookSchema,
  bookSchemaVersion,
  migrate,
  newBook,
  newElement,
  newSpread,
  pageCount,
  removeElements,
  setIdSource,
} from './index';
import { mapElement } from './map/test-helpers';

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
    expect(p.adjust).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
      sepia: 0,
      vignette: 0,
    });
    expect(p.edge).toBeNull();
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

  describe('photo look', () => {
    /** A book with one photo, patched by `edit`; `edit` may delete fields to imitate an older file. */
    function bookWithPhoto(edit: (photo: Record<string, unknown>) => void): unknown {
      const b = newBook({ title: 'T', innerSpreads: 1 });
      b.spreads[1]!.elements.push(newElement('photo', rect));
      const raw = JSON.parse(JSON.stringify(b)) as Book;
      edit(raw.spreads[1]!.elements[0] as unknown as Record<string, unknown>);
      return raw;
    }
    const adjustOf = (p: Record<string, unknown>) => p['adjust'] as Record<string, unknown>;

    it('accepts a vignette at both ends of 0..1', () => {
      for (const vignette of [0, 0.5, 1]) {
        const raw = bookWithPhoto((p) => (adjustOf(p)['vignette'] = vignette));
        expect(BookSchema.safeParse(raw).success).toBe(true);
      }
    });
    it('rejects a vignette outside 0..1', () => {
      for (const vignette of [-0.1, 1.01, Number.NaN]) {
        const raw = bookWithPhoto((p) => (adjustOf(p)['vignette'] = vignette));
        expect(BookSchema.safeParse(raw).success).toBe(false);
      }
    });
    it('accepts a feather of 0 and more, and rejects a negative one', () => {
      for (const feather of [0, 4, 15]) {
        const raw = bookWithPhoto((p) => (p['edge'] = { feather }));
        expect(BookSchema.safeParse(raw).success).toBe(true);
      }
      const raw = bookWithPhoto((p) => (p['edge'] = { feather: -1 }));
      expect(BookSchema.safeParse(raw).success).toBe(false);
    });
    it('keeps a stored feather and vignette', () => {
      const raw = bookWithPhoto((p) => {
        adjustOf(p)['vignette'] = 0.4;
        p['edge'] = { feather: 3 };
      });
      const photo = migrate(raw).spreads[1]!.elements[0] as PhotoElement;
      expect(photo.adjust.vignette).toBe(0.4);
      expect(photo.edge).toEqual({ feather: 3 });
    });
    it('fills the defaults for a book written without them', () => {
      const raw = bookWithPhoto((p) => {
        delete adjustOf(p)['vignette'];
        delete p['edge'];
      });
      const photo = migrate(raw).spreads[1]!.elements[0] as PhotoElement;
      expect(photo.adjust).toEqual({
        brightness: 1,
        contrast: 1,
        saturation: 1,
        grayscale: 0,
        sepia: 0,
        vignette: 0,
      });
      expect(photo.edge).toBeNull();
    });
    it('reads a stored null edge as no feather', () => {
      const raw = bookWithPhoto((p) => (p['edge'] = null));
      expect((migrate(raw).spreads[1]!.elements[0] as PhotoElement).edge).toBeNull();
    });
  });

  it('rejects opacity > 1', () => {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    const p = newElement('shape', rect);
    p.opacity = 2;
    b.spreads[1]!.elements.push(p);
    expect(BookSchema.safeParse(b).success).toBe(false);
  });

  it('accepts a text element with a textRole and rejects an unknown one', () => {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    const t = newElement('text', rect);
    t.textRole = 'title';
    b.spreads[1]!.elements.push(t);
    expect(BookSchema.safeParse(b).success).toBe(true);
    (t as { textRole: string }).textRole = 'headline';
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
  it('accepts a version 2 book and keeps its version', () => {
    const b = { ...newBook({ title: 'T' }), schemaVersion: 2 as const };
    b.cover.elements.push(mapElement());
    expect(migrate(b)).toEqual(b);
    expect(migrate(b).schemaVersion).toBe(2);
  });
  it('rejects a newer version with the update message', () => {
    const b = { ...newBook({ title: 'T' }), schemaVersion: 3 };
    expect(() => migrate(b)).toThrow(BookFormatError);
    expect(() => migrate(b)).toThrow(/Cet album a été créé avec une version plus récente/);
    expect(() => migrate(b)).toThrow(/format 3/);
  });
  it('rejects a version that never existed', () => {
    expect(() => migrate({ ...newBook({ title: 'T' }), schemaVersion: 0 })).toThrow(
      /Version de format inconnue : 0/,
    );
  });
  it('reports invalid v1 content as BookFormatError', () => {
    const b = { ...newBook({ title: 'T' }), bleed: -1 };
    expect(() => migrate(b)).toThrow(BookFormatError);
  });
});

describe('bookSchemaVersion', () => {
  const withMap = (book: Book, where: 'cover' | 'inner'): Book => {
    const copy = JSON.parse(JSON.stringify(book)) as Book;
    (where === 'cover' ? copy.cover : copy.spreads[1]!).elements.push(mapElement());
    return copy;
  };
  const fresh = (): Book => newBook({ title: 'T', innerSpreads: 2 });

  it('is 1 for an album without a map, whatever version it carries', () => {
    expect(bookSchemaVersion(fresh())).toBe(1);
    expect(bookSchemaVersion({ ...fresh(), schemaVersion: 2 })).toBe(1);
  });

  it('is 2 with a map on the cover', () => {
    expect(bookSchemaVersion(withMap(fresh(), 'cover'))).toBe(2);
  });

  it('is 2 with a map on an inner spread', () => {
    expect(bookSchemaVersion(withMap(fresh(), 'inner'))).toBe(2);
  });

  it('is 1 again after the only map is removed', () => {
    const book = withMap(fresh(), 'cover');
    const gone = removeElements(book, book.cover.id, [book.cover.elements[0]!.id]);
    expect(bookSchemaVersion(gone)).toBe(1);
  });

  it('stays 2 while another map is left', () => {
    const book = withMap(withMap(fresh(), 'cover'), 'inner');
    const gone = removeElements(book, book.cover.id, [book.cover.elements[0]!.id]);
    expect(bookSchemaVersion(gone)).toBe(2);
  });

  it('is not changed by the factory: a new book is version 1', () => {
    expect(fresh().schemaVersion).toBe(1);
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
