/**
 * The drawing rules of the poster illustrations (`resources/posters/illustrations/*.svg`), as a
 * checker: flat fills only (no filter, mask, clip path, gradient, pattern, embedded image, text,
 * style sheet or style attribute, no link), at most five colours, written as hex; at least one
 * `tb-main` shape; every `tb-main` / `tb-shade` shape carries its own default `fill`; a `viewBox`
 * on the root. Pure string work, no DOM. The base-on-the-bottom-edge rule needs a render: the
 * presets test checks it.
 */

/** Elements an illustration may not contain. */
const BANNED_ELEMENTS = [
  'filter',
  'mask',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'meshgradient',
  'pattern',
  'image',
  'text',
  'tspan',
  'textPath',
  'style',
  'script',
  'foreignObject',
  'use',
  'symbol',
  'marker',
];
export const MAX_COLOURS = 5;

const TAG = /<([A-Za-z][\w:-]*)(\s[^<>]*?)?\/?>/g;
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const COLOUR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'color', 'flood-color']);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalise = (hex: string): string => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

function attributes(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of (raw ?? '').matchAll(ATTR)) out.set(m[1]!, m[2] ?? m[3] ?? '');
  return out;
}

/** The rules `svg` breaks, one message each; empty when it is a valid illustration. */
export function lintIllustration(svg: string): string[] {
  const errors: string[] = [];
  const colours = new Set<string>();
  let root = true;
  let mains = 0;
  for (const m of svg.matchAll(TAG)) {
    const name = m[1]!;
    const attrs = attributes(m[2]);
    if (root) {
      root = false;
      if (name !== 'svg') errors.push(`the root element is <${name}>, not <svg>`);
      if (!attrs.has('viewBox')) errors.push('the root <svg> has no viewBox');
    }
    const banned = BANNED_ELEMENTS.find((b) => b.toLowerCase() === name.toLowerCase());
    if (banned !== undefined) errors.push(`<${banned}> element is not allowed`);
    for (const [key, value] of attrs) {
      if (key === 'style') errors.push(`style attribute on <${name}> is not allowed`);
      if (key === 'href' || key === 'xlink:href') errors.push(`href on <${name}> is not allowed`);
      if (/^on/i.test(key)) errors.push(`event attribute ${key} on <${name}> is not allowed`);
      if (COLOUR_ATTRS.has(key) && value !== 'none') {
        if (HEX.test(value)) colours.add(normalise(value));
        else errors.push(`${key}="${value}" on <${name}> is not a hex colour`);
      }
    }
    const classes = (attrs.get('class') ?? '').split(/\s+/);
    const main = classes.includes('tb-main');
    if (main) mains++;
    if ((main || classes.includes('tb-shade')) && !attrs.has('fill')) {
      errors.push(`a ${main ? 'tb-main' : 'tb-shade'} <${name}> has no default fill`);
    }
  }
  if (root) errors.push('no <svg> element');
  if (colours.size > MAX_COLOURS) {
    errors.push(`${colours.size} colours (at most ${MAX_COLOURS}): ${[...colours].join(' ')}`);
  }
  if (mains === 0) errors.push('no shape has class="tb-main"');
  return errors;
}
