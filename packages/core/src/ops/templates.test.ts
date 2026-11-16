import { describe, expect, it } from 'vitest';
import { newElement } from '../factory';
import { pageBox } from '../geometry';
import type { Book, Element, PhotoElement, Spread, TextElement } from '../schema';
import {
  TemplateSchema,
  layoutTemplate,
  readingOrder,
  type LayoutNode,
  type Template,
} from '../template';
import { OpError } from './errors';
import { mapElement } from '../map/test-helpers';
import { applyTemplate, captureTemplate } from './templates';
import { freshBook, inner, photo, shape, useCounterIds } from './test-helpers';

useCounterIds();

const P = { margin: 10, gap: 4 };
const photoSlot = { slot: 'photo' } as const;

function grid(root: LayoutNode, photoCount: number, extra: Partial<Template> = {}): Template {
  return {
    id: 't',
    name: 'Test',
    category: 'photos',
    scope: 'page',
    photoCount,
    origin: 'bundled',
    grid: { root, fullBleed: false },
    ...extra,
  };
}

const row2 = grid({ split: 'row', weights: [1, 1], children: [photoSlot, photoSlot] }, 2);
const col3 = grid(
  { split: 'col', weights: [1, 1, 1], children: [photoSlot, photoSlot, photoSlot] },
  3,
);

const els = (book: Book, sid: string): Element[] =>
  [book.cover, ...book.spreads].find((s) => s.id === sid)!.elements;
const byId = (book: Book, sid: string, id: string): Element =>
  els(book, sid).find((e) => e.id === id)!;
const rectOf = (e: Element) => ({ x: e.x, y: e.y, w: e.w, h: e.h });

function text(id: string, x: number, y: number, role?: TextElement['textRole'], word = id) {
  const t: TextElement = { ...newElement('text', { x, y, w: 80, h: 20 }), id };
  t.doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: word }] }],
  };
  t.style.fontSizePt = 30;
  if (role) t.textRole = role;
  return t;
}

