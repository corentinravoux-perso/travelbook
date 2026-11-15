import { describe, expect, it } from 'vitest';
import { createHistory } from './history';
import { LOOK_PRESETS, applyLook } from './photoLook';
import { OpError } from './ops/errors';
import { clone } from './ops/util';
import { freshBook, inner, photo, shape, useCounterIds } from './ops/test-helpers';
import { BookSchema, type Book, type PhotoElement } from './schema';

useCounterIds();

const NEUTRAL = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
};

/** Inner spread 1 with two decorated photos, one empty frame and a shape. */
function setup(): { book: Book; sid: string } {
  const book = freshBook(2);
  const s = inner(book, 0);
  const a = photo('a', 0, 0, 80, 60, 'a1');
  a.crop = { scale: 2, cx: 0.2, cy: 0.8 };
  a.mask = { kind: 'preset', preset: 'star' };
  a.border = { width: 1, color: '#000000' };
  a.shadow = { dx: 1, dy: 1, blur: 2, color: '#00000066' };
  a.flipH = true;
  a.rotation = 12;
  a.opacity = 0.7;
  a.edge = { feather: 4 };
  a.adjust = { ...NEUTRAL, brightness: 1.3, vignette: 0.9 };
  const b = photo('b', 100, 0, 80, 60, 'a2');
  const c = photo('c', 0, 100, 80, 60);
  s.elements.push(a, b, c, shape('sh', 0, 200, 10, 10));
  return { book, sid: s.id };
}

const get = (book: Book, sid: string, id: string): PhotoElement =>
  [book.cover, ...book.spreads]
    .find((s) => s.id === sid)!
    .elements.find((e) => e.id === id) as PhotoElement;

describe('LOOK_PRESETS', () => {
  it('has 6 to 10 presets with distinct ids and French names', () => {
    expect(LOOK_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(LOOK_PRESETS.length).toBeLessThanOrEqual(10);
    expect(new Set(LOOK_PRESETS.map((p) => p.id)).size).toBe(LOOK_PRESETS.length);
    expect(new Set(LOOK_PRESETS.map((p) => p.name)).size).toBe(LOOK_PRESETS.length);
    for (const p of LOOK_PRESETS) expect(p.name.trim()).not.toBe('');
  });

  it('starts with the neutral "Original"', () => {
    expect(LOOK_PRESETS[0]).toMatchObject({ id: 'original', name: 'Original', adjust: NEUTRAL });
  });

  it('has one preset that sets only the vignette', () => {
    const only = LOOK_PRESETS.filter(
      (p) => p.adjust.vignette > 0 && p.adjust.brightness === 1 && p.adjust.contrast === 1,
    ).filter((p) => p.adjust.saturation === 1 && p.adjust.grayscale === 0 && p.adjust.sepia === 0);
    expect(only).toHaveLength(1);
  });

  it('has no two presets with the same look', () => {
    const looks = LOOK_PRESETS.map((p) => JSON.stringify(p.adjust));
    expect(new Set(looks).size).toBe(looks.length);
  });

  it.each(LOOK_PRESETS.map((p) => [p.id, p] as const))('%s is a valid adjust', (_id, preset) => {
    const book = freshBook(1);
    const el = photo('p', 0, 0, 10, 10);
    el.adjust = { ...preset.adjust };
    inner(book).elements.push(el);
    expect(BookSchema.safeParse(book).success).toBe(true);
  });
});

describe('applyLook', () => {
  const sepia = LOOK_PRESETS.find((p) => p.adjust.sepia > 0)!;

  it('replaces adjust, vignette included, and keeps every other field', () => {
    const { book, sid } = setup();
    const before = get(book, sid, 'a');
    const out = applyLook(book, sid, ['a'], sepia.id);
    const after = get(out, sid, 'a');
    expect(after.adjust).toEqual(sepia.adjust);
    expect({ ...after, adjust: before.adjust }).toEqual(before);
    expect(after.edge).toEqual({ feather: 4 });
    expect(after.mask).toEqual({ kind: 'preset', preset: 'star' });
  });

  it('resets everything with the neutral preset', () => {
    const { book, sid } = setup();
    expect(get(applyLook(book, sid, ['a'], 'original'), sid, 'a').adjust).toEqual(NEUTRAL);
  });

  it('touches the listed photos only', () => {
    const { book, sid } = setup();
    const out = applyLook(book, sid, ['a', 'c'], sepia.id);
    expect(get(out, sid, 'a').adjust).toEqual(sepia.adjust);
    expect(get(out, sid, 'c').adjust).toEqual(sepia.adjust);
    expect(get(out, sid, 'b')).toBe(get(book, sid, 'b'));
    expect(inner(out).elements[3]).toBe(inner(book).elements[3]);
  });

  it('does not share the preset object with the book, and does not mutate the book', () => {
    const { book, sid } = setup();
    const copy = clone(book);
    const out = applyLook(book, sid, ['a', 'b'], sepia.id);
    expect(book).toEqual(copy);
    expect(get(out, sid, 'a').adjust).not.toBe(sepia.adjust);
    expect(get(out, sid, 'a').adjust).not.toBe(get(out, sid, 'b').adjust);
    expect(Object.isFrozen(sepia.adjust)).toBe(false);
  });

  it('returns the same book when nothing changes', () => {
    const { book, sid } = setup();
    expect(applyLook(book, sid, ['b'], 'original')).toBe(book);
  });

  it('is one undo step for a whole selection', () => {
    const { book, sid } = setup();
    const history = createHistory();
    const out = history.apply(
      book,
      (b) => applyLook(b, sid, ['a', 'b', 'c'], sepia.id),
      'Appliquer un style',
    );
    expect(history.labels).toEqual(['Appliquer un style']);
    expect(history.undo(out)).toEqual(book);
  });

  it('throws on an unknown preset, spread, element, or an element that is not a photo', () => {
    const { book, sid } = setup();
    expect(() => applyLook(book, sid, ['a'], 'nope')).toThrow(OpError);
    expect(() => applyLook(book, sid, ['a'], 'constructor')).toThrow(OpError);
    expect(() => applyLook(book, 'zz', ['a'], sepia.id)).toThrow(OpError);
    expect(() => applyLook(book, sid, ['a', 'zz'], sepia.id)).toThrow(OpError);
    expect(() => applyLook(book, sid, ['a', 'sh'], sepia.id)).toThrow(/not a photo/);
  });

  it('changes nothing when it throws part-way', () => {
    const { book, sid } = setup();
    const copy = clone(book);
    expect(() => applyLook(book, sid, ['a', 'sh'], sepia.id)).toThrow(OpError);
    expect(book).toEqual(copy);
  });
});
