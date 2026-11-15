import { render } from '@testing-library/react';
import { MM_TO_PX, visibleRect, type PhotoElement } from '@travelbook/core';
import { describe, expect, it, vi } from 'vitest';
import { asset, photo, urlOf } from '../test-helpers';
import type { AssetUrl, Quality } from '../types';
import { PhotoView } from './PhotoView';
import { adjustFilter, imagePlacement, vignetteGradient } from './photoStyle';

const LANDSCAPE = asset('p1', 'photo', { w: 6000, h: 4000 });

function draw(
  el: PhotoElement,
  quality: Quality = 'preview',
  over: {
    asset?: typeof LANDSCAPE | undefined;
    assetUrl?: AssetUrl;
    showEmptySlots?: boolean;
  } = {},
) {
  const view = render(
    <PhotoView
      el={el}
      asset={'asset' in over ? over.asset : LANDSCAPE}
      quality={quality}
      assetUrl={over.assetUrl ?? urlOf}
      showEmptySlots={over.showEmptySlots ?? false}
    />,
  );
  const q = <T extends Element>(selector: string) => view.container.querySelector<T>(selector);
  return {
    ...view,
    q,
    img: q<HTMLImageElement>('img'),
    frame: q<HTMLElement>('[data-role="frame"]'),
  };
}

const frame = { x: 0, y: 0, w: 90, h: 60 };

describe('imagePlacement', () => {
  it('shows the whole image at scale 1 when frame and image have the same aspect', () => {
    expect(
      imagePlacement({ w: 6000, h: 4000 }, { w: 90, h: 60 }, { scale: 1, cx: 0.5, cy: 0.5 }),
    ).toEqual({
      left: '0%',
      top: '0%',
      width: '100%',
      height: '100%',
    });
  });

  it('crops the sides of an image that is wider than the frame', () => {
    // Square frame: the window is 4000 x 4000 of 6000 x 4000, centred.
    expect(
      imagePlacement({ w: 6000, h: 4000 }, { w: 50, h: 50 }, { scale: 1, cx: 0.5, cy: 0.5 }),
    ).toEqual({
      left: '-25%',
      top: '0%',
      width: '150%',
      height: '100%',
    });
  });

  it('follows visibleRect for a zoomed and moved crop', () => {
    const pixel = { w: 6000, h: 4000 };
    const crop = { scale: 2.5, cx: 0.3, cy: 0.8 };
    const { sx, sy, sw, sh } = visibleRect(pixel, { w: 90, h: 60 }, crop);
    const placed = imagePlacement(pixel, { w: 90, h: 60 }, crop);
    expect(Number.parseFloat(placed.left)).toBeCloseTo((-sx / sw) * 100, 2);
    expect(Number.parseFloat(placed.top)).toBeCloseTo((-sy / sh) * 100, 2);
    expect(Number.parseFloat(placed.width)).toBeCloseTo((pixel.w / sw) * 100, 2);
    expect(Number.parseFloat(placed.height)).toBeCloseTo((pixel.h / sh) * 100, 2);
  });
});

describe('adjustFilter', () => {
  it('is undefined when every adjustment is neutral', () => {
    expect(
      adjustFilter({ brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0 }),
    ).toBeUndefined();
  });

  it('lists only the adjustments that change something', () => {
    expect(
      adjustFilter({ brightness: 1.2, contrast: 1, saturation: 0.5, grayscale: 0, sepia: 0 }),
    ).toBe('brightness(1.2) saturate(0.5)');
    expect(
      adjustFilter({ brightness: 1, contrast: 1.1, saturation: 1, grayscale: 1, sepia: 0.3 }),
    ).toBe('contrast(1.1) grayscale(1) sepia(0.3)');
  });
});

