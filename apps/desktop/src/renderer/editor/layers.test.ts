import {
  addElement,
  groupElements,
  newBook,
  newElement,
  type Book,
  type Spread,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { dropIndex, layerName, layerRows, moveToIndex, docText } from './layers';

function setup(): { book: Book; spreadId: string; ids: string[] } {
  let book = newBook({ title: 'T', innerSpreads: 1 });
  const spreadId = book.spreads[1]!.id;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const el = newElement('shape', { x: i, y: 0, w: 10, h: 10 });
    ids.push(el.id);
    book = addElement(book, spreadId, el);
  }
  return { book, spreadId, ids };
}
const spreadOf = (book: Book, id: string): Spread => book.spreads.find((s) => s.id === id)!;
const order = (book: Book, id: string) => spreadOf(book, id).elements.map((e) => e.id);

describe('layerRows', () => {
  it('lists the top of the stack first', () => {
    const { book, spreadId, ids } = setup();
    const rows = layerRows(spreadOf(book, spreadId), new Set());
    expect(rows.map((r) => (r.kind === 'element' ? r.el.id : r.groupId))).toEqual(
      [...ids].reverse(),
    );
  });

  it('puts a group header at its topmost member, and hides the members of a collapsed group', () => {
    const { book, spreadId, ids } = setup();
    const grouped = groupElements(book, spreadId, [ids[0]!, ids[2]!]);
    const spread = spreadOf(grouped, spreadId);
    const open = layerRows(spread, new Set());
    expect(open.map((r) => r.kind)).toEqual(['element', 'group', 'element', 'element', 'element']);
    expect(open[1]).toMatchObject({ kind: 'group', count: 2, collapsed: false });
    // The members come together, in stack order from the top.
    expect(open.slice(2, 4).map((r) => (r.kind === 'element' ? r.el.id : ''))).toEqual([
      ids[2],
      ids[0],
    ]);
    const groupId = spread.elements[0]!.groupId!;
    const closed = layerRows(spread, new Set([groupId]));
    expect(closed.map((r) => r.kind)).toEqual(['element', 'group', 'element']);
  });
});

describe('moving a layer', () => {
  it('dropIndex is the index the element has once it has moved', () => {
    const { book, spreadId, ids } = setup();
    const spread = spreadOf(book, spreadId);
    // Dropped above the bottom element (index 0): it ends at index 1.
    expect(dropIndex(spread, ids[3]!, ids[0]!, true)).toBe(1);
    // Dropped below it: at the very bottom.
    expect(dropIndex(spread, ids[3]!, ids[0]!, false)).toBe(0);
    // Dropped above the top element, by the element below it: the top.
    expect(dropIndex(spread, ids[0]!, ids[3]!, true)).toBe(3);
  });

  it('moveToIndex puts the element at the index, through the core reorder op', () => {
    const { book, spreadId, ids } = setup();
    expect(order(moveToIndex(book, spreadId, ids[0]!, 2), spreadId)).toEqual([
      ids[1],
      ids[2],
      ids[0],
      ids[3],
    ]);
    expect(order(moveToIndex(book, spreadId, ids[3]!, 0), spreadId)).toEqual([
      ids[3],
      ids[0],
      ids[1],
      ids[2],
    ]);
    expect(moveToIndex(book, spreadId, ids[1]!, 1)).toBe(book);
  });
});

describe('layerName', () => {
  it('uses the name, else what the element holds', () => {
    const { book } = setup();
    const text = newElement('text', { x: 0, y: 0, w: 10, h: 10 });
    text.doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reykjavik, jour 1' }] }],
    };
    expect(layerName(book, text)).toBe('Reykjavik, jour 1');
    expect(layerName(book, { ...text, name: 'Titre' })).toBe('Titre');
    expect(layerName(book, newElement('photo', { x: 0, y: 0, w: 1, h: 1 }))).toBe(
      'Cadre photo vide',
    );
    const shape = newElement('shape', { x: 0, y: 0, w: 1, h: 1 });
    shape.shape = 'star';
    expect(layerName(book, shape)).toBe('Étoile');
  });

  it('docText joins blocks with a space', () => {
    expect(
      docText({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
        ],
      }),
    ).toBe('a b');
  });
});
