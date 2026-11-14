import { render } from '@testing-library/react';
import type { AssetRef, Background as BackgroundValue, Rect } from '@travelbook/core';
import { MM_TO_PX } from '@travelbook/core';
import { describe, expect, it, vi } from 'vitest';
import { Background } from './Background';
import { asset, urlOf } from './test-helpers';

const BOX: Rect = { x: -3, y: -3, w: 426, h: 303 };

function draw(
  background: BackgroundValue,
  assets: AssetRef[] = [],
  quality: 'thumb' | 'preview' | 'export' = 'preview',
) {
  const assetUrl = vi.fn(urlOf);
  const view = render(
    <Background
      background={background}
      layer="spread"
      box={BOX}
      assets={Object.fromEntries(assets.map((a) => [a.id, a]))}
      quality={quality}
      assetUrl={assetUrl}
    />,
  );
  const root = view.container.firstElementChild as HTMLElement;
  return { ...view, assetUrl, root, q: <T extends Element>(s: string) => root.querySelector<T>(s) };
}

describe('Background', () => {
  it('is a box in mm at the given place that clips its content', () => {
    const { root } = draw({ kind: 'color', color: '#ff0000' });
    expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual([
      '-3mm',
      '-3mm',
      '426mm',
      '303mm',
    ]);
    expect(root.style.position).toBe('absolute');
    expect(root.style.overflow).toBe('hidden');
    expect(root.getAttribute('data-background')).toBe('spread');
    expect(root.getAttribute('data-background-kind')).toBe('color');
  });

  it('fills with a colour', () => {
    expect(draw({ kind: 'color', color: '#ff0000' }).root.style.backgroundColor).toBe(
      'rgb(255, 0, 0)',
    );
  });

  describe('gradient', () => {
    const stops = [
      { offset: 0, color: '#ff0000' },
      { offset: 0.4, color: '#00ff00' },
      { offset: 1, color: '#0000ff' },
    ];

    it('draws a linear gradient at the angle, with its stops in percent', () => {
      const { root } = draw({ kind: 'gradient', type: 'linear', angle: 135, stops });
      expect(root.style.backgroundImage).toBe(
        'linear-gradient(135deg, rgb(255, 0, 0) 0%, rgb(0, 255, 0) 40%, rgb(0, 0, 255) 100%)',
      );
    });

    it('draws a radial gradient (an ellipse from the centre, the CSS default)', () => {
      const { root } = draw({ kind: 'gradient', type: 'radial', angle: 0, stops });
      expect(root.style.backgroundImage).toBe(
        'radial-gradient(rgb(255, 0, 0) 0%, rgb(0, 255, 0) 40%, rgb(0, 0, 255) 100%)',
      );
    });
  });

  describe('pattern', () => {
    const tile = asset('pat', 'pattern', { w: 64, h: 64 });
    const pattern = {
      kind: 'pattern',
      assetId: 'pat',
      fg: '#112233',
      bg: '#ffeedd',
      scale: 2,
    } as const;

    it('paints the foreground colour through the tile, over the background colour', () => {
      const { root, q, assetUrl } = draw(pattern, [tile]);
      expect(root.style.backgroundColor).toBe('rgb(255, 238, 221)');
      const ink = q<HTMLElement>('[data-role="pattern"]');
      expect(ink?.style.backgroundColor).toBe('rgb(17, 34, 51)');
      expect(ink?.style.maskImage).toBe('url("test://asset/pat?q=preview")');
      expect(ink?.style.maskRepeat).toBe('repeat');
      expect(assetUrl).toHaveBeenCalledWith('pat', 'preview');
    });

    it('sizes the tile in mm from the scale, the same at every quality', () => {
      const sizes = (['thumb', 'preview', 'export'] as const).map(
        (quality) =>
          draw(pattern, [tile], quality).q<HTMLElement>('[data-role="pattern"]')?.style.maskSize,
      );
      // 20 mm at scale 1; the height follows the tile's own aspect ratio.
      expect(sizes).toEqual(['40mm auto', '40mm auto', '40mm auto']);
    });

    it('starts the tiles at the corner of the background', () => {
      const ink = draw(pattern, [tile]).q<HTMLElement>('[data-role="pattern"]');
      expect(ink?.style.maskPosition).toBe('0px 0px');
      expect(ink?.style.inset).toBe('0px');
    });
  });

  describe('image', () => {
    const img = asset('bg', 'background', { w: 2000, h: 1000 });
    const base = {
      kind: 'image',
      assetId: 'bg',
      fit: 'cover',
      opacity: 1,
      blur: 0,
      tint: null,
    } as const;

    it('covers the box', () => {
      const { q, assetUrl } = draw(base, [img]);
      const layer = q<HTMLElement>('[data-role="image"]');
      expect(layer?.style.backgroundImage).toBe('url("test://asset/bg?q=preview")');
      expect(layer?.style.backgroundSize).toBe('cover');
      expect(layer?.style.backgroundRepeat).toBe('no-repeat');
      expect(layer?.style.backgroundPosition).toBe('center center');
      expect(assetUrl).toHaveBeenCalledWith('bg', 'preview');
    });

    it('fits the whole image in the box with contain', () => {
      const layer = draw({ ...base, fit: 'contain' }, [img]).q<HTMLElement>('[data-role="image"]');
      expect(layer?.style.backgroundSize).toBe('contain');
      expect(layer?.style.backgroundRepeat).toBe('no-repeat');
    });

    it('tiles the image at its size at 300 dpi, the same at every quality', () => {
      const w = (2000 / 300) * 25.4;
      const h = (1000 / 300) * 25.4;
      for (const quality of ['thumb', 'preview', 'export'] as const) {
        const layer = draw({ ...base, fit: 'tile' }, [img], quality).q<HTMLElement>(
          '[data-role="image"]',
        );
        expect(layer?.style.backgroundRepeat).toBe('repeat');
        const [tw, th] = (layer?.style.backgroundSize ?? '').split(' ').map(Number.parseFloat);
        expect(tw).toBeCloseTo(w, 2);
        expect(th).toBeCloseTo(h, 2);
      }
    });

    it('tiles an image of unknown size at its natural size', () => {
      const layer = draw({ ...base, fit: 'tile' }, [asset('bg', 'background')]).q<HTMLElement>(
        '[data-role="image"]',
      );
      expect(layer?.style.backgroundSize).toBe('auto');
    });

    it('applies opacity to the whole background', () => {
      expect(draw({ ...base, opacity: 0.4 }, [img]).root.style.opacity).toBe('0.4');
      expect(draw(base, [img]).root.style.opacity).toBe('');
    });

    it('draws no blur and no tint by default', () => {
      const { q } = draw(base, [img]);
      expect(q<HTMLElement>('[data-role="image"]')?.style.filter).toBe('');
      expect(q('[data-role="tint"]')).toBeNull();
    });

    it('blurs by a length in mm converted to CSS px, on a layer that overflows the box so the edges stay sharp', () => {
      const { q } = draw({ ...base, blur: 2 }, [img]);
      const layer = q<HTMLElement>('[data-role="image"]');
      expect(layer?.style.filter).toBe(`blur(${Math.round(2 * MM_TO_PX * 1e4) / 1e4}px)`);
      expect(layer?.style.inset).toBe('-4mm');
    });

    it('keeps the tiles where they would be without the blur overflow', () => {
      const layer = draw({ ...base, fit: 'tile', blur: 2 }, [img]).q<HTMLElement>(
        '[data-role="image"]',
      );
      expect(layer?.style.backgroundPosition).toBe('4mm 4mm');
    });

    it('tints the image only where it is drawn, by multiplying the tint colour in', () => {
      const { q } = draw({ ...base, fit: 'contain', tint: '#3366cc' }, [img]);
      const tint = q<HTMLElement>('[data-role="tint"]');
      expect(tint?.style.backgroundColor).toBe('rgb(51, 102, 204)');
      expect(tint?.style.mixBlendMode).toBe('multiply');
      expect(tint?.style.maskImage).toBe('url("test://asset/bg?q=preview")');
      expect(tint?.style.maskSize).toBe('contain');
      expect(tint?.style.maskRepeat).toBe('no-repeat');
    });

    it('keeps the blend of the tint inside the background', () => {
      expect(draw({ ...base, tint: '#3366cc' }, [img]).root.style.isolation).toBe('isolate');
    });
  });
});
