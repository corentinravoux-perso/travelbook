import {
  addElement,
  assetUsage,
  fillSlot,
  newBook,
  newElement,
  unusedAssets,
  type AssetRef,
  type Book,
  type PhotoElement,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import {
  CASCADE_STEP,
  NEW_FRAME_SHARE,
  decodePhotoDrag,
  dropTarget,
  encodePhotoDrag,
  newPhotoRect,
  planPhotoDrop,
  swapTarget,
} from './PhotoDrop';

const photo = (id: string, w: number, h: number): AssetRef => ({
  id,
  kind: 'photo',
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
  pixel: { w, h },
});

/** An A4 book with three photos and a first spread that has a slot, a filled frame and a locked one. */
function setup() {
  const base = newBook({ title: 'T', innerSpreads: 2 });
  const spreadId = base.spreads[0]!.id;
  let book: Book = {
    ...base,
    assets: { a: photo('a', 6000, 4000), b: photo('b', 3000, 4000), c: photo('c', 800, 600) },
  };
  const slot = newElement('photo', { x: 10, y: 10, w: 80, h: 60 });
  const filled = newElement('photo', { x: 100, y: 10, w: 80, h: 60 });
  const locked = newElement('photo', { x: 10, y: 100, w: 80, h: 60 });
  const text = newElement('text', { x: 100, y: 100, w: 80, h: 30 });
  for (const el of [slot, filled, { ...locked, locked: true }, text]) {
    book = addElement(book, spreadId, el);
  }
  book = fillSlot(book, spreadId, filled.id, 'a');
  book = fillSlot(book, spreadId, locked.id, 'b');
  return { book, spreadId, slot, filled, locked, text };
}

const run = (book: Book, plan: ReturnType<typeof planPhotoDrop>): Book => plan!.op(book);
const elementsOf = (book: Book, spreadId: string) =>
  book.spreads.find((s) => s.id === spreadId)!.elements;

describe('photo drag payload', () => {
  it('round-trips the ids and reads nothing else', () => {
    expect(decodePhotoDrag(encodePhotoDrag(['a', 'b']))).toEqual(['a', 'b']);
    expect(decodePhotoDrag('')).toEqual([]);
    expect(decodePhotoDrag('not json')).toEqual([]);
    expect(decodePhotoDrag('{"a":1}')).toEqual([]);
    expect(decodePhotoDrag('[1, 2]')).toEqual([]);
    expect(decodePhotoDrag('[""]')).toEqual([]);
  });
});

describe('dropTarget', () => {
  it('is the photo frame under the point, empty or filled', () => {
    const { book, spreadId, slot, filled } = setup();
    const spread = book.spreads.find((s) => s.id === spreadId)!;
    expect(dropTarget(spread, { x: 20, y: 20 })).toMatchObject({
      kind: 'slot',
      element: { id: slot.id },
    });
    expect(dropTarget(spread, { x: 120, y: 20 })).toMatchObject({
      kind: 'slot',
      element: { id: filled.id },
    });
  });
  it('is the page over bare paper and over other kinds of element', () => {
    const { book, spreadId } = setup();
    const spread = book.spreads.find((s) => s.id === spreadId)!;
    expect(dropTarget(spread, { x: 250, y: 250 })).toEqual({ kind: 'page' });
    expect(dropTarget(spread, { x: 120, y: 110 })).toEqual({ kind: 'page' }); // the text
  });
  it('refuses a locked frame', () => {
    const { book, spreadId } = setup();
    expect(
      dropTarget(
        book.spreads.find((s) => s.id === spreadId)!,
        { x: 20, y: 110 },
      ),
    ).toEqual({ kind: 'refused' });
  });
  it('takes the topmost frame, and none that is hidden', () => {
    const { book, spreadId, slot } = setup();
    const top = newElement('photo', { x: 10, y: 10, w: 40, h: 40 });
    const stacked = addElement(book, spreadId, top);
    const spread = stacked.spreads.find((s) => s.id === spreadId)!;
    expect(dropTarget(spread, { x: 20, y: 20 })).toMatchObject({ element: { id: top.id } });
    const hidden = {
      ...spread,
      elements: spread.elements.map((e) => (e.id === top.id ? { ...e, hidden: true } : e)),
    };
    expect(dropTarget(hidden, { x: 20, y: 20 })).toMatchObject({ element: { id: slot.id } });
  });
});

describe('newPhotoRect', () => {
  const { book, spreadId } = setup();
  const spread = book.spreads.find((s) => s.id === spreadId)!;
  const centre = { x: 210, y: 150 };

  it('keeps the ratio of the photo and fits in a share of the page', () => {
    const r = newPhotoRect(book, spread, book.assets['a'], centre);
    expect(r.w / r.h).toBeCloseTo(6000 / 4000, 2);
    expect(r.w).toBeLessThanOrEqual(210 * NEW_FRAME_SHARE + 1e-6);
    expect(r.h).toBeLessThanOrEqual(297 * NEW_FRAME_SHARE + 1e-6);
    expect(r.x + r.w / 2).toBeCloseTo(centre.x, 2);
    expect(r.y + r.h / 2).toBeCloseTo(centre.y, 2);
  });
  it('is a portrait frame for a portrait photo', () => {
    const r = newPhotoRect(book, spread, book.assets['b'], centre);
    expect(r.h).toBeGreaterThan(r.w);
    expect(r.w / r.h).toBeCloseTo(3 / 4, 2);
  });
  it('falls back to 3:2 when the size of the photo is not known', () => {
    const r = newPhotoRect(book, spread, undefined, centre);
    expect(r.w / r.h).toBeCloseTo(1.5, 2);
  });
  it('stays inside the spread whatever the drop point', () => {
    const size = { w: 420, h: 297 };
    for (const p of [
      { x: -50, y: -50 },
      { x: 999, y: 999 },
      { x: 0, y: 297 },
    ]) {
      const r = newPhotoRect(book, spread, book.assets['a'], p);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(size.w + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(size.h + 1e-6);
    }
  });
  it('shifts each cascade step', () => {
    const a = newPhotoRect(book, spread, book.assets['a'], centre, 0);
    const b = newPhotoRect(book, spread, book.assets['a'], centre, 2);
    expect(b.x - a.x).toBeCloseTo(2 * CASCADE_STEP, 2);
    expect(b.y - a.y).toBeCloseTo(2 * CASCADE_STEP, 2);
  });
});

describe('planPhotoDrop', () => {
  it('fills the empty slot under the drop', () => {
    const { book, spreadId, slot } = setup();
    const plan = planPhotoDrop(book, spreadId, ['c'], { x: 20, y: 20 });
    expect(plan).toMatchObject({ select: [slot.id], label: 'Remplir un cadre' });
    const after = run(book, plan);
    expect((elementsOf(after, spreadId)[0] as PhotoElement).assetId).toBe('c');
    expect(elementsOf(after, spreadId)).toHaveLength(4);
  });

  it('replaces the photo of a filled frame, which becomes unused again', () => {
    const { book, spreadId, filled } = setup();
    // `a` is placed only in `filled`.
    expect(assetUsage(book)['a']).toBe(1);
    const after = run(book, planPhotoDrop(book, spreadId, ['c'], { x: 120, y: 20 }));
    const el = elementsOf(after, spreadId).find((e) => e.id === filled.id) as PhotoElement;
    expect(el.assetId).toBe('c');
    expect(el.crop).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    expect(unusedAssets(after)).toContain('a');
    expect(unusedAssets(after)).not.toContain('c');
  });

  it('does nothing when the frame already holds that photo, so its crop is kept', () => {
    const { book, spreadId } = setup();
    expect(planPhotoDrop(book, spreadId, ['a'], { x: 120, y: 20 })).toBeNull();
  });

  it('adds a frame at the photo ratio on the bare page, and selects it', () => {
    const { book, spreadId } = setup();
    const plan = planPhotoDrop(book, spreadId, ['b'], { x: 300, y: 200 });
    expect(plan?.label).toBe('Placer une photo');
    const after = run(book, plan);
    const added = elementsOf(after, spreadId).at(-1) as PhotoElement;
    expect(plan?.select).toEqual([added.id]);
    expect(added.assetId).toBe('b');
    expect(added.w / added.h).toBeCloseTo(3 / 4, 2);
    expect(elementsOf(after, spreadId)).toHaveLength(5);
  });

  it('fills the slot with the first photo and gives the others new frames', () => {
    const { book, spreadId, slot } = setup();
    const plan = planPhotoDrop(book, spreadId, ['c', 'b'], { x: 20, y: 20 });
    expect(plan?.label).toBe('Placer une photo');
    const after = run(book, plan);
    const els = elementsOf(after, spreadId);
    expect((els[0] as PhotoElement).assetId).toBe('c');
    expect((els.at(-1) as PhotoElement).assetId).toBe('b');
    expect(plan?.select).toEqual([slot.id, els.at(-1)!.id]);
  });

  it('cascades several photos dropped on the page', () => {
    const { book, spreadId } = setup();
    const after = run(book, planPhotoDrop(book, spreadId, ['a', 'b', 'c'], { x: 300, y: 150 }));
    const added = elementsOf(after, spreadId).slice(-3);
    expect(added.map((e) => (e as PhotoElement).assetId)).toEqual(['a', 'b', 'c']);
    expect(new Set(added.map((e) => `${e.x},${e.y}`)).size).toBe(3);
  });

  it('refuses a locked frame and unknown photos', () => {
    const { book, spreadId } = setup();
    expect(planPhotoDrop(book, spreadId, ['c'], { x: 20, y: 110 })).toBeNull();
    expect(planPhotoDrop(book, spreadId, ['ghost'], { x: 300, y: 200 })).toBeNull();
    expect(planPhotoDrop(book, spreadId, [], { x: 300, y: 200 })).toBeNull();
    expect(planPhotoDrop(book, 'no-such-spread', ['a'], { x: 0, y: 0 })).toBeNull();
  });
});

describe('swapTarget', () => {
  it('is another unlocked photo frame under the point, empty or not', () => {
    const { book, spreadId, slot, filled } = setup();
    const spread = book.spreads.find((s) => s.id === spreadId)!;
    expect(swapTarget(spread, filled.id, { x: 20, y: 20 })?.id).toBe(slot.id);
    expect(swapTarget(spread, slot.id, { x: 120, y: 20 })?.id).toBe(filled.id);
  });
  it('is none over itself, over a locked frame, a text or the bare page', () => {
    const { book, spreadId, filled } = setup();
    const spread = book.spreads.find((s) => s.id === spreadId)!;
    expect(swapTarget(spread, filled.id, { x: 120, y: 20 })).toBeNull();
    expect(swapTarget(spread, filled.id, { x: 20, y: 110 })).toBeNull();
    expect(swapTarget(spread, filled.id, { x: 120, y: 110 })).toBeNull();
    expect(swapTarget(spread, filled.id, { x: 300, y: 250 })).toBeNull();
  });
});