describe('applyTemplate: photos', () => {
  /** Left page holds pA (middle), pB (top), pC (bottom); reading order is B, A, C. */
  function threePhotos(): { book: Book; sid: string } {
    const book = freshBook(1);
    const s = inner(book);
    const pA = photo('pA', 100, 100, 50, 50, 'A');
    const pB = photo('pB', 10, 10, 50, 50, 'B');
    const pC = photo('pC', 50, 200, 50, 50, 'C');
    pB.adjust.sepia = 0.5;
    pB.border = { width: 1, color: '#123456' };
    pB.shadow = { dx: 1, dy: 2, blur: 3, color: '#000' };
    pB.crop = { scale: 2, cx: 0.1, cy: 0.9 };
    pB.flipH = true;
    pB.mask = { kind: 'ellipse' };
    s.elements.push(pA, pB, pC);
    return { book, sid: s.id };
  }

  it('3 photos onto 2 slots: 2 filled in reading order, the third unchanged and last', () => {
    const { book, sid } = threePhotos();
    const pC = byId(book, sid, 'pC');
    const out = applyTemplate(book, sid, 'left', row2, P);
    const result = els(out, sid) as PhotoElement[];
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.assetId)).toEqual(['B', 'A', 'C']);
    expect(rectOf(result[0]!)).toEqual({ x: 10, y: 10, w: 93, h: 277 });
    expect(rectOf(result[1]!)).toEqual({ x: 107, y: 10, w: 93, h: 277 });
    expect(result[2]).toBe(pC);
    expect(['pA', 'pB']).not.toContain(result[0]!.id);
    expect(result[0]!.id).not.toBe(result[1]!.id);
  });

  it('keeps the photo look (adjust, border, shadow, flip), resets the crop, takes the slot mask', () => {
    const { book, sid } = threePhotos();
    const out = applyTemplate(book, sid, 'left', row2, P);
    const first = els(out, sid)[0] as PhotoElement;
    expect(first.adjust.sepia).toBe(0.5);
    expect(first.border).toEqual({ width: 1, color: '#123456' });
    expect(first.shadow).toEqual({ dx: 1, dy: 2, blur: 3, color: '#000' });
    expect(first.flipH).toBe(true);
    expect(first.crop).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    expect(first.mask).toEqual({ kind: 'rect' });
  });

  it('1 photo onto 3 slots: the other two slots are empty', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(photo('only', 5, 5, 50, 50, 'X'));
    const out = applyTemplate(book, s.id, 'left', col3, P);
    const result = els(out, s.id) as PhotoElement[];
    expect(result.map((e) => e.assetId)).toEqual(['X', null, null]);
    expect(result.map((e) => e.type)).toEqual(['photo', 'photo', 'photo']);
  });

  it('discards empty frames instead of treating them as photos in excess', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(photo('e1', 0, 0, 50, 50, null), photo('pA', 100, 100, 50, 50, 'A'));
    const one = grid(photoSlot, 1);
    const out = applyTemplate(book, s.id, 'left', one, P);
    expect((els(out, s.id) as PhotoElement[]).map((e) => e.assetId)).toEqual(['A']);
  });

  it('on a page leaves every element of the other page untouched', () => {
    const { book, sid } = threePhotos();
    const s = inner(book);
    const rPhoto = photo('rp', 250, 20, 80, 80, 'R');
    const rShape = shape('rs', 300, 150, 20, 20);
    const rText = text('rt', 230, 250);
    s.elements.push(rPhoto, rShape, rText);
    const out = applyTemplate(book, sid, 'left', row2, P);
    for (const e of [rPhoto, rShape, rText]) expect(byId(out, sid, e.id)).toBe(e);
    // and the right page: only its own photos are reassigned
    const right = applyTemplate(book, sid, 'right', grid(photoSlot, 1), P);
    expect(rectOf(els(right, sid).find((e) => (e as PhotoElement).assetId === 'R')!)).toEqual({
      x: 220,
      y: 10,
      w: 190,
      h: 277,
    });
    for (const id of ['pA', 'pB', 'pC']) expect(byId(right, sid, id)).toBe(byId(book, sid, id));
  });

  it('a spread target takes the photos of both pages onto the whole spread', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(photo('l', 10, 10, 50, 50, 'L'), photo('r', 300, 10, 50, 50, 'R'));
    const wide = grid({ split: 'row', weights: [1, 1], children: [photoSlot, photoSlot] }, 2, {
      scope: 'spread',
    });
    const out = applyTemplate(book, s.id, 'spread', wide, P);
    const result = els(out, s.id) as PhotoElement[];
    expect(result.map((e) => e.assetId)).toEqual(['L', 'R']);
    expect(rectOf(result[0]!)).toEqual({ x: 10, y: 10, w: 198, h: 277 });
    expect(rectOf(result[1]!)).toEqual({ x: 212, y: 10, w: 198, h: 277 });
  });

  it('puts the new frames where the replaced ones were in the stack', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(
      shape('under', 0, 0, 5, 5),
      photo('pA', 100, 100, 50, 50, 'A'),
      shape('over', 20, 20, 5, 5),
    );
    const out = applyTemplate(book, s.id, 'left', grid(photoSlot, 1), P);
    const kinds = els(out, s.id).map((e) => (e.type === 'photo' ? 'slot' : e.id));
    expect(kinds).toEqual(['under', 'slot', 'over']);
  });

  it('copies the slot mask instead of sharing it with the template', () => {
    const book = freshBook(1);
    const s = inner(book);
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
            y: 0.1,
            w: 0.5,
            h: 0.5,
            rotation: -4,
            mask: { kind: 'ellipse' },
          },
        ],
        decorations: [],
      },
    };
    const out = applyTemplate(book, s.id, 'left', t, P);
    const el = els(out, s.id)[0] as PhotoElement;
    expect(el).toMatchObject({ rotation: -4, mask: { kind: 'ellipse' } });
    expect(el.mask).not.toBe(t.free!.slots[0]!.mask);
    expect(Object.isFrozen(t.free!.slots[0]!.mask)).toBe(false);
  });

  it('adds decorations scaled to the box, with new ids, without touching the template', () => {
    const book = freshBook(1);
    const s = inner(book);
    const deco = { ...shape('d', 0.1, 0.2, 0.5, 0.25), rotation: 7 };
    const t: Template = {
      id: 'f',
      name: 'Libre',
      category: 'photos',
      scope: 'page',
      photoCount: 0,
      origin: 'user',
      free: { slots: [], decorations: [deco] },
    };
    const out = applyTemplate(book, s.id, 'right', t, P);
    const [added] = els(out, s.id);
    expect(added).toMatchObject({ type: 'shape', rotation: 7 });
    expect(added!.id).not.toBe('d');
    expect(added!.x).toBeCloseTo(210 + 21, 9);
    expect(added!.y).toBeCloseTo(59.4, 9);
    expect(added!.w).toBeCloseTo(105, 9);
    expect(added!.h).toBeCloseTo(74.25, 9);
    expect(deco).toMatchObject({ id: 'd', x: 0.1, w: 0.5 });
    expect(Object.isFrozen(deco)).toBe(false);
  });

  it('grows a full-bleed page grid by the bleed outside, but clips it at the spine', () => {
    const book = freshBook(1);
    const s = inner(book);
    const full = grid(photoSlot, 1, { grid: { root: photoSlot, fullBleed: true } });
    const left = applyTemplate(book, s.id, 'left', full, P);
    expect(rectOf(els(left, s.id)[0]!)).toEqual({ x: -3, y: -3, w: 213, h: 303 });
    const right = applyTemplate(book, s.id, 'right', full, P);
    expect(rectOf(els(right, s.id)[0]!)).toEqual({ x: 210, y: -3, w: 213, h: 303 });
    // a spread-wide full bleed is not clipped
    const wide = applyTemplate(book, s.id, 'spread', { ...full, scope: 'spread' }, P);
    expect(rectOf(els(wide, s.id)[0]!)).toEqual({ x: -3, y: -3, w: 426, h: 303 });
  });

  it('uses the cover bleed on the cover', () => {
    const book = { ...freshBook(1), coverBleed: 5 };
    const full = grid(photoSlot, 1, { grid: { root: photoSlot, fullBleed: true } });
    const out = applyTemplate(book, book.cover.id, 'left', full, P);
    expect(rectOf(els(out, book.cover.id)[0]!)).toEqual({ x: -5, y: -5, w: 215, h: 307 });
  });

  it('throws OpError on an unknown spread or a page the spread lacks', () => {
    const book = freshBook(1);
    expect(() => applyTemplate(book, 'nope', 'left', row2, P)).toThrow(OpError);
    expect(() => applyTemplate(book, book.spreads[0]!.id, 'left', row2, P)).toThrow(OpError);
    expect(() => applyTemplate(book, book.spreads.at(-1)!.id, 'right', row2, P)).toThrow(OpError);
    expect(applyTemplate(book, book.spreads[0]!.id, 'right', row2, P)).not.toBe(book);
  });
});

