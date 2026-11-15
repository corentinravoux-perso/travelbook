import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * An allow-list SVG sanitiser. SVG found on the web can carry script, event handlers, external
 * references and `<foreignObject>` (HTML); this keeps only what draws a static picture.
 *
 * Why a parser and an allow-list: the SVG is parsed as XML (`@xmldom/xmldom`, a maintained,
 * dependency-free parser that is which reports every well-formedness problem) and rebuilt from the nodes that
 * are explicitly allowed, so a trick that confuses a regular expression (odd whitespace, entity
 * or case games, nested tags) cannot get through: anything not named below is dropped, and so is
 * everything below it. Elements are matched by namespace and exact name, attributes by exact
 * name, so `onLoad`, `ONCLICK` and `inkscape:*` are gone alike.
 *
 * Kept: shapes, text, gradients, patterns, clip paths, masks, filters (without `feImage`),
 * markers, `<title>`/`<desc>`, `<style>` and `style=""` whose CSS has no `@import`, no escapes
 * and no `url()` other than `url(#id)`, and `href`/`xlink:href` that point at `#id` in the same
 * file (or, on `<image>` only, at a base64 `data:` PNG/JPEG/GIF/WebP: never `data:image/svg+xml`,
 * which would nest an unsanitised SVG). Removed: scripts, `<foreignObject>`, `<a>`, `<animate*>`
 * and `<set>` (they can set `href` or event attributes), `<metadata>`, comments, processing
 * instructions, the DOCTYPE, every event handler and every external reference. A document with
 * an `<!ENTITY` declaration is refused outright.
 *
 * Throws when the input is not an SVG document (not well-formed XML, or no `<svg>` root).
 */
export function sanitizeSvg(svg: string): string {
  if (typeof svg !== 'string') throw new Error('Not an SVG: not text');
  if (/<!ENTITY/i.test(svg)) throw new Error('Not an acceptable SVG: it declares entities');
  const failures: string[] = [];
  // xmldom recovers from most mistakes (an unclosed tag, an unquoted attribute) and only reports
  // them; a file that needed recovering is not a file we trust, so any report refuses it.
  const parser = new DOMParser({ onError: (_level, message) => failures.push(String(message)) });
  let doc: Document;
  try {
    doc = parser.parseFromString(svg, 'image/svg+xml') as unknown as Document;
  } catch (error) {
    throw new Error('Not an SVG: it is not well-formed XML', { cause: error });
  }
  const root = doc.documentElement as Element | null;
  if (failures.length > 0 || root === null || !isSvgElement(root) || root.localName !== 'svg') {
    throw new Error('Not an SVG: it is not well-formed XML with an <svg> root');
  }

  const out = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"/>`,
    'image/svg+xml',
  ) as unknown as Document;
  const outRoot = out.documentElement;
  copyAttributes(root, outRoot);
  copyChildren(root, outRoot, out);
  return new XMLSerializer().serializeToString(out as never);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

const isSvgElement = (node: Element): boolean => node.namespaceURI === SVG_NS;

const ELEMENTS = new Set(
  (
    'svg g defs symbol use path rect circle ellipse line polyline polygon image ' +
    'text tspan textPath title desc style linearGradient radialGradient stop pattern ' +
    'clipPath mask marker filter feBlend feColorMatrix feComponentTransfer feComposite ' +
    'feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood ' +
    'feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset ' +
    'fePointLight feSpecularLighting feSpotLight feTile feTurbulence'
  ).split(' '),
);

