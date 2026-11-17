/**
 * The drawing rules of the poster illustrations (`resources/posters/illustrations/*.svg`), as a
 * checker: flat fills only (no filter, mask, clip path, gradient, pattern, embedded image, text,
 * style sheet or style attribute, no link), at most five colours, written as hex; at least one
 * `tb-main` shape; every `tb-main` / `tb-shade` shape carries its own default `fill`; a `viewBox`
 * on the root. Two families: "découpé" (the default: at most five colours, a `tb-main` shape) and
 * "naturel" (`<svg data-tb-style="naturel">`: natural colours, at most eight, no role required) and
 * "relief" (`<svg data-tb-style="relief">`: modelled in volume, like "naturel" but with linear and
 * radial gradients, `fill="url(#id)"` to a gradient of the same file, and `opacity` /
 * `fill-opacity` for highlights and soft shadows; at most sixteen hex colours, gradient stops
 * included; still no filter, mask or clip path). Pure string work, no DOM. The base-on-the-bottom-edge rule needs a render: the
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
export const MAX_COLOURS_NATUREL = 8;
export const MAX_COLOURS_RELIEF = 16;
export const FAMILIES = ['decoupe', 'naturel', 'relief'] as const;
/** What the relief family adds to the flat families: gradients and their stops. */
const RELIEF_ELEMENTS = new Set(['linearGradient', 'radialGradient']);
const RELIEF_ONLY_ATTRS = new Set(['opacity', 'fill-opacity', 'stop-opacity']);
const URL_REF = /^url\(#([\w-]+)\)$/;

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
  let family: string = 'decoupe';
  const gradients = new Set<string>();
  const refs = new Set<string>();
  for (const m of svg.matchAll(TAG)) {
    const name = m[1]!;
    const attrs = attributes(m[2]);
    if (root) {
      root = false;
      if (name !== 'svg') errors.push(`the root element is <${name}>, not <svg>`);
      if (!attrs.has('viewBox')) errors.push('the root <svg> has no viewBox');
      family = attrs.get('data-tb-style') ?? 'decoupe';
      if (!(FAMILIES as readonly string[]).includes(family)) {
        errors.push(`data-tb-style="${family}" is not one of ${FAMILIES.join(', ')}`);
      }
    }
    const banned = BANNED_ELEMENTS.find((b) => b.toLowerCase() === name.toLowerCase());
    const relief = family === 'relief';
    if (banned !== undefined && !(relief && RELIEF_ELEMENTS.has(banned))) {
      errors.push(`<${banned}> element is not allowed`);
    }
    if (relief && RELIEF_ELEMENTS.has(name) && attrs.has('id')) gradients.add(attrs.get('id')!);
    for (const [key, value] of attrs) {
      if (RELIEF_ONLY_ATTRS.has(key) && !relief) {
        errors.push(`${key} on <${name}> is only allowed in the relief family`);
      }
      if (key === 'style') errors.push(`style attribute on <${name}> is not allowed`);
      if (key === 'href' || key === 'xlink:href') errors.push(`href on <${name}> is not allowed`);
      if (/^on/i.test(key)) errors.push(`event attribute ${key} on <${name}> is not allowed`);
      if (COLOUR_ATTRS.has(key) && value !== 'none') {
        const ref = URL_REF.exec(value);
        if (HEX.test(value)) colours.add(normalise(value));
        else if (relief && ref && (key === 'fill' || key === 'stroke')) refs.add(ref[1]!);
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
  for (const id of refs) {
    if (!gradients.has(id)) errors.push(`url(#${id}) names no gradient of the file`);
  }
  const max =
    family === 'relief'
      ? MAX_COLOURS_RELIEF
      : family === 'naturel'
        ? MAX_COLOURS_NATUREL
        : MAX_COLOURS;
  if (colours.size > max) {
    errors.push(`${colours.size} colours (at most ${max}): ${[...colours].join(' ')}`);
  }
  if (mains === 0 && family === 'decoupe') errors.push('no shape has class="tb-main"');
  return errors;
}