describe('applyTemplate: text and other elements', () => {
  const titled = grid(
    {
      split: 'col',
      weights: [3, 1],
      children: [photoSlot, { slot: 'text', textRole: 'title' }],
    },
    1,
  );

  it('moves the text of an element with the same role into the text slot', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(
      photo('pA', 100, 100, 50, 50, 'A'),
      text('tt', 20, 20, 'title', 'Hello'),
      text('cap', 20, 250, 'caption'),
      text('free', 20, 270),
      shape('sh', 5, 5, 5, 5),
    );
    const cap = byId(book, s.id, 'cap');
    const free = byId(book, s.id, 'free');
    const sh = byId(book, s.id, 'sh');
    const out = applyTemplate(book, s.id, 'left', titled, P);
    const result = els(out, s.id);
    expect(result.map((e) => e.type)).toEqual(['photo', 'text', 'text', 'text', 'shape']);
    const slot = result.find((e) => e.type === 'text' && e.textRole === 'title') as TextElement;
    expect(slot.id).not.toBe('tt');
    expect(slot.doc).toEqual((byId(book, s.id, 'tt') as TextElement).doc);
    expect(slot.doc).not.toBe((byId(book, s.id, 'tt') as TextElement).doc);
    expect(slot.style.fontSizePt).toBe(30);
    expect(slot.y).toBeGreaterThan(200);
    expect(slot.w).toBeCloseTo(190, 9);
    expect(result).toContain(cap);
    expect(result).toContain(free);
    expect(result).toContain(sh);
    expect(result.some((e) => e.id === 'tt')).toBe(false);
  });

  it('creates an empty text frame with the slot role when no text matches', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('cap', 20, 250, 'caption'));
    const out = applyTemplate(book, s.id, 'left', titled, P);
    const created = els(out, s.id).filter((e) => e.type === 'text' && e.textRole === 'title');
    expect(created).toHaveLength(1);
    expect(byId(out, s.id, 'cap')).toBe(byId(book, s.id, 'cap'));
  });

  it('moves one text per slot, in reading order, and leaves the surplus text alone', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('low', 20, 200, 'title', 'Low'), text('high', 20, 20, 'title', 'High'));
    const out = applyTemplate(book, s.id, 'left', titled, P);
    const titles = els(out, s.id).filter((e) => e.type === 'text' && e.textRole === 'title');
    expect(titles).toHaveLength(2);
    const slot = titles.find((e) => e.id !== 'low') as TextElement;
    expect(JSON.stringify(slot.doc)).toContain('High');
    expect(byId(out, s.id, 'low')).toBe(byId(book, s.id, 'low'));
  });

  it('matches role-less text slots with role-less text elements', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('free', 20, 20, undefined, 'Free'));
    const anyText = grid({ slot: 'text' }, 0, { category: 'texte' });
    const out = applyTemplate(book, s.id, 'left', anyText, P);
    expect(els(out, s.id)).toHaveLength(1);
    expect(JSON.stringify((els(out, s.id)[0] as TextElement).doc)).toContain('Free');
    expect(els(out, s.id)[0]!.id).not.toBe('free');
  });

  it('only moves text that sits on the target page', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('rt', 250, 20, 'title', 'Right'));
    const out = applyTemplate(book, s.id, 'left', titled, P);
    expect(byId(out, s.id, 'rt')).toBe(byId(book, s.id, 'rt'));
  });
});

