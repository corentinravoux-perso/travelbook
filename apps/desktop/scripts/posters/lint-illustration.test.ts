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
});
