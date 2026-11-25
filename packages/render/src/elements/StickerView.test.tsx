import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sticker, urlOf } from '../test-helpers';
import { StickerView } from './StickerView';

const rect = { x: 0, y: 0, w: 40, h: 30 };

function draw(
  patch: Parameters<typeof sticker>[1] = {},
  quality: 'thumb' | 'preview' | 'export' = 'preview',
) {
  const el = sticker(rect, { id: 's1', assetId: 'stk', ...patch });
  const assetUrl = vi.fn(urlOf);
  const view = render(<StickerView el={el} quality={quality} assetUrl={assetUrl} />);
  const q = <T extends Element>(s: string) => view.container.querySelector<T>(s);
  return {
    ...view,
    el,
    assetUrl,
    svg: q<SVGSVGElement>('svg'),
    image: q<SVGImageElement>('image'),
  };
}

describe('StickerView', () => {
  it('draws the asset stretched to fill the box, whatever its own ratio', () => {
    const { svg, image, assetUrl, el } = draw({}, 'thumb');
    expect(assetUrl).toHaveBeenCalledWith('stk', 'thumb', el);
    expect(image?.getAttribute('href')).toBe('test://asset/stk?q=thumb&el=s1');
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(image?.getAttribute('width')).toBe('100');
    expect(image?.getAttribute('height')).toBe('100');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg?.style.width).toBe('100%');
    expect(svg?.style.height).toBe('100%');
    expect(image?.getAttribute('data-role')).toBe('sticker');
  });

  it.each([
    [{}, ''],
    [{ flipH: true }, 'scaleX(-1)'],
    [{ flipV: true }, 'scaleY(-1)'],
    [{ flipH: true, flipV: true }, 'scale(-1)'],
  ])('flips %j as %j', (patch, transform) => {
    expect(draw(patch).svg?.style.transform).toBe(transform);
  });

  it('keeps its asset and does not tint when tint is null', () => {
    const { container } = draw({ tint: null });
    expect(container.querySelector('[data-role="tint"]')).toBeNull();
    expect(container.querySelector('mask')).toBeNull();
  });

  it('paints the tint through the sticker used as an alpha mask', () => {
    const { container, svg } = draw({ tint: '#336699', flipH: true });
    const mask = container.querySelector<SVGMaskElement>('mask');
    const tint = container.querySelector('[data-role="tint"]');
    expect(mask?.style.maskType).toBe('alpha');
    const image = mask?.querySelector('image');
    expect(image?.getAttribute('href')).toBe('test://asset/stk?q=preview&el=s1');
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(tint?.tagName).toBe('rect');
    expect(tint?.getAttribute('fill')).toBe('#336699');
    expect(tint?.getAttribute('mask')).toBe(`url(#${mask?.id})`);
    expect(svg?.style.transform).toBe('scaleX(-1)');
  });

  it('gives each drawing of the same sticker its own mask id', () => {
    const a = draw({ tint: '#336699' }).container.querySelector('mask')?.id;
    const b = draw({ tint: '#336699' }).container.querySelector('mask')?.id;
    expect(a).toMatch(/^tb-tint-s1-/);
    expect(a).not.toBe(b);
  });
});