describe('captureTemplate', () => {
  function decorated(): { book: Book; s: Spread } {
    const book = freshBook(1);
    const s = inner(book);
    const rotated = photo('p1', 20, 30, 80, 60, 'A');
    rotated.rotation = -4;
    rotated.mask = { kind: 'rounded', radius: 3 };
    const p2 = photo('p2', 110, 150, 70, 90);
    const cap = text('c', 20, 250, 'caption');
    const sticker: Element = {
      ...newElement('sticker', { x: 150, y: 20, w: 30, h: 30 }),
      id: 'st',
    };
    const sh: Element = { ...shape('sh', 10, 10, 190, 5), groupId: 'g' };
    const right = photo('pr', 250, 20, 100, 100, 'R');
    s.elements.push(rotated, p2, cap, sticker, sh, right);
    return { book, s };
  }

  it('describes a page as a free user template', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'left', 'Ma page');
    expect(t).toMatchObject({
      name: 'Ma page',
      origin: 'user',
      scope: 'page',
      category: 'photos',
      photoCount: 2,
    });
    expect(t.id).toBeTruthy();
    expect(t.grid).toBeUndefined();
    expect(t.free!.slots).toHaveLength(3);
    const first = t.free!.slots[0]!;
    expect(first).toMatchObject({
      kind: 'photo',
      rotation: -4,
      mask: { kind: 'rounded', radius: 3 },
    });
    expect(first.x).toBeCloseTo(20 / 210, 12);
    expect(first.y).toBeCloseTo(30 / 297, 12);
    expect(first.w).toBeCloseTo(80 / 210, 12);
    expect(first.h).toBeCloseTo(60 / 297, 12);
    expect(t.free!.slots[2]).toMatchObject({ kind: 'text', textRole: 'caption' });
    expect(TemplateSchema.safeParse(t).success).toBe(true);
  });

  it('turns stickers and shapes into decorations in 0..1 units, without groups', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'left', 'Ma page');
    const deco = t.free!.decorations;
    expect(deco.map((d) => d.type)).toEqual(['sticker', 'shape']);
    expect(deco[0]).toMatchObject({ x: 150 / 210, y: 20 / 297, w: 30 / 210, h: 30 / 297 });
    expect(deco[1]!.groupId).toBeUndefined();
    expect(deco[1]).not.toBe(byId(book, s.id, 'sh'));
    // the template shares no object with the document
    const slotMask = t.free!.slots[0]!.mask;
    expect(slotMask).not.toBe((byId(book, s.id, 'p1') as PhotoElement).mask);
    expect(byId(book, s.id, 'sh').x).toBe(10);
  });

  it('leaves a map out: its baked geometry belongs to one album, a template carries no assets', () => {
    const { book, s } = decorated();
    s.elements.push({ ...mapElement(), x: 20, y: 160, w: 100, h: 100 });
    const t = captureTemplate(book, s.id, 'left', 'Ma page');
    expect(t.free!.decorations.map((d) => d.type)).toEqual(['sticker', 'shape']);
    expect(t.free!.slots).toHaveLength(3);
  });

  it('layoutTemplate on the same box reproduces the frames within 0.01 mm', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'left', 'Ma page');
    const box = pageBox(book, s, 'left')!;
    const laid = layoutTemplate(t, box, book.bleed, { margin: 0, gap: 0 });
    const expected = readingOrder(['p1', 'p2', 'c'].map((id) => byId(book, s.id, id)));
    expect(laid).toHaveLength(3);
    laid.forEach((slot, i) => {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(slot[k] - expected[i]![k])).toBeLessThan(0.01);
      }
      expect(slot.rotation).toBe(expected[i]!.rotation);
    });
  });

  it('normalises a right page against its own box', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'right', 'Droite');
    expect(t.free!.slots).toHaveLength(1);
    expect(t.free!.slots[0]!.x).toBeCloseTo((250 - 210) / 210, 12);
    expect(t.photoCount).toBe(1);
    expect(t.free!.decorations).toHaveLength(0);
  });

  it('captures a whole spread as a spread template', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'spread', 'Double');
    expect(t.scope).toBe('spread');
    expect(t.photoCount).toBe(3);
    expect(t.free!.slots).toHaveLength(4);
    const last = t.free!.slots.at(-1)!;
    expect(last.x).toBeCloseTo(250 / 420, 12);
    expect(last.w).toBeCloseTo(100 / 420, 12);
  });

  it('files a text-only page under "texte"', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('t1', 20, 20, 'title'));
    const t = captureTemplate(book, s.id, 'left', 'Texte');
    expect(t).toMatchObject({ category: 'texte', photoCount: 0 });
  });

  it('applying a captured template to another spread rebuilds the frames and decorations', () => {
    const { book, s } = decorated();
    const t = captureTemplate(book, s.id, 'left', 'Ma page');
    const fresh = freshBook(1);
    const out = applyTemplate(fresh, inner(fresh).id, 'left', t, P);
    const result = els(out, inner(fresh).id);
    expect(result.map((e) => e.type)).toEqual(['sticker', 'shape', 'photo', 'photo', 'text']);
    const frames = result.filter((e) => e.type === 'photo').map(rectOf);
    expect(frames[0]!.x).toBeCloseTo(20, 6);
    expect(frames[0]!.w).toBeCloseTo(80, 6);
    expect((result.at(-1) as TextElement).textRole).toBe('caption');
    expect(result[0]!.x).toBeCloseTo(150, 6);
  });

  it('throws OpError on an unknown spread or a page the spread lacks', () => {
    const book = freshBook(1);
    expect(() => captureTemplate(book, 'nope', 'left', 'x')).toThrow(OpError);
    expect(() => captureTemplate(book, book.spreads[0]!.id, 'left', 'x')).toThrow(OpError);
  });
});

