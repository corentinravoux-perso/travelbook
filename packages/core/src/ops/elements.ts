import { produce } from 'immer';
import { newId } from '../factory';
import { boundingBox, pageBox, sideOfElement, spreadSize } from '../geometry';
import type { Book, Element, ElementBase, Mm, Rect, Spread } from '../schema';
import { OpError } from './errors';
import {
  GEOMETRY_KEYS,
  assertGeometry,
  clone,
  copyElements,
  elementOf,
  elementsOf,
  spreadOf,
} from './util';

export type ElementTransform = { id: string } & Partial<
  Pick<ElementBase, 'x' | 'y' | 'w' | 'h' | 'rotation'>
>;

/** Insert `el` (stored as a copy) at `index` in the stack; the top of the stack by default. */
export function addElement(book: Book, spreadId: string, el: Element, index?: number): Book {
  return produce(book, (draft) => {
    const { elements } = spreadOf(draft, spreadId);
    if (elements.some((e) => e.id === el.id)) {
      throw new OpError(`Element "${el.id}" already exists in spread "${spreadId}".`);
    }
    const at =
      index === undefined ? elements.length : Math.min(Math.max(index, 0), elements.length);
    elements.splice(at, 0, clone(el));
  });
}

/** Shallow-merge `patch` into each listed element. `id` and `type` cannot change. */
export function updateElements(
  book: Book,
  spreadId: string,
  ids: string[],
  patch: Partial<Element>,
): Book {
  if (patch.id !== undefined) throw new OpError('An element id cannot be changed.');
  assertGeometry(patch);
  const values = clone(patch);
  return produce(book, (draft) => {
    for (const el of elementsOf(spreadOf(draft, spreadId), ids)) {
      if (values.type !== undefined && values.type !== el.type) {
        throw new OpError(`Cannot change the type of element "${el.id}".`);
      }
      Object.assign(el, values);
    }
  });
}

/** Set position, size and rotation; only the fields present are touched. */
export function transformElements(book: Book, spreadId: string, changes: ElementTransform[]): Book {
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    for (const { id, ...values } of changes) {
      const el = elementOf(spread, id);
      assertGeometry(values);
      for (const key of GEOMETRY_KEYS) {
        const v = values[key];
        if (v !== undefined) el[key] = v;
      }
    }
  });
}

export function removeElements(book: Book, spreadId: string, ids: string[]): Book {
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const gone = new Set(elementsOf(spread, ids).map((e) => e.id));
    spread.elements = spread.elements.filter((e) => !gone.has(e.id));
  });
}

/**
 * Move the listed elements in the stack (last = on top). 'front' and 'back' keep their relative
 * order; 'forward' and 'backward' move each one place past a neighbour that is not selected.
 */
export function reorderElements(
  book: Book,
  spreadId: string,
  ids: string[],
  to: 'front' | 'back' | 'forward' | 'backward',
): Book {
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const picked = new Set(elementsOf(spread, ids).map((e) => e.id));
    const els = spread.elements;
    const isPicked = (e: Element): boolean => picked.has(e.id);
    if (to === 'front') {
      spread.elements = [...els.filter((e) => !isPicked(e)), ...els.filter(isPicked)];
    } else if (to === 'back') {
      spread.elements = [...els.filter(isPicked), ...els.filter((e) => !isPicked(e))];
    } else {
      const next = [...els];
      if (to === 'forward') {
        for (let i = next.length - 2; i >= 0; i--) {
          if (isPicked(next[i]!) && !isPicked(next[i + 1]!)) swap(next, i, i + 1);
        }
      } else {
        for (let i = 1; i < next.length; i++) {
          if (isPicked(next[i]!) && !isPicked(next[i - 1]!)) swap(next, i, i - 1);
        }
      }
      spread.elements = next;
    }
  });
}

function swap<T>(arr: T[], i: number, j: number): void {
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}

