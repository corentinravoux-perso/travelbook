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
  return { ...view, el, assetUrl, img: view.container.querySelector('img') };
}

describe('StickerView', () => {
  it('draws an <img> from assetUrl that fits in the box', () => {
    const { img, assetUrl, el } = draw({}, 'thumb');
    expect(assetUrl).toHaveBeenCalledWith('stk', 'thumb', el);
    expect(img?.getAttribute('src')).toBe('test://asset/stk?q=thumb&el=s1');
    expect(img?.style.objectFit).toBe('contain');
    expect(img?.style.width).toBe('100%');
    expect(img?.style.height).toBe('100%');
    expect(img?.draggable).toBe(false);
  });

  it.each([
    [{}, ''],
    [{ flipH: true }, 'scaleX(-1)'],
    [{ flipV: true }, 'scaleY(-1)'],
    [{ flipH: true, flipV: true }, 'scale(-1)'],
  ])('flips %j as %j', (patch, transform) => {
    expect(draw(patch).img?.style.transform).toBe(transform);
  });

  it('keeps its asset and does not tint when tint is null', () => {
    const { container } = draw({ tint: null });
    expect(container.querySelector('[data-role="tint"]')).toBeNull();
  });

  it('fills the box with the tint colour through the sticker used as a mask', () => {
    const { container, img } = draw({ tint: '#336699', flipH: true });
    const tint = container.querySelector<HTMLElement>('[data-role="tint"]');
    expect(img).toBeNull();
    expect(tint?.style.backgroundColor).toBe('rgb(51, 102, 153)');
    expect(tint?.style.maskImage).toBe('url("test://asset/stk?q=preview&el=s1")');
    expect(tint?.style.maskSize).toBe('contain');
    expect(tint?.style.maskRepeat).toBe('no-repeat');
    expect(tint?.style.maskPosition).toBe('center center');
    expect(tint?.style.transform).toBe('scaleX(-1)');
  });
});