describe('cover spine zone and page membership', () => {
  /** Cover with a 10 mm spine: back 0..210, spine 210..220, front 220..430. */
  function coverWithSpine(): { book: Book; cid: string } {
    const book: Book = { ...freshBook(1), spineWidth: 10 };
    const spineText = {
      ...text('spineText', 211, 100, undefined, 'Spine'),
      rotation: 90,
      w: 8,
      h: 90,
    };
    const spineSticker: Element = {
      ...newElement('sticker', { x: 212, y: 20, w: 6, h: 6 }),
      id: 'spineSticker',
    };
    book.cover.elements.push(
      photo('back', 20, 20, 100, 100, 'B'),
      photo('spinePhoto', 211, 0, 8, 8, 'S'),
      spineText,
      spineSticker,
      photo('front', 250, 20, 100, 100, 'F'),
    );
    return { book, cid: book.cover.id };
  }

  it('applyTemplate on the front leaves spine photos, text and stickers alone', () => {
    const { book, cid } = coverWithSpine();
    const t = grid({ split: 'col', weights: [3, 1], children: [photoSlot, { slot: 'text' }] }, 1);
    const out = applyTemplate(book, cid, 'right', t, P);
    const result = els(out, cid);
    for (const id of ['back', 'spinePhoto', 'spineText', 'spineSticker']) {
      expect(byId(out, cid, id)).toBe(byId(book, cid, id));
    }
    expect(result.some((e) => e.id === 'front')).toBe(false);
    const created = result.filter((e) => !book.cover.elements.includes(e));
    expect(created.map((e) => e.type)).toEqual(['photo', 'text']);
    expect((created[0] as PhotoElement).assetId).toBe('F');
    expect(JSON.stringify((created[1] as TextElement).doc)).not.toContain('Spine');
    expect(rectOf(created[0]!)).toMatchObject({ x: 230, w: 190 });
  });

  it('applyTemplate on the back leaves the spine and the front alone', () => {
    const { book, cid } = coverWithSpine();
    const out = applyTemplate(book, cid, 'left', grid(photoSlot, 1), P);
    for (const id of ['spinePhoto', 'spineText', 'spineSticker', 'front']) {
      expect(byId(out, cid, id)).toBe(byId(book, cid, id));
    }
    expect(
      (els(out, cid).find((e) => !book.cover.elements.includes(e)) as PhotoElement).assetId,
    ).toBe('B');
  });

  it('applyTemplate on the whole cover spread still takes the spine along', () => {
    const { book, cid } = coverWithSpine();
    const wide = grid({ slot: 'photo' }, 1, { scope: 'spread' });
    const out = applyTemplate(book, cid, 'spread', wide, P);
    const photos = els(out, cid).filter((e) => e.type === 'photo') as PhotoElement[];
    // 3 photos in the target, 1 slot: the first in reading order (spine photo at y 0) is placed
    expect(photos.map((e) => e.assetId)).toEqual(['S', 'B', 'F']);
  });

  it('captureTemplate on the front ignores the spine: every slot is inside 0..1', () => {
    const { book, cid } = coverWithSpine();
    const t = captureTemplate(book, cid, 'right', 'Face');
    expect(t.free!.slots).toHaveLength(1);
    expect(t.free!.slots[0]!.x).toBeCloseTo((250 - 220) / 210, 12);
    expect(t.free!.decorations).toHaveLength(0);
    const back = captureTemplate(book, cid, 'left', 'Dos');
    expect(back.free!.slots).toHaveLength(1);
    expect(back.free!.decorations).toHaveLength(0);
  });

  it('captureTemplate on the whole cover keeps the spine elements', () => {
    const { book, cid } = coverWithSpine();
    const t = captureTemplate(book, cid, 'spread', 'Couverture');
    expect(t.free!.slots).toHaveLength(4);
    expect(t.free!.decorations).toHaveLength(1);
  });

  it('on an inner spread an element centred on the spine line belongs to the right page', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(photo('mid', 185, 10, 50, 50, 'M'), photo('l', 10, 10, 50, 50, 'L'));
    expect(captureTemplate(book, s.id, 'right', 'R').free!.slots).toHaveLength(1);
    expect(captureTemplate(book, s.id, 'left', 'L').free!.slots).toHaveLength(1);
    const out = applyTemplate(book, s.id, 'left', grid(photoSlot, 1), P);
    expect(byId(out, s.id, 'mid')).toBe(byId(book, s.id, 'mid'));
    expect((els(out, s.id) as PhotoElement[]).map((e) => e.assetId)).toEqual(['M', 'L']);
  });
});