describe('PhotoView', () => {
  it('asks for the image of its asset at the quality of the view, naming the element', () => {
    const assetUrl = vi.fn(urlOf);
    const el = photo(frame, { id: 'ph', assetId: 'p1' });
    const { img } = draw(el, 'thumb', { assetUrl });
    expect(assetUrl).toHaveBeenCalledWith('p1', 'thumb', el);
    expect(img?.getAttribute('src')).toBe('test://asset/p1?q=thumb&el=ph');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.draggable).toBe(false);
  });

  it.each(['thumb', 'preview'] as const)(
    'places the image from visibleRect at %s quality',
    (quality) => {
      const el = photo(frame, { assetId: 'p1', crop: { scale: 2, cx: 0.5, cy: 0.5 } });
      const { img } = draw(el, quality);
      expect([img?.style.left, img?.style.top, img?.style.width, img?.style.height]).toEqual([
        '-50%',
        '-50%',
        '200%',
        '200%',
      ]);
      expect(img?.style.position).toBe('absolute');
      expect(img?.style.maxWidth).toBe('none');
    },
  );

  it('fills the frame with the image in export quality, whatever the crop', () => {
    const el = photo(frame, { assetId: 'p1', crop: { scale: 3, cx: 0.2, cy: 0.9 } });
    const { img } = draw(el, 'export');
    expect([img?.style.left, img?.style.top, img?.style.width, img?.style.height]).toEqual([
      '0px',
      '0px',
      '100%',
      '100%',
    ]);
    expect(img?.style.objectFit).toBe('fill');
  });

  it('keeps the mask shape in export quality, where the CSS still cuts it', () => {
    const el = photo(frame, {
      assetId: 'p1',
      mask: { kind: 'preset', preset: 'heart' },
      adjust: {
        brightness: 1.3,
        contrast: 1,
        saturation: 1,
        grayscale: 0,
        sepia: 0,
        vignette: 0.6,
      },
      edge: { feather: 4 },
    });
    const { frame: f } = draw(el, 'export');
    expect(f?.style.clipPath).toMatch(/^path\(/);
    expect(f?.style.overflow).toBe('hidden');
  });

  it('falls back to a cover fit around the crop centre when the pixel size is unknown', () => {
    const el = photo(frame, { assetId: 'p1', crop: { scale: 2, cx: 0.25, cy: 0.75 } });
    const { img } = draw(el, 'preview', { asset: asset('p1') });
    expect(img?.style.objectFit).toBe('cover');
    expect(img?.style.objectPosition).toBe('25% 75%');
    expect(img?.style.transform).toBe('scale(2)');
    expect(img?.style.transformOrigin).toBe('25% 75%');
  });

  it('draws the image even when the album does not list the asset', () => {
    const { img } = draw(photo(frame, { id: 'x', assetId: 'gone' }), 'preview', {
      asset: undefined,
    });
    expect(img?.getAttribute('src')).toBe('test://asset/gone?q=preview&el=x');
    expect(img?.style.objectFit).toBe('cover');
  });

  describe('flips', () => {
    const flipOf = (patch: Partial<PhotoElement>) =>
      draw(photo(frame, { assetId: 'p1', ...patch })).q<HTMLElement>('[data-role="flip"]');

    it('does not transform an image that is not flipped', () => {
      expect(flipOf({})?.style.transform).toBe('');
    });
    it('mirrors horizontally with scaleX(-1)', () => {
      expect(flipOf({ flipH: true })?.style.transform).toBe('scaleX(-1)');
    });
    it('mirrors vertically with scaleY(-1)', () => {
      expect(flipOf({ flipV: true })?.style.transform).toBe('scaleY(-1)');
    });
    it('mirrors both ways with scale(-1)', () => {
      expect(flipOf({ flipH: true, flipV: true })?.style.transform).toBe('scale(-1)');
    });
    it('flips the image, not the frame around it', () => {
      const { q } = draw(photo(frame, { assetId: 'p1', flipH: true }));
      expect(q<HTMLElement>('[data-role="frame"]')?.style.transform).toBe('');
      expect(q('[data-role="flip"] img')).not.toBeNull();
    });
  });

  describe('adjustments', () => {
    const adjust = {
      brightness: 1.2,
      contrast: 1,
      saturation: 1,
      grayscale: 0.5,
      sepia: 0,
      vignette: 0,
    };

    it('puts no filter on the image when they are neutral', () => {
      expect(draw(photo(frame, { assetId: 'p1' })).img?.style.filter).toBe('');
    });
    it.each(['thumb', 'preview'] as const)('puts a CSS filter on the image at %s quality', (q) => {
      const { img } = draw(photo(frame, { assetId: 'p1', adjust }), q);
      expect(img?.style.filter).toBe('brightness(1.2) grayscale(0.5)');
    });
    it('puts none on the export image, which carries the adjustments itself', () => {
      const { img } = draw(photo(frame, { assetId: 'p1', adjust }), 'export');
      expect(img?.style.filter).toBe('');
    });
  });

  describe('vignette', () => {
    const adjust = (vignette: number) => ({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
      sepia: 0,
      vignette,
    });
    const overlay = (el: PhotoElement, quality: Quality = 'preview') =>
      draw(el, quality).q<HTMLElement>('[data-role="vignette"]');

    it('draws no overlay when there is none', () => {
      expect(overlay(photo(frame, { assetId: 'p1' }))).toBeNull();
    });
    it('draws a dark gradient over the image, inside the frame, when it is set', () => {
      const { q } = draw(photo(frame, { assetId: 'p1', adjust: adjust(0.5) }));
      const layer = q<HTMLElement>('[data-role="frame"] > [data-role="vignette"]');
      expect(layer).not.toBeNull();
      // jsdom drops the parts of the gradient that are CSS defaults, so only its stops are compared.
      expect(layer?.style.backgroundImage).toMatch(/^radial-gradient\(/);
      expect(layer?.style.backgroundImage).toContain('rgba(0, 0, 0, 0.5) 100%');
      expect(layer?.style.pointerEvents).toBe('none');
    });
    it('sits over the image and under the border, and does not turn with the flip', () => {
      const { q } = draw(
        photo(frame, {
          assetId: 'p1',
          flipH: true,
          adjust: adjust(0.5),
          border: { width: 1, color: '#ffffff' },
        }),
      );
      const kids = [...(q('[data-role="frame"]')?.children ?? [])].map((c) =>
        c.getAttribute('data-role'),
      );
      expect(kids).toEqual(['flip', 'vignette', 'border']);
    });
    it('is darker in the corners the stronger it is', () => {
      const alpha = (g: string) => Number(/rgba\(0, 0, 0, ([\d.]+)\) 100%/.exec(g)?.[1]);
      expect(alpha(vignetteGradient(1))).toBe(1);
      expect(alpha(vignetteGradient(0.25))).toBe(0.25);
      expect(vignetteGradient(0.5)).toMatch(
        /^radial-gradient\(ellipse farthest-corner at 50% 50%, /,
      );
    });
    it('does not darken the middle of the photo', () => {
      expect(vignetteGradient(0.8)).toMatch(/rgba\(0, 0, 0, 0\) 4\d%/);
    });
    it('is not drawn in export quality, whose image carries it', () => {
      expect(overlay(photo(frame, { assetId: 'p1', adjust: adjust(0.5) }), 'export')).toBeNull();
    });
    it('is not drawn on an empty frame', () => {
      const slot = photo(frame, { adjust: adjust(0.5) });
      const view = draw(slot, 'preview', { showEmptySlots: true });
      expect(view.q('[data-role="vignette"]')).toBeNull();
    });
  });

  describe('feathered edge', () => {
    const feathered = (feather: number, patch: Partial<PhotoElement> = {}) =>
      photo(frame, { assetId: 'p1', edge: { feather }, ...patch });

    it('has no mask when the edge is sharp', () => {
      const { frame: f } = draw(photo(frame, { assetId: 'p1' }));
      expect(f?.style.maskImage).toBe('');
      expect(
        draw(photo(frame, { assetId: 'p1', edge: { feather: 0 } })).frame?.style.maskImage,
      ).toBe('');
    });
    it('fades the outline of the frame over the feather width, in mm', () => {
      const { frame: f } = draw(feathered(5));
      expect(f?.style.maskImage).toMatch(/^url\("data:image\/svg\+xml,/);
      const svg = decodeURIComponent(f?.style.maskImage ?? '');
      expect(svg).toContain('viewBox="0 0 90 60"');
      expect(svg).toContain('<feMorphology operator="erode" radius="2.5"/>');
      expect(f?.style.maskSize).toBe('100% 100%');
    });
    it('goes with the frame mask: the same node is clipped to the shape', () => {
      const { frame: f } = draw(feathered(4, { mask: { kind: 'preset', preset: 'heart' } }));
      expect(f?.style.clipPath).toMatch(/^path\(/);
      expect(f?.style.maskImage).toMatch(/^url\(/);
      expect(decodeURIComponent(f?.style.maskImage ?? '')).toContain('<path d="M ');
    });
    it('follows a rounded mask', () => {
      const { frame: f } = draw(feathered(4, { mask: { kind: 'rounded', radius: 6 } }));
      expect(f?.style.borderRadius).toBe('6mm');
      expect(decodeURIComponent(f?.style.maskImage ?? '')).toContain('rx="6"');
    });
    it.each(['thumb', 'preview'] as const)('is drawn at %s quality', (q) => {
      expect(draw(feathered(5), q).frame?.style.maskImage).toMatch(/^url\(/);
    });
    it('is not drawn in export quality, whose image carries it', () => {
      expect(draw(feathered(5), 'export').frame?.style.maskImage).toBe('');
    });
    it('is not drawn on an empty frame', () => {
      const view = draw(photo(frame, { edge: { feather: 5 } }), 'preview', {
        showEmptySlots: true,
      });
      expect(view.frame?.style.maskImage).toBe('');
    });
  });

  describe('mask', () => {
    it('leaves a rect frame square', () => {
      const { frame: f } = draw(photo(frame, { assetId: 'p1' }));
      expect(f?.style.overflow).toBe('hidden');
      expect(f?.style.borderRadius).toBe('');
      expect(f?.style.clipPath).toBe('');
    });
    it('rounds the frame in mm', () => {
      const { frame: f } = draw(
        photo(frame, { assetId: 'p1', mask: { kind: 'rounded', radius: 6 } }),
      );
      expect(f?.style.borderRadius).toBe('6mm');
    });
    it('makes an ellipse with a 50% radius', () => {
      const { frame: f } = draw(photo(frame, { assetId: 'p1', mask: { kind: 'ellipse' } }));
      expect(f?.style.borderRadius).toBe('50%');
    });
    it('clips a preset to its path', () => {
      const { frame: f } = draw(
        photo(frame, { assetId: 'p1', mask: { kind: 'preset', preset: 'heart' } }),
      );
      expect(f?.style.clipPath).toMatch(/^path\(/);
    });
    it('draws an unknown preset as a rect', () => {
      const { frame: f } = draw(
        photo(frame, { assetId: 'p1', mask: { kind: 'preset', preset: 'nope' } }),
      );
      expect(f?.style.clipPath).toBe('');
      expect(f?.style.borderRadius).toBe('');
    });
  });

  describe('border', () => {
    it('draws none when there is none', () => {
      expect(draw(photo(frame, { assetId: 'p1' })).q('[data-role="border"]')).toBeNull();
    });
    it('draws it inside the frame, as wide as asked and in the corner radius', () => {
      const { q } = draw(
        photo(frame, {
          assetId: 'p1',
          mask: { kind: 'rounded', radius: 5 },
          border: { width: 1.5, color: '#112233' },
        }),
      );
      const border = q<HTMLElement>('[data-role="border"]');
      expect(border?.style.boxShadow).toBe('rgb(17, 34, 51) 0px 0px 0px 1.5mm inset');
      expect(border?.style.borderRadius).toBe('5mm');
      // On top of the image, and not flipped with it.
      expect(q('[data-role="flip"] [data-role="border"]')).toBeNull();
    });
    it('follows the outline of a preset, clipped to the shape so only its inside half shows', () => {
      const { q } = draw(
        photo(frame, {
          assetId: 'p1',
          mask: { kind: 'preset', preset: 'star' },
          border: { width: 2, color: '#ff0000' },
        }),
      );
      const path = q('[data-role="border"] path');
      expect(path?.getAttribute('stroke')).toBe('#ff0000');
      expect(path?.getAttribute('stroke-width')).toBe('4');
      expect(path?.getAttribute('fill')).toBe('none');
      expect(path?.getAttribute('d')).toMatch(/^M .* Z$/);
      expect(q<HTMLElement>('[data-role="border"]')?.style.clipPath).toMatch(/^path\(/);
      expect(q('[data-role="border"] g')?.getAttribute('transform')).toBe(`scale(${MM_TO_PX})`);
    });
  });

  describe('shadow', () => {
    it('draws none when there is none', () => {
      expect(
        draw(photo(frame, { assetId: 'p1' })).q<HTMLElement>('[data-role="shadow"]')?.style.filter,
      ).toBe('');
    });
    it('follows the shape of the frame (drop-shadow), the blur being a box-shadow blur radius', () => {
      const { q } = draw(
        photo(frame, {
          assetId: 'p1',
          mask: { kind: 'preset', preset: 'circle' },
          shadow: { dx: 1, dy: 2, blur: 4, color: '#000000' },
        }),
      );
      expect(q<HTMLElement>('[data-role="shadow"]')?.style.filter).toBe(
        'drop-shadow(rgb(0, 0, 0) 1mm 2mm 2mm)',
      );
      // The frame is inside the node that has the shadow.
      expect(q('[data-role="shadow"] [data-role="frame"]')).not.toBeNull();
    });
  });

  describe('empty slot', () => {
    const slot = photo(frame, { id: 'slot', mask: { kind: 'rounded', radius: 3 } });

    it('draws nothing unless empty slots are shown', () => {
      expect(draw(slot).container.firstChild).toBeNull();
    });
    it('draws a placeholder in the shape of the frame, without any text or image', () => {
      const { q, container } = draw(slot, 'preview', { showEmptySlots: true });
      const placeholder = q<HTMLElement>('[data-role="empty-slot"]');
      expect(placeholder).not.toBeNull();
      expect(q<HTMLElement>('[data-role="frame"]')?.style.borderRadius).toBe('3mm');
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('');
    });
  });
});
