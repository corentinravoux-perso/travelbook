import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { fixturePath } from '../../../../../../tests/fixtures/make-fixtures';
import { sanitizeSvg } from './sanitizeSvg';

const svg = (inner: string, attrs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"${attrs}>${inner}</svg>`;

const render = async (text: string): Promise<Buffer> =>
  sharp(Buffer.from(text)).resize(200, 100).raw().toBuffer();

describe('sanitizeSvg of the fixtures', () => {
  it('removes script, handlers, external hrefs and foreignObject from script.svg', async () => {
    const out = sanitizeSvg(await readFile(fixturePath('script.svg'), 'utf8'));
    for (const forbidden of [
      '<script',
      'onload',
      'onclick',
      'alert',
      'href="http',
      '<foreignObject',
    ]) {
      expect(out).not.toContain(forbidden);
    }
    expect(out).toContain('<rect');
    expect(out).toContain('<circle');
  });

  it('leaves plain.svg visually unchanged', async () => {
    const original = await readFile(fixturePath('plain.svg'), 'utf8');
    const clean = sanitizeSvg(original);
    expect(await render(clean)).toEqual(await render(original));
  });

  it('is idempotent', async () => {
    for (const name of ['plain.svg', 'script.svg'] as const) {
      const once = sanitizeSvg(await readFile(fixturePath(name), 'utf8'));
      expect(sanitizeSvg(once)).toBe(once);
    }
  });

  it('throws on a PNG passed as SVG, on text, on XML that is not SVG and on broken XML', async () => {
    expect(() => sanitizeSvg((async () => '')() as unknown as string)).toThrow();
    const png = (await readFile(fixturePath('alpha.png'))).toString('utf8');
    expect(() => sanitizeSvg(png)).toThrow(/Not an SVG/);
    expect(() => sanitizeSvg('hello')).toThrow(/Not an SVG/);
    expect(() => sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toThrow(/Not an SVG/);
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow(
      /Not an SVG/,
    );
  });
});

describe('sanitizeSvg attacks', () => {
  it.each([
    ['a script', svg('<script>alert(1)</script><rect width="1" height="1"/>'), /<script|alert/],
    ['a script in CDATA', svg('<script><![CDATA[alert(1)]]></script>'), /script|alert/],
    ['an uppercase handler', svg('<rect width="1" height="1" ONCLICK="x()"/>'), /onclick/i],
    ['a mixed-case handler', svg('<rect width="1" height="1" onLoad="x()"/>'), /onload/i],
    ['a handler on the root', svg('', ' onload="x()"'), /onload/],
    [
      'foreignObject',
      svg('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'),
      /foreignobject|body/i,
    ],
    [
      'a link',
      svg('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'),
      /javascript|<a/,
    ],
    ['an external use', svg('<use href="http://evil.test/x.svg#a"/>'), /evil/],
    ['an external xlink use', svg('<use xlink:href="https://evil.test/x.svg#a"/>'), /evil/],
    [
      'a data: svg image',
      svg('<image href="data:image/svg+xml;base64,PHN2Zy8+" width="1" height="1"/>'),
      /svg\+xml/,
    ],
    ['a javascript: image', svg('<image xlink:href="javascript:alert(1)"/>'), /javascript/],
    ['an external image', svg('<image href="https://evil.test/p.png"/>'), /evil/],
    [
      'an animation setting href',
      svg('<a><animate attributeName="href" values="javascript:alert(1)"/></a>'),
      /animate|javascript/,
    ],
    [
      'a set element',
      svg('<rect width="1" height="1"><set attributeName="onclick" to="x()"/></rect>'),
      /<set|onclick/,
    ],
    [
      'an @import style',
      svg('<style>@import url(https://evil.test/a.css);</style>'),
      /evil|@import|<style/,
    ],
    [
      'an external url() style',
      svg('<style>rect{fill:url(https://evil.test/a)}</style>'),
      /evil|<style/,
    ],
    [
      'an escaped url() style',
      svg('<style>rect{fill:\\75rl(https://evil.test/a)}</style>'),
      /evil|<style/,
    ],
    [
      'a style attribute with url()',
      svg('<rect style="fill:url(http://evil.test/a)" width="1" height="1"/>'),
      /evil|style=/,
    ],
    [
      'a fill with an external url()',
      svg('<rect fill="url(http://evil.test/a)" width="1" height="1"/>'),
      /evil/,
    ],
    [
      'a filter on feImage',
      svg('<filter id="f"><feImage href="http://evil.test/a.png"/></filter>'),
      /evil|feImage/,
    ],
    [
      'an entity',
      '<!DOCTYPE svg [<!ENTITY a "x">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>',
      /./,
    ],
  ])('removes %s', (_label, input, forbidden) => {
    let out: string | undefined;
    try {
      out = sanitizeSvg(input);
    } catch {
      return; // Refusing the file is as safe as cleaning it.
    }
    expect(out).not.toMatch(forbidden);
  });

  it('removes comments, processing instructions, the doctype and metadata', () => {
    const out = sanitizeSvg(
      `<?xml version="1.0"?><?xml-stylesheet href="http://evil.test/a.css"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">` +
        svg(
          '<!-- x --><metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata><rect width="1" height="1"/>',
        ),
    );
    expect(out).not.toMatch(/evil|DOCTYPE|<!--|metadata|rdf|<\?/);
    expect(out).toContain('<rect');
  });

  it('drops foreign namespaces and their attributes', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:version="1"><sodipodi:namedview xmlns:sodipodi="x"/><rect inkscape:label="a" width="1" height="1"/></svg>',
    );
    expect(out).not.toMatch(/inkscape|sodipodi/);
  });
});

describe('sanitizeSvg keeps what draws', () => {
  it('keeps gradients, internal references, safe styles and a data PNG image', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const out = sanitizeSvg(
      svg(
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>` +
          `<clipPath id="c"><circle r="4" cx="5" cy="5"/></clipPath><style>.a{fill:url(#g)}</style></defs>` +
          `<use xlink:href="#c"/><rect class="a" clip-path="url(#c)" fill="url(#g)" style="stroke:red" width="1" height="1"/>` +
          `<image href="${png}" width="1" height="1"/><text x="1" y="2">Été</text>`,
      ),
    );
    for (const kept of [
      'linearGradient',
      'clipPath',
      'xlink:href="#c"',
      'fill="url(#g)"',
      'stroke:red',
      '.a{fill:url(#g)}',
      png,
      '>Été<',
    ]) {
      expect(out).toContain(kept);
    }
  });
});