describe('applyTemplate: background', () => {
  const sand = { kind: 'color', color: '#f6ecd9' } as const;
  const sea = { kind: 'color', color: '#dbe7ef' } as const;
  const themed = grid(photoSlot, 1, { themeId: 'plage', background: sand });

  it('sets the template background on the target page only', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = { right: sea };
    const out = applyTemplate(book, s.id, 'left', themed, P);
    const after = inner(out).background;
    expect(after.left).toEqual(sand);
    expect(after.right).toEqual(sea);
    expect(after.spread).toBeUndefined();
  });

  it('replaces the background of the target side and leaves the other side untouched', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = { left: sea, right: sea };
    const out = applyTemplate(book, s.id, 'right', themed, P);
    expect(inner(out).background).toEqual({ left: sea, right: sand });
  });

  it('on a spread target sets the spread background and drops the page ones', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = { left: sea };
    const out = applyTemplate(book, s.id, 'spread', { ...themed, scope: 'spread' }, P);
    expect(inner(out).background).toEqual({ spread: sand });
  });

  it('works on the front of the cover', () => {
    const book = freshBook(1);
    const out = applyTemplate(book, book.cover.id, 'right', themed, P);
    expect(out.cover.background).toEqual({ right: sand });
  });

  it('copies the background instead of sharing it with the template', () => {
    const book = freshBook(1);
    const out = applyTemplate(book, inner(book).id, 'left', themed, P);
    expect(inner(out).background.left).not.toBe(sand);
    expect(Object.isFrozen(sand)).toBe(false);
  });

  it('leaves the existing background alone when the template has none', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.background = { left: sea, spread: sand };
    const out = applyTemplate(book, s.id, 'left', row2, P);
    expect(inner(out).background).toEqual({ left: sea, spread: sand });
  });
});

