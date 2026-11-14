import { describe, expect, it } from 'vitest';
import type { Book, Element } from '../schema';
import {
  addElement,
  alignElements,
  distributeElements,
  groupElements,
  pasteElements,
  removeElements,
  reorderElements,
  transformElements,
  ungroupElements,
  updateElements,
} from './elements';
import { OpError } from './errors';
import { freshBook, inner, photo, shape, useCounterIds } from './test-helpers';

useCounterIds();

/** Inner spread holding shapes a, b, c, d (in that stacking order). */
function setup(): { book: Book; sid: string } {
  const book = freshBook();
  const s = inner(book);
  s.elements.push(
    shape('a', 10, 10, 20, 20),
    shape('b', 50, 40, 30, 10),
    shape('c', 100, 70, 10, 40),
    shape('d', 150, 5, 5, 5),
  );
  return { book, sid: s.id };
}

const order = (book: Book, sid: string): string[] =>
  [book.cover, ...book.spreads].find((s) => s.id === sid)!.elements.map((e) => e.id);
const get = (book: Book, sid: string, id: string): Element =>
  [book.cover, ...book.spreads].find((s) => s.id === sid)!.elements.find((e) => e.id === id)!;

describe('OpError', () => {
  it('is an Error with its own name', () => {
    const e = new OpError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(OpError);
    expect(e.name).toBe('OpError');
    expect(e.message).toBe('boom');
  });
});

