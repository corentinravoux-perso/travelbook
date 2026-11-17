import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintIllustration } from './lint-illustration.ts';

const sample = readFileSync(join(import.meta.dirname, 'fixtures/sample.svg'), 'utf8');
const svg = (body: string, view = '0 0 10 10') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}"><path class="tb-main" fill="#111111" d="M0 0h1v1z"/>${body}</svg>`;

const failsWith = (input: string, word: string) => {
  const errors = lintIllustration(input);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.join('\n')).toContain(word);
};

describe('lintIllustration', () => {
  it('passes a valid drawing', () => {
    expect(lintIllustration(sample)).toEqual([]);
  });

  it.each([
    ['filter', '<filter id="f"/>'],
    ['mask', '<mask id="m"/>'],
    ['clipPath', '<clipPath id="c"/>'],
    ['linearGradient', '<linearGradient id="g"/>'],
    ['radialGradient', '<radialGradient id="g"/>'],
    ['pattern', '<pattern id="p"/>'],
    ['image', '<image href="x.png"/>'],
    ['text', '<text>hi</text>'],
    ['style', '<style>path{fill:red}</style>'],
    ['script', '<script>alert(1)</script>'],
    ['foreignObject', '<foreignObject/>'],
  ])('rejects a <%s> element', (name, body) => {
    failsWith(svg(body), name);
  });

  it('rejects a style attribute', () => {
    failsWith(svg('<rect style="fill:red" width="1" height="1"/>'), 'style');
  });

  it('rejects an href', () => {
    failsWith(svg('<use href="#a"/>'), 'href');
  });

  it('rejects more than five colours', () => {
    const body = ['#222222', '#333333', '#444444', '#555555', '#666666']
      .map((c) => `<rect fill="${c}" width="1" height="1"/>`)
      .join('');
    failsWith(svg(body), '6 colours');
  });

  it('counts stroke colours and folds #abc into #aabbcc', () => {
    const body =
      '<rect fill="#222" width="1" height="1"/><rect fill="#222222" width="1" height="1"/>' +
      '<path stroke="#333333" fill="none" d="M0 0h1"/>';
    expect(lintIllustration(svg(body))).toEqual([]);
  });

  it('rejects a drawing without a tb-main shape', () => {
    failsWith(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect class="tb-shade" fill="#111111" width="1" height="1"/></svg>',
      'tb-main',
    );
  });

  it('rejects a role shape without its own fill', () => {
    failsWith(svg('<rect class="tb-shade" width="1" height="1"/>'), 'fill');
  });

  it('rejects a colour that is not a hex value', () => {
    failsWith(svg('<rect fill="red" width="1" height="1"/>'), 'hex');
  });

  it('rejects a drawing without a viewBox', () => {
    failsWith('<svg><path class="tb-main" fill="#111111" d="M0 0h1"/></svg>', 'viewBox');
  });

  describe('the pixory family', () => {
    const pixory = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-tb-style="pixory">${body}</svg>`;
    const colours = (n: number) =>
      Array.from(
        { length: n },
        (_, i) =>
          `<rect fill="#${(0x101010 * (i + 1)).toString(16).padStart(6, '0')}" width="1" height="1"/>`,
      ).join('');

    it('allows up to eight colours and no colour role', () => {
      expect(lintIllustration(pixory(colours(8)))).toEqual([]);
    });

    it('rejects a ninth colour', () => {
      failsWith(pixory(colours(9)), '9 colours');
    });

    it('keeps the other rules', () => {
      failsWith(pixory(`${colours(2)}<linearGradient id="g"/>`), 'linearGradient');
    });
  });

  it('rejects an unknown family', () => {
    failsWith(svg('').replace('<svg ', '<svg data-tb-style="cartoon" '), 'data-tb-style');
  });

  describe('relief family', () => {
    const relief = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-tb-style="relief">${body}</svg>`;
    const grad =
      '<defs><radialGradient id="g" cx="0.3" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#c98b00"/></radialGradient></defs>';

    it('passes gradients, url fills and highlight opacity, with no colour role', () => {
      expect(
        lintIllustration(
          relief(
            `${grad}<circle fill="url(#g)" cx="5" cy="5" r="5"/><ellipse fill="#ffffff" opacity="0.5" cx="3" cy="3" rx="1" ry="1"/>`,
          ),
        ),
      ).toEqual([]);
    });

    it('rejects a url to a gradient the file does not define', () => {
      failsWith(relief(`${grad}<circle fill="url(#nope)" cx="5" cy="5" r="5"/>`), 'url(#nope)');
    });

    it('still rejects filters, masks and clip paths', () => {
      failsWith(relief('<filter id="f"/>'), 'filter');
      failsWith(relief('<mask id="m"/>'), 'mask');
      failsWith(relief('<clipPath id="c"/>'), 'clipPath');
    });

    it('keeps gradients and opacity out of the flat families', () => {
      failsWith(svg(grad), 'Gradient');
      failsWith(svg('<rect fill="#ffffff" opacity="0.5" width="1" height="1"/>'), 'relief');
    });

    it('allows sixteen colours, not seventeen', () => {
      const shapes = (n: number) =>
        Array.from(
          { length: n },
          (_, i) => `<rect fill="#0000${(i + 16).toString(16)}" width="1" height="1"/>`,
        ).join('');
      expect(lintIllustration(relief(shapes(16)))).toEqual([]);
      failsWith(relief(shapes(17)), '17 colours');
    });
  });
});