describe('applyTemplate: text defaults by role', () => {
  const roles = grid(
    {
      split: 'col',
      weights: [1, 1, 1],
      children: [
        { slot: 'text', textRole: 'title' },
        { slot: 'text', textRole: 'body' },
        { slot: 'text', textRole: 'caption' },
      ],
    },
    0,
    { category: 'texte' },
  );

  it('sizes an empty title bigger than a body, and a body bigger than a caption', () => {
    const book = freshBook(1);
    const out = applyTemplate(book, inner(book).id, 'left', roles, P);
    const size = (role: string) =>
      (els(out, inner(book).id).find((e) => (e as TextElement).textRole === role) as TextElement)
        .style.fontSizePt;
    expect(size('title')).toBeGreaterThan(size('body'));
    expect(size('body')).toBeGreaterThan(size('caption'));
    const title = els(out, inner(book).id).find(
      (e) => (e as TextElement).textRole === 'title',
    ) as TextElement;
    expect(title.align).toBe('center');
  });

  it('keeps the style of a text that moves into the slot', () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(text('tt', 20, 20, 'title', 'Hello'));
    const out = applyTemplate(book, s.id, 'left', roles, P);
    const moved = els(out, s.id).find(
      (e) => e.type === 'text' && JSON.stringify(e.doc).includes('Hello'),
    ) as TextElement;
    expect(moved.style.fontSizePt).toBe(30);
    expect(moved.align).toBe('left');
  });
});

describe('captureTemplate: id', () => {
  it("gives a user template an id that starts with 'user-', so it never shadows a bundled one", () => {
    const book = freshBook(1);
    const s = inner(book);
    s.elements.push(photo('pA', 10, 10, 50, 50, 'A'));
    const t = captureTemplate(book, s.id, 'left', 'Mien');
    expect(t.id.startsWith('user-')).toBe(true);
    expect(t.origin).toBe('user');
    expect(TemplateSchema.safeParse(t).success).toBe(true);
  });
});