/** Put the listed elements in one new group. */
export function groupElements(book: Book, spreadId: string, ids: string[]): Book {
  return produce(book, (draft) => {
    const els = elementsOf(spreadOf(draft, spreadId), ids);
    const groupId = newId();
    for (const el of els) el.groupId = groupId;
  });
}

export function ungroupElements(book: Book, spreadId: string, groupId: string): Book {
  return produce(book, (draft) => {
    const members = spreadOf(draft, spreadId).elements.filter((e) => e.groupId === groupId);
    if (members.length === 0) {
      throw new OpError(`Unknown group "${groupId}" in spread "${spreadId}".`);
    }
    for (const el of members) delete el.groupId;
  });
}

/**
 * Add copies of `els` on top of the stack, shifted by `offset`, with new ids. Elements that
 * shared a group share a new one. The pasted elements are the last `els.length` of the spread.
 */
export function pasteElements(
  book: Book,
  spreadId: string,
  els: Element[],
  offset: { dx: Mm; dy: Mm },
): Book {
  return produce(book, (draft) => {
    spreadOf(draft, spreadId).elements.push(...copyElements(els, offset.dx, offset.dy));
  });
}

export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/**
 * Align the visual (rotated) boxes of the listed elements. `'selection'` aligns them to the
 * box around the whole selection; `'page'` aligns each one to the page it is on (the whole
 * spread when that page does not exist).
 */
export function alignElements(
  book: Book,
  spreadId: string,
  ids: string[],
  edge: AlignEdge,
  relativeTo: 'selection' | 'page',
): Book {
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const els = elementsOf(spread, ids);
    const selection = relativeTo === 'selection' ? unionBox(els.map(boundingBox)) : null;
    for (const el of els) {
      const ref = selection ?? pageRectOf(draft, spread, el);
      const bb = boundingBox(el);
      switch (edge) {
        case 'left':
          el.x += ref.x - bb.x;
          break;
        case 'centerX':
          el.x += ref.x + ref.w / 2 - (bb.x + bb.w / 2);
          break;
        case 'right':
          el.x += ref.x + ref.w - (bb.x + bb.w);
          break;
        case 'top':
          el.y += ref.y - bb.y;
          break;
        case 'centerY':
          el.y += ref.y + ref.h / 2 - (bb.y + bb.h / 2);
          break;
        case 'bottom':
          el.y += ref.y + ref.h - (bb.y + bb.h);
          break;
      }
    }
  });
}

/**
 * Even gaps between the visual boxes along an axis. The first and the last element (by
 * position) stay where they are. Fewer than three elements: nothing to do, same book back.
 */
export function distributeElements(
  book: Book,
  spreadId: string,
  ids: string[],
  axis: 'x' | 'y',
): Book {
  const probe = elementsOf(spreadOf(book, spreadId), ids);
  if (probe.length < 3) return book;
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    const stack = new Map(spread.elements.map((e, i) => [e.id, i]));
    const start = axis === 'x' ? (r: Rect) => r.x : (r: Rect) => r.y;
    const size = axis === 'x' ? (r: Rect) => r.w : (r: Rect) => r.h;
    const items = elementsOf(spread, ids)
      .map((el) => ({ el, box: boundingBox(el) }))
      .sort((a, b) => start(a.box) - start(b.box) || stack.get(a.el.id)! - stack.get(b.el.id)!);
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const span = start(last.box) + size(last.box) - start(first.box);
    const room = span - items.reduce((sum, it) => sum + size(it.box), 0);
    const gap = room / (items.length - 1);
    let pos = start(first.box);
    for (const { el, box } of items) {
      el[axis] += pos - start(box);
      pos += size(box) + gap;
    }
  });
}

function unionBox(boxes: Rect[]): Rect {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function pageRectOf(book: Book, spread: Spread, el: ElementBase): Rect {
  const page = pageBox(book, spread, sideOfElement(book, spread, el));
  if (page) return page;
  const { w, h } = spreadSize(book, spread);
  return { x: 0, y: 0, w, h };
}
