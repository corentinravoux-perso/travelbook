import type { TextElement } from './schema';

/**
 * What a run of text may set for itself in its `textStyle` mark, over the style of its box: the
 * font, the size and the colour. The floating toolbar sets them on the selected text, the
 * inspector on the whole box.
 */
export type RunStyleKey = 'fontFamily' | 'fontSize' | 'color';

/** What the whole text of a box draws with, for each of them; `null` where its runs differ. */
export interface TextLook {
  fontFamily: string | null;
  fontSizePt: number | null;
  color: string | null;
}

interface Node {
  type?: unknown;
  text?: unknown;
  marks?: unknown;
  content?: unknown;
}
interface Mark {
  type?: unknown;
  attrs?: Record<string, unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const textStyleOf = (node: Node): Mark | undefined =>
  Array.isArray(node.marks)
    ? (node.marks as unknown[]).find((m): m is Mark => isObject(m) && m['type'] === 'textStyle')
    : undefined;

/** Every text node of a Tiptap document, in order. */
function* textNodes(node: unknown): Generator<Node> {
  if (!isObject(node)) return;
  if (typeof node['text'] === 'string' && node['text'] !== '') yield node as Node;
  if (Array.isArray(node['content'])) for (const child of node['content']) yield* textNodes(child);
}

/**
 * What the runs of text of `doc` set for `key`: one entry per value, `null` for the runs that set
 * nothing (they draw with the style of the box). Empty when the document holds no text.
 */
export function runStyleValues(doc: unknown, key: RunStyleKey): Set<string | null> {
  const values = new Set<string | null>();
  for (const node of textNodes(doc)) {
    const value = textStyleOf(node)?.attrs?.[key];
    values.add(typeof value === 'string' && value !== '' ? value : null);
  }
  return values;
}

/**
 * `doc` with `key` taken out of every `textStyle` mark, so that all of its text draws with the
 * style of the box; a mark left setting nothing goes. `doc` itself when no run sets `key`.
 */
export function withoutRunStyle(doc: unknown, key: RunStyleKey): unknown {
  const values = runStyleValues(doc, key);
  if (values.size === 0 || (values.size === 1 && values.has(null))) return doc;
  const strip = (node: unknown): unknown => {
    if (!isObject(node)) return node;
    const out: Record<string, unknown> = { ...node };
    if (Array.isArray(node['marks'])) {
      const marks = (node['marks'] as unknown[]).flatMap((m) => {
        if (!isObject(m) || m['type'] !== 'textStyle' || !isObject(m['attrs'])) return [m];
        const attrs = { ...m['attrs'], [key]: null };
        const empty = Object.values(attrs).every((v) => v === null || v === undefined);
        return empty ? [] : [{ ...m, attrs }];
      });
      if (marks.length > 0) out['marks'] = marks;
      else delete out['marks'];
    }
    if (Array.isArray(node['content'])) out['content'] = node['content'].map(strip);
    return out;
  };
  return strip(doc);
}

/** A size of a mark in pt (`24pt`, or a bare number), or `null` for any other unit. */
function points(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(?:pt)?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** The one value the whole text draws with, the box's where a run sets nothing; `null` if several. */
function uniform<T>(
  doc: unknown,
  key: RunStyleKey,
  base: T,
  read: (value: string) => T | null,
  same: (a: T, b: T) => boolean,
): T | null {
  let found: T | null = null;
  for (const raw of runStyleValues(doc, key)) {
    const value = raw === null ? base : read(raw);
    if (value === null) return null;
    if (found !== null && !same(found, value)) return null;
    found = value;
  }
  return found ?? base;
}

/**
 * The font, size (pt) and colour the whole text of `el` draws with: what its runs set, the
 * style of the box where they set nothing, and `null` for a property whose runs differ. A text
 * with no run draws with the style of its box.
 */
export function textLook(el: Pick<TextElement, 'doc' | 'style'>): TextLook {
  return {
    fontFamily: uniform(
      el.doc,
      'fontFamily',
      el.style.fontFamily,
      (v) => v,
      (a, b) => a === b,
    ),
    fontSizePt: uniform(el.doc, 'fontSize', el.style.fontSizePt, points, (a, b) => a === b),
    color: uniform(
      el.doc,
      'color',
      el.style.color,
      (v) => v,
      (a, b) => a.toLowerCase() === b.toLowerCase(),
    ),
  };
}
