import { describe, expect, it } from 'vitest';
import { recolorIllustration } from './recolor';

const svg =
  '<svg viewBox="0 0 10 10"><path class="tb-main" fill="#ff0000" d="M0 0h1"/><rect class="tb-shade" fill="#880000" width="1" height="1"/><circle fill="#000000" r="1"/><g class="x tb-main" fill="#ff0000"/></svg>';

describe('recolorIllustration', () => {
  const out = recolorIllustration(svg, { main: '#123456', shade: '#0a0b0c' });

  it('replaces the fill of every tb-main and tb-shade shape and nothing else', () => {
    expect(out).toBe(
      '<svg viewBox="0 0 10 10"><path class="tb-main" fill="#123456" d="M0 0h1"/><rect class="tb-shade" fill="#0a0b0c" width="1" height="1"/><circle fill="#000000" r="1"/><g class="x tb-main" fill="#123456"/></svg>',
    );
  });

  it('inserts a fill on a role shape that has none', () => {
    expect(
      recolorIllustration('<svg><path class="tb-main" d="M0 0"/></svg>', {
        main: '#123456',
        shade: '#000000',
      }),
    ).toBe('<svg><path class="tb-main" d="M0 0" fill="#123456"/></svg>');
  });

  it('does not match a class token that merely contains the role name', () => {
    const s = '<svg><path class="tb-mainly" fill="#ff0000"/></svg>';
    expect(recolorIllustration(s, { main: '#123456', shade: '#000000' })).toBe(s);
  });

  it('handles single-quoted attributes', () => {
    expect(
      recolorIllustration("<svg><path class='tb-shade' fill='#880000'/></svg>", {
        main: '#123456',
        shade: '#0a0b0c',
      }),
    ).toBe('<svg><path class=\'tb-shade\' fill="#0a0b0c"/></svg>');
  });
});