const ATTRIBUTES = new Set(
  (
    'id class style transform viewBox width height x y x1 y1 x2 y2 cx cy r rx ry fx fy fr d points ' +
    'pathLength fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin ' +
    'stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color clip-path ' +
    'clip-rule mask filter marker-start marker-mid marker-end offset stop-color stop-opacity ' +
    'gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits ' +
    'patternTransform clipPathUnits maskUnits maskContentUnits filterUnits primitiveUnits ' +
    'preserveAspectRatio font-family font-size font-size-adjust font-stretch font-style ' +
    'font-weight font-variant text-anchor dominant-baseline alignment-baseline baseline-shift ' +
    'letter-spacing word-spacing text-decoration writing-mode direction unicode-bidi dx dy rotate ' +
    'textLength lengthAdjust startOffset method spacing side visibility display overflow ' +
    'vector-effect shape-rendering text-rendering image-rendering color-interpolation ' +
    'color-interpolation-filters paint-order mix-blend-mode isolation version refX refY ' +
    'markerWidth markerHeight markerUnits orient in in2 result stdDeviation mode type values ' +
    'operator k1 k2 k3 k4 flood-color flood-opacity lighting-color surfaceScale diffuseConstant ' +
    'specularConstant specularExponent azimuth elevation radius baseFrequency numOctaves seed ' +
    'stitchTiles scale xChannelSelector yChannelSelector tableValues slope intercept amplitude ' +
    'exponent kernelMatrix kernelUnitLength order divisor bias targetX targetY edgeMode ' +
    'preserveAlpha limitingConeAngle pointsAtX pointsAtY pointsAtZ z'
  ).split(' '),
);
/** Attributes that may name something in the same file. */
const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href']);
/** Elements that may refer to another element of the same file by `#id`. */
const REFERRING = new Set([
  'use',
  'linearGradient',
  'radialGradient',
  'pattern',
  'textPath',
  'filter',
]);
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i;

/**
 * Whether a CSS text (a `style` attribute or the content of `<style>`) is free of anything that
 * loads, runs or hides something: `@import`, escapes (`\75rl(`), `expression(`, `javascript:`,
 * `behavior`, `-moz-binding`, and `url()` other than `url(#id)`.
 */
function isSafeCss(css: string): boolean {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/@import|\\|expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding/i.test(text)) {
    return false;
  }
  return urlsAreLocal(text);
}

/** Every `url(...)` in a value points at `#id`. */
function urlsAreLocal(value: string): boolean {
  const refs = value.match(/url\s*\(\s*[^)]*\)?/gi) ?? [];
  return refs.every((ref) => /^url\s*\(\s*(['"]?)#[^'"()\s]+\1\s*\)$/i.test(ref));
}

function isSafeValue(value: string): boolean {
  return urlsAreLocal(value) && !/javascript:|vbscript:|expression\s*\(/i.test(value);
}

function copyAttributes(from: Element, to: Element): void {
  const name = from.localName;
  for (let i = 0; i < from.attributes.length; i++) {
    const attr = from.attributes[i] as Attr;
    const key = attr.name;
    const value = attr.value;
    if (key === 'xmlns' || key.startsWith('xmlns:')) continue; // The output root declares them.
    if (REFERENCE_ATTRIBUTES.has(key)) {
      const trimmed = value.trim();
      const local = trimmed.startsWith('#') && trimmed.length > 1 && !/\s/.test(trimmed);
      const data = name === 'image' && DATA_IMAGE.test(trimmed);
      if (!(name === 'image' ? data : REFERRING.has(name) && local)) continue;
      to.setAttribute(key === 'href' ? 'href' : 'xlink:href', trimmed);
      continue;
    }
    if (key === 'xml:space') {
      if (value === 'preserve' || value === 'default') to.setAttribute('xml:space', value);
      continue;
    }
    if (!ATTRIBUTES.has(key)) continue;
    if (key === 'style' ? !isSafeCss(value) : !isSafeValue(value)) continue;
    to.setAttribute(key, value);
  }
}

function copyChildren(from: Element, to: Element, out: Document): void {
  for (let node = from.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) {
      // Text only means something inside text and style elements; whitespace is kept for layout.
      to.appendChild(out.createTextNode(node.nodeValue ?? ''));
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const element = node as Element;
    if (!isSvgElement(element) || !ELEMENTS.has(element.localName)) continue;
    if (element.localName === 'style' && !isSafeCss(element.textContent ?? '')) continue;
    const copy = out.createElementNS(SVG_NS, element.localName);
    copyAttributes(element, copy);
    copyChildren(element, copy, out);
    to.appendChild(copy);
  }
}
