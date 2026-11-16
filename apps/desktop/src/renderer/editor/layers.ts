import {
  reorderElements,
  type Book,
  type Element,
  type ShapeElement,
  type Spread,
} from '@travelbook/core';
import { fr } from '../strings/fr';

/** A line of the Layers tab: a group header, or an element (indented when it is in a group). */
export type LayerRow =
  | { kind: 'group'; groupId: string; count: number; collapsed: boolean }
  | { kind: 'element'; el: Element; inGroup: boolean };

/**
 * The rows of the tab, top of the stack first. A group has one header at the place of its topmost
 * member, followed by its members unless it is collapsed; members that are apart in the stack
 * are still listed together.
 */
export function layerRows(spread: Spread, collapsed: ReadonlySet<string>): LayerRow[] {
  const rows: LayerRow[] = [];
  const done = new Set<string>();
  const top = [...spread.elements].reverse();
  for (const el of top) {
    if (el.groupId === undefined) {
      rows.push({ kind: 'element', el, inGroup: false });
      continue;
    }
    if (done.has(el.groupId)) continue;
    done.add(el.groupId);
    const members = top.filter((m) => m.groupId === el.groupId);
    const isCollapsed = collapsed.has(el.groupId);
    rows.push({
      kind: 'group',
      groupId: el.groupId,
      count: members.length,
      collapsed: isCollapsed,
    });
    if (!isCollapsed) for (const m of members) rows.push({ kind: 'element', el: m, inGroup: true });
  }
  return rows;
}

/**
 * Where element `id` lands in the stack when it is dropped on the row of `overId`: above it
 * (`after` the row, in stack order, since the top of the list is the top of the stack) or below.
 * The index is that of the element in the stack once it has moved.
 */
export function dropIndex(spread: Spread, id: string, overId: string, above: boolean): number {
  const rest = spread.elements.filter((el) => el.id !== id);
  const over = rest.findIndex((el) => el.id === overId);
  if (over < 0) return spread.elements.findIndex((el) => el.id === id);
  return above ? over + 1 : over;
}

/** Move element `id` to stack position `index`, one place at a time with the core reorder op. */
export function moveToIndex(book: Book, spreadId: string, id: string, index: number): Book {
  const spread = [book.cover, ...book.spreads].find((s) => s.id === spreadId);
  const current = spread?.elements.findIndex((el) => el.id === id) ?? -1;
  if (!spread || current < 0) return book;
  const target = Math.min(Math.max(index, 0), spread.elements.length - 1);
  const to = target > current ? 'forward' : 'backward';
  let next = book;
  for (let i = 0; i < Math.abs(target - current); i++) {
    next = reorderElements(next, spreadId, [id], to);
  }
  return next;
}

/** The plain text of a Tiptap document, its blocks joined by a space. */
export function docText(doc: unknown): string {
  if (typeof doc !== 'object' || doc === null) return '';
  const node = doc as { text?: unknown; content?: unknown };
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(docText).join(' ').replace(/\s+/g, ' ').trim();
}

/** The most characters of a text shown as the name of its layer. */
const NAME_CHARS = 28;

/** What the tab calls an element: its own name, or what it holds. */
export function layerName(book: Book, el: Element): string {
  if (el.name !== undefined && el.name !== '') return el.name;
  switch (el.type) {
    case 'photo':
      return (
        (el.assetId !== null ? book.assets[el.assetId]?.originalName : undefined) ??
        fr.layers.untitledPhoto
      );
    case 'text': {
      const text = docText(el.doc);
      return text === '' ? fr.layers.untitledText : text.slice(0, NAME_CHARS);
    }
    case 'shape':
      return fr.shapes[(el as ShapeElement).shape];
    case 'sticker':
      return fr.layers.sticker;
    case 'map':
      // The element stores the subject's id, not its name: the map dialog can name the layer.
      return fr.layers.mapNamed(el.subject.id);
  }
}
