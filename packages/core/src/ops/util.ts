import { newId } from '../factory';
import { pageBox, spreadSize } from '../geometry';
import type {
  Book,
  Element,
  ElementBase,
  Mm,
  PhotoElement,
  Rect,
  Side,
  Spread,
  TextElement,
} from '../schema';
import { OpError } from './errors';

/** The cover or one of the interior spreads. Works on a draft as well as on a plain book. */
export function spreadOf(book: Book, spreadId: string): Spread {
  if (book.cover.id === spreadId) return book.cover;
  const spread = book.spreads.find((s) => s.id === spreadId);
  if (!spread) throw new OpError(`Unknown spread "${spreadId}".`);
  return spread;
}

export function elementOf(spread: Spread, elementId: string): Element {
  const el = spread.elements.find((e) => e.id === elementId);
  if (!el) throw new OpError(`Unknown element "${elementId}" in spread "${spread.id}".`);
  return el;
}

/** The listed elements in the order given, each once. Throws on the first unknown id. */
export function elementsOf(spread: Spread, ids: readonly string[]): Element[] {
  return [...new Set(ids)].map((id) => elementOf(spread, id));
}

export function photoOf(spread: Spread, elementId: string): PhotoElement {
  const el = elementOf(spread, elementId);
  if (el.type !== 'photo') throw new OpError(`Element "${elementId}" is not a photo.`);
  return el;
}

export function isPhoto(el: Element): el is PhotoElement {
  return el.type === 'photo';
}

export function isText(el: Element): el is TextElement {
  return el.type === 'text';
}

/** Deep copy of plain data (objects, arrays, primitives). Unlike JSON it keeps `undefined`. */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

/** Box of a page, or of the whole spread. Throws when the spread has no such page. */
export function targetBox(book: Book, spread: Spread, target: Side | 'spread'): Rect {
  if (target === 'spread') {
    const { w, h } = spreadSize(book, spread);
    return { x: 0, y: 0, w, h };
  }
  const box = pageBox(book, spread, target);
  if (!box) throw new OpError(`Spread of kind "${spread.kind}" has no ${target} page.`);
  return box;
}

/** Elements as a new set: fresh ids, groups kept together under fresh group ids, shifted. */
export function copyElements(els: readonly Element[], dx: Mm, dy: Mm): Element[] {
  const groups = new Map<string, string>();
  return els.map((el) => {
    const copy = clone(el);
    copy.id = newId();
    copy.x += dx;
    copy.y += dy;
    if (copy.groupId !== undefined) {
      let gid = groups.get(copy.groupId);
      if (gid === undefined) groups.set(copy.groupId, (gid = newId()));
      copy.groupId = gid;
    }
    return copy;
  });
}

export const GEOMETRY_KEYS = ['x', 'y', 'w', 'h', 'rotation'] as const;

/** Geometry values must be finite numbers and sizes must not be negative (schema invariant). */
export function assertGeometry(
  values: Partial<Pick<ElementBase, (typeof GEOMETRY_KEYS)[number]>>,
): void {
  for (const key of GEOMETRY_KEYS) {
    const v = values[key];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) throw new OpError(`Element ${key} must be a finite number.`);
    if ((key === 'w' || key === 'h') && v < 0)
      throw new OpError(`Element ${key} must not be negative.`);
  }
}