describe('addElement', () => {
  it('appends on top by default and leaves the input book untouched', () => {
    const { book, sid } = setup();
    const before = JSON.stringify(book);
    const out = addElement(book, sid, shape('e', 0, 0, 1, 1));
    expect(order(out, sid)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(JSON.stringify(book)).toBe(before);
  });

  it('inserts at an index, clamped to the stack', () => {
    const { book, sid } = setup();
    expect(order(addElement(book, sid, shape('e', 0, 0, 1, 1), 1), sid)).toEqual([
      'a',
      'e',
      'b',
      'c',
      'd',
    ]);
    expect(order(addElement(book, sid, shape('e', 0, 0, 1, 1), 99), sid).at(-1)).toBe('e');
    expect(order(addElement(book, sid, shape('e', 0, 0, 1, 1), -5), sid)[0]).toBe('e');
  });

  it('works on the cover', () => {
    const { book } = setup();
    const out = addElement(book, book.cover.id, shape('e', 0, 0, 1, 1));
    expect(out.cover.elements.map((e) => e.id)).toEqual(['e']);
  });

  it('stores a copy: the caller keeps an unfrozen element', () => {
    const { book, sid } = setup();
    const el = shape('e', 0, 0, 1, 1);
    const out = addElement(book, sid, el);
    expect(get(out, sid, 'e')).not.toBe(el);
    expect(Object.isFrozen(el)).toBe(false);
    el.x = 99;
    expect(get(out, sid, 'e').x).toBe(0);
  });

  it('throws OpError on an unknown spread or a duplicate element id', () => {
    const { book, sid } = setup();
    expect(() => addElement(book, 'nope', shape('e', 0, 0, 1, 1))).toThrow(OpError);
    expect(() => addElement(book, sid, shape('a', 0, 0, 1, 1))).toThrow(OpError);
  });
});

describe('updateElements', () => {
  it('merges the patch into every listed element only', () => {
    const { book, sid } = setup();
    const out = updateElements(book, sid, ['a', 'c'], { opacity: 0.5, locked: true });
    expect(get(out, sid, 'a')).toMatchObject({ opacity: 0.5, locked: true });
    expect(get(out, sid, 'c')).toMatchObject({ opacity: 0.5, locked: true });
    expect(get(out, sid, 'b')).toMatchObject({ opacity: 1, locked: false });
  });

  it('replaces nested values wholesale and copies them', () => {
    const { book, sid } = setup();
    const stroke = { width: 1, color: '#f00' };
    const out = updateElements(book, sid, ['a'], { stroke });
    expect(get(out, sid, 'a')).toMatchObject({ stroke: { width: 1, color: '#f00' } });
    expect(Object.isFrozen(stroke)).toBe(false);
  });

  it('throws OpError on an unknown id, with no element changed', () => {
    const { book, sid } = setup();
    expect(() => updateElements(book, sid, ['a', 'zz'], { opacity: 0 })).toThrow(OpError);
    expect(() => updateElements(book, 'nope', ['a'], { opacity: 0 })).toThrow(OpError);
  });

  it('refuses to change an id or a type, and invalid geometry', () => {
    const { book, sid } = setup();
    expect(() => updateElements(book, sid, ['a'], { id: 'x' })).toThrow(OpError);
    expect(() => updateElements(book, sid, ['a'], { type: 'text' } as Partial<Element>)).toThrow(
      OpError,
    );
    expect(() => updateElements(book, sid, ['a'], { w: -1 })).toThrow(OpError);
    expect(() => updateElements(book, sid, ['a'], { x: Number.NaN })).toThrow(OpError);
  });
});

describe('transformElements', () => {
  it('applies only the geometry fields given, per element', () => {
    const { book, sid } = setup();
    const out = transformElements(book, sid, [
      { id: 'a', x: 1, y: 2 },
      { id: 'b', w: 60, h: 20, rotation: 15 },
    ]);
    expect(get(out, sid, 'a')).toMatchObject({ x: 1, y: 2, w: 20, h: 20, rotation: 0 });
    expect(get(out, sid, 'b')).toMatchObject({ x: 50, y: 40, w: 60, h: 20, rotation: 15 });
  });

  it('throws OpError on an unknown id or a negative size', () => {
    const { book, sid } = setup();
    expect(() => transformElements(book, sid, [{ id: 'zz', x: 1 }])).toThrow(OpError);
    expect(() => transformElements(book, sid, [{ id: 'a', w: -2 }])).toThrow(OpError);
    expect(() => transformElements(book, sid, [{ id: 'a', h: -2 }])).toThrow(OpError);
  });
});

describe('removeElements', () => {
  it('removes the listed elements', () => {
    const { book, sid } = setup();
    expect(order(removeElements(book, sid, ['b', 'd']), sid)).toEqual(['a', 'c']);
  });

  it('throws OpError on an unknown id', () => {
    const { book, sid } = setup();
    expect(() => removeElements(book, sid, ['a', 'zz'])).toThrow(OpError);
  });
});

describe('reorderElements', () => {
  const cases: [string[], 'front' | 'back' | 'forward' | 'backward', string[]][] = [
    [['b'], 'front', ['a', 'c', 'd', 'b']],
    [['a', 'c'], 'front', ['b', 'd', 'a', 'c']],
    [['c', 'd'], 'back', ['c', 'd', 'a', 'b']],
    [['d'], 'back', ['d', 'a', 'b', 'c']],
    [['a'], 'forward', ['b', 'a', 'c', 'd']],
    [['a', 'b'], 'forward', ['c', 'a', 'b', 'd']],
    [['a', 'c'], 'forward', ['b', 'a', 'd', 'c']],
    [['d'], 'forward', ['a', 'b', 'c', 'd']],
    [['c'], 'backward', ['a', 'c', 'b', 'd']],
    [['b', 'd'], 'backward', ['b', 'a', 'd', 'c']],
    [['a'], 'backward', ['a', 'b', 'c', 'd']],
  ];
  it.each(cases)('%j to %s gives %j', (ids, to, expected) => {
    const { book, sid } = setup();
    expect(order(reorderElements(book, sid, ids, to), sid)).toEqual(expected);
  });

  it('throws OpError on an unknown id', () => {
    const { book, sid } = setup();
    expect(() => reorderElements(book, sid, ['zz'], 'front')).toThrow(OpError);
  });
});

describe('groupElements / ungroupElements', () => {
  it('gives the listed elements one fresh group id and ungroup removes it', () => {
    const { book, sid } = setup();
    const grouped = groupElements(book, sid, ['a', 'c']);
    const gid = get(grouped, sid, 'a').groupId;
    expect(gid).toBeDefined();
    expect(get(grouped, sid, 'c').groupId).toBe(gid);
    expect(get(grouped, sid, 'b').groupId).toBeUndefined();
    const out = ungroupElements(grouped, sid, gid!);
    expect(get(out, sid, 'a').groupId).toBeUndefined();
    expect(get(out, sid, 'c').groupId).toBeUndefined();
  });

  it('throws OpError on an unknown element or an unknown group', () => {
    const { book, sid } = setup();
    expect(() => groupElements(book, sid, ['a', 'zz'])).toThrow(OpError);
    expect(() => ungroupElements(book, sid, 'no-group')).toThrow(OpError);
  });
});

describe('pasteElements', () => {
  it('gives new ids, offsets positions and keeps group membership under a new group id', () => {
    const { book, sid } = setup();
    const grouped = groupElements(book, sid, ['a', 'b']);
    const originals = [get(grouped, sid, 'a'), get(grouped, sid, 'b'), get(grouped, sid, 'c')];
    const oldGroup = originals[0]!.groupId!;
    const out = pasteElements(grouped, sid, originals, { dx: 5, dy: 7 });
    const [pa, pb, pc] = out.spreads[1]!.elements.slice(4) as [Element, Element, Element];
    expect(order(out, sid)).toHaveLength(7);
    const ids = order(out, sid);
    expect(new Set(ids).size).toBe(7);
    expect([pa.id, pb.id, pc.id].some((i) => ['a', 'b', 'c'].includes(i))).toBe(false);
    expect(pa).toMatchObject({ x: 15, y: 17, w: 20, h: 20 });
    expect(pb).toMatchObject({ x: 55, y: 47 });
    expect(pb.x - pa.x).toBe(40);
    expect(pb.y - pa.y).toBe(30);
    expect(pa.groupId).toBeDefined();
    expect(pa.groupId).toBe(pb.groupId);
    expect(pa.groupId).not.toBe(oldGroup);
    expect(pc.groupId).toBeUndefined();
    // the originals keep their own group
    expect(get(out, sid, 'a').groupId).toBe(oldGroup);
  });

  it('pastes into another spread and does not modify the source elements', () => {
    const { book, sid } = setup();
    const other = book.spreads[2]!.id;
    const src = get(book, sid, 'a');
    const before = JSON.stringify(src);
    const out = pasteElements(book, other, [src], { dx: 0, dy: 0 });
    expect(order(out, other)).toHaveLength(1);
    expect(order(out, other)[0]).not.toBe('a');
    expect(JSON.stringify(src)).toBe(before);
  });

  it('copies deeply: pasted photos do not share nested objects with the source', () => {
    const { book, sid } = setup();
    const p = photo('p', 0, 0, 10, 10, 'asset1');
    const out = pasteElements(book, sid, [p], { dx: 1, dy: 1 });
    const pasted = out.spreads[1]!.elements.at(-1) as typeof p;
    expect(pasted.adjust).not.toBe(p.adjust);
    expect(pasted.adjust).toEqual(p.adjust);
    expect(Object.isFrozen(p.adjust)).toBe(false);
  });

  it('throws OpError on an unknown spread', () => {
    const { book } = setup();
    expect(() => pasteElements(book, 'nope', [], { dx: 0, dy: 0 })).toThrow(OpError);
  });
});

describe('alignElements', () => {
  const xs = (book: Book, sid: string, ids: string[]): number[] =>
    ids.map((id) => get(book, sid, id).x);
  const ys = (book: Book, sid: string, ids: string[]): number[] =>
    ids.map((id) => get(book, sid, id).y);

  it('aligns to the selection edges (x: a 10..30, b 50..80, c 100..110)', () => {
    const { book, sid } = setup();
    const ids = ['a', 'b', 'c'];
    expect(xs(alignElements(book, sid, ids, 'left', 'selection'), sid, ids)).toEqual([10, 10, 10]);
    expect(xs(alignElements(book, sid, ids, 'right', 'selection'), sid, ids)).toEqual([
      90, 80, 100,
    ]);
    expect(xs(alignElements(book, sid, ids, 'centerX', 'selection'), sid, ids)).toEqual([
      50, 45, 55,
    ]);
  });

  it('aligns to the selection edges (y: a 10..30, b 40..50, c 70..110)', () => {
    const { book, sid } = setup();
    const ids = ['a', 'b', 'c'];
    expect(ys(alignElements(book, sid, ids, 'top', 'selection'), sid, ids)).toEqual([10, 10, 10]);
    expect(ys(alignElements(book, sid, ids, 'bottom', 'selection'), sid, ids)).toEqual([
      90, 100, 70,
    ]);
    expect(ys(alignElements(book, sid, ids, 'centerY', 'selection'), sid, ids)).toEqual([
      50, 55, 40,
    ]);
  });

  it('does not touch elements outside the selection', () => {
    const { book, sid } = setup();
    const out = alignElements(book, sid, ['a', 'b'], 'left', 'selection');
    expect(get(out, sid, 'c')).toEqual(get(book, sid, 'c'));
  });

  it('aligns to the page each element is on', () => {
    const { book, sid } = setup();
    const withRight = addElement(book, sid, shape('r', 300, 100, 40, 20));
    const ids = ['a', 'r'];
    expect(xs(alignElements(withRight, sid, ids, 'left', 'page'), sid, ids)).toEqual([0, 210]);
    expect(xs(alignElements(withRight, sid, ids, 'right', 'page'), sid, ids)).toEqual([190, 380]);
    expect(xs(alignElements(withRight, sid, ids, 'centerX', 'page'), sid, ids)).toEqual([95, 295]);
    expect(ys(alignElements(withRight, sid, ids, 'top', 'page'), sid, ids)).toEqual([0, 0]);
    expect(ys(alignElements(withRight, sid, ids, 'bottom', 'page'), sid, ids)).toEqual([277, 277]);
    expect(ys(alignElements(withRight, sid, ids, 'centerY', 'page'), sid, ids)).toEqual([
      138.5, 138.5,
    ]);
  });

  it('aligns the rotated bounding box, not the unrotated frame', () => {
    const { book, sid } = setup();
    // 100 x 20 turned by 90 degrees about (100, 60): box x 90..110, y 10..110.
    const turned = updateElements(book, sid, ['a'], { x: 50, y: 50, w: 100, h: 20, rotation: 90 });
    const out = alignElements(turned, sid, ['a'], 'left', 'page');
    expect(get(out, sid, 'a').x).toBeCloseTo(-40, 9);
    const top = alignElements(turned, sid, ['a'], 'top', 'page');
    expect(get(top, sid, 'a').y).toBeCloseTo(40, 9);
  });

  it('uses the whole spread for an element on a page the spread lacks', () => {
    const book = freshBook();
    const first = book.spreads[0]!;
    first.elements.push(shape('l', 20, 20, 40, 40));
    const out = alignElements(book, first.id, ['l'], 'right', 'page');
    expect(get(out, first.id, 'l').x).toBe(380);
  });

  it('throws OpError on an unknown id', () => {
    const { book, sid } = setup();
    expect(() => alignElements(book, sid, ['zz'], 'left', 'selection')).toThrow(OpError);
  });
});

describe('distributeElements', () => {
  function row(): { book: Book; sid: string } {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(
      shape('a', 0, 0, 10, 10),
      shape('b', 15, 30, 10, 20),
      shape('c', 100, 80, 10, 10),
    );
    return { book, sid: s.id };
  }

  it('spaces three elements evenly along x, keeping the outer two in place', () => {
    const { book, sid } = row();
    const out = distributeElements(book, sid, ['c', 'a', 'b'], 'x');
    expect(['a', 'b', 'c'].map((id) => get(out, sid, id).x)).toEqual([0, 50, 100]);
  });

  it('spaces three elements evenly along y with unequal heights', () => {
    const { book, sid } = row();
    const out = distributeElements(book, sid, ['a', 'b', 'c'], 'y');
    // a 0..10, b 30..50, c 80..90: sizes 40, span 90, gap 25 -> b at 35.
    expect(['a', 'b', 'c'].map((id) => get(out, sid, id).y)).toEqual([0, 35, 80]);
  });

  it('returns the same book when fewer than three elements are given', () => {
    const { book, sid } = row();
    expect(distributeElements(book, sid, ['a', 'c'], 'x')).toBe(book);
  });

  it('throws OpError on an unknown id', () => {
    const { book, sid } = row();
    expect(() => distributeElements(book, sid, ['a', 'b', 'zz'], 'x')).toThrow(OpError);
  });
});
