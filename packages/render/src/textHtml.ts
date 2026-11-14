import { validColor } from './cssValues';
/**
 * Tiptap JSON to static HTML, by allow-list: a node, mark or attribute that is not named here does
 * not reach the output, whatever the document says. Text is escaped; every attribute value is
 * built from a validated value and escaped again.
 */

interface JsonNode {
  type?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
  text?: unknown;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);
/** A font-family list with every name quoted, or null when no name is acceptable. */
function validFamily(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const names: string[] = [];
  for (const raw of v.split(',')) {
    const name = raw
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .trim();
    if (GENERIC_FAMILIES.has(name.toLowerCase())) names.push(name.toLowerCase());
    else if (/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u.test(name)) names.push(`'${name}'`);
  }
  return names.length > 0 ? names.join(', ') : null;
}

/** A font size in pt (a bare number counts as pt), or null. */
function validSize(v: unknown): string | null {
  const m = typeof v === 'number' ? [`${v}`, `${v}`] : /^(\d+(?:\.\d+)?)\s*(?:pt)?$/.exec(`${v}`);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 400 ? `${n}pt` : null;
}

const style = (decls: [string, string | null][]): string => {
  const body = decls.flatMap(([k, v]) => (v ? [`${k}:${v}`] : [])).join(';');
  return body ? ` style="${escapeHtml(body)}"` : '';
};

const attrsOf = (n: JsonNode): Record<string, unknown> => (isObject(n.attrs) ? n.attrs : {});

function alignStyle(n: JsonNode): string {
  const a = attrsOf(n)['textAlign'];
  return style([['text-align', typeof a === 'string' && ALIGNS.has(a) ? a : null]]);
}

function children(n: JsonNode): string {
  return Array.isArray(n.content) ? n.content.map(node).join('') : '';
}

function marked(text: string, marks: unknown): string {
  let html = escapeHtml(text);
  if (!Array.isArray(marks)) return html;
  const types = new Map<string, Record<string, unknown>>();
  for (const m of marks) {
    if (isObject(m) && typeof m['type'] === 'string') types.set(m['type'], attrsOf(m));
  }
  const textStyle = types.get('textStyle');
  if (textStyle) {
    const css = style([
      ['font-family', validFamily(textStyle['fontFamily'])],
      ['font-size', validSize(textStyle['fontSize'])],
      ['color', validColor(textStyle['color'])],
    ]);
    if (css) html = `<span${css}>${html}</span>`;
  }
  if (types.has('underline')) html = `<u>${html}</u>`;
  if (types.has('italic')) html = `<em>${html}</em>`;
  if (types.has('bold')) html = `<strong>${html}</strong>`;
  return html;
}

function node(value: unknown): string {
  if (!isObject(value)) return '';
  const n = value as JsonNode;
  switch (n.type) {
    case 'text':
      return typeof n.text === 'string' && n.text !== '' ? marked(n.text, n.marks) : '';
    case 'paragraph': {
      // An empty paragraph keeps its line, as the editor draws it.
      const inner = children(n);
      return `<p${alignStyle(n)}>${inner === '' ? '<br>' : inner}</p>`;
    }
    case 'heading': {
      const level = attrsOf(n)['level'];
      const tag = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h1';
      return `<${tag}${alignStyle(n)}>${children(n)}</${tag}>`;
    }
    case 'bulletList':
      return `<ul>${children(n)}</ul>`;
    case 'orderedList':
      return `<ol>${children(n)}</ol>`;
    case 'listItem':
      return `<li>${children(n)}</li>`;
    case 'hardBreak':
      return '<br>';
    default:
      return '';
  }
}

/** Sanitised HTML of a Tiptap document: empty for anything that is not a `doc`. */
export function textHtml(doc: unknown): string {
  if (!isObject(doc) || doc['type'] !== 'doc') return '';
  return children(doc as JsonNode);
}
