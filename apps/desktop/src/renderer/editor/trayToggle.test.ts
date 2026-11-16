import {
  addElement,
  fillSlot,
  newBook,
  newElement,
  type AssetRef,
  type Book,
  type PhotoElement,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { planTrayToggle } from './trayToggle';

const photo = (id: string, w = 4000, h = 3000): AssetRef => ({
  id,
  kind: 'photo',
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
  pixel: { w, h },
});

/** An A4 inner spread (two 210 mm pages) with, on its right page, an empty slot under a filled one. */
function setup() {
  const base = newBook({ title: 'T', innerSpreads: 2 });
  const spreadId = base.spreads[1]!.id;
  let book: Book = { ...base, assets: { a: photo('a'), b: photo('b'), c: photo('c') } };
  const lower = newElement('photo', { x: 230, y: 150, w: 170, h: 120 });
  const upper = newElement('photo', { x: 230, y: 20, w: 170, h: 120 });
  for (const el of [lower, upper]) book = addElement(book, spreadId, el);
  book = fillSlot(book, spreadId, upper.id, 'a');
  return { book, spreadId, lower, upper };
}

const photosOf = (book: Book, spreadId: string) =>
  book.spreads.find((s) => s.id === spreadId)!.elements as PhotoElement[];
const none = new Set<string>();

describe('planTrayToggle', () => {
  it('fills the first empty frame of the page, in reading order', () => {
    const { book, spreadId, lower } = setup();
    const plan = planTrayToggle(book, spreadId, 'right', 'b', none)!;
    expect(plan.action).toBe('add');
    expect(plan.frameId).toBe(lower.id);
    expect(plan.createdId).toBeUndefined();
    const next = plan.op(book);
    expect(photosOf(next, spreadId).find((el) => el.id === lower.id)!.assetId).toBe('b');
  });

  it('uses an empty frame of the other page when the page in view has none', () => {
    const { book, spreadId, lower } = setup();
    expect(planTrayToggle(book, spreadId, 'left', 'b', none)!.frameId).toBe(lower.id);
  });

  it('makes a frame at the photo ratio, in the middle of the page, when no frame is empty', () => {
    const { book, spreadId } = setup();
    const full = planTrayToggle(book, spreadId, 'right', 'b', none)!.op(book);
    const plan = planTrayToggle(full, spreadId, 'left', 'c', none)!;
    expect(plan.action).toBe('add');
    expect(plan.createdId).toBe(plan.frameId);
    const made = photosOf(plan.op(full), spreadId).find((el) => el.id === plan.createdId)!;
    expect(made.assetId).toBe('c');
    expect(made.w / made.h).toBeCloseTo(4 / 3, 3);
    // Centred on the left page (105 mm, 148.5 mm).
    expect(made.x + made.w / 2).toBeCloseTo(105, 3);
    expect(made.y + made.h / 2).toBeCloseTo(148.5, 3);
  });

  it('takes a photo off: a layout frame is emptied, a frame made by a click goes', () => {
    const { book, spreadId, upper } = setup();
    const emptied = planTrayToggle(book, spreadId, 'right', 'a', none)!;
    expect(emptied.action).toBe('remove');
    const after = emptied.op(book);
    expect(photosOf(after, spreadId).find((el) => el.id === upper.id)!.assetId).toBeNull();
    expect(photosOf(after, spreadId)).toHaveLength(2);

    const gone = planTrayToggle(book, spreadId, 'right', 'a', new Set([upper.id]))!.op(book);
    expect(photosOf(gone, spreadId).map((el) => el.id)).not.toContain(upper.id);
  });

  it('leaves locked frames alone and ignores what is not a photo of the book', () => {
    const { book, spreadId, upper } = setup();
    const locked: Book = {
      ...book,
      spreads: book.spreads.map((s) =>
        s.id === spreadId
          ? {
              ...s,
              elements: s.elements.map((el) => (el.id === upper.id ? { ...el, locked: true } : el)),
            }
          : s,
      ),
    };
    expect(planTrayToggle(locked, spreadId, 'right', 'a', none)).toBeNull();
    expect(planTrayToggle(book, spreadId, 'right', 'nope', none)).toBeNull();
    expect(planTrayToggle(book, 'nope', 'right', 'a', none)).toBeNull();
  });
});
