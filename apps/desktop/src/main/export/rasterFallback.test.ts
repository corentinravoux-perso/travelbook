import { describe, expect, it } from 'vitest';
import { newElement, newSpread, type PhotoElement, type TextElement } from '@travelbook/core';
import { rasterReasons } from './rasterFallback';

const photo = (patch: Partial<PhotoElement> = {}): PhotoElement => ({
  ...newElement('photo', { x: 0, y: 0, w: 50, h: 50 }),
  assetId: 'a',
  ...patch,
});
const text = (patch: Partial<TextElement> = {}): TextElement => ({
  ...newElement('text', { x: 0, y: 0, w: 50, h: 20 }),
  ...patch,
});
const spreadWith = (...elements: (PhotoElement | TextElement)[]) => ({
  ...newSpread('inner'),
  elements,
});
const shadow = { dx: 1, dy: 1, blur: 2, color: '#000000' };

describe('rasterReasons', () => {
  it('has none for a page whose effects are drawn another way', () => {
    const p = photo({
      shadow,
      adjust: {
        brightness: 1,
        contrast: 1,
        saturation: 1.3,
        grayscale: 0,
        sepia: 0,
        vignette: 0.5,
      },
    });
    const t = text({ shadow });
    expect(rasterReasons(spreadWith(p, t), [p])).toEqual([]);
  });
  it('flags a photo with a shadow and a feathered edge', () => {
    const p = photo({ shadow, edge: { feather: 2 } });
    expect(rasterReasons(spreadWith(p), [p])).toEqual(['photo with a shadow and a feathered edge']);
  });
  it('does not flag a feathered photo without a shadow', () => {
    const p = photo({ edge: { feather: 2 } });
    expect(rasterReasons(spreadWith(p), [p])).toEqual([]);
  });
  it('flags a text with a shadow and an outline but no fill', () => {
    const t = text({ shadow, outline: { width: 0.5, color: '#000000' } });
    expect(rasterReasons(spreadWith(t), [])).toEqual([
      'text with a shadow and an outline but no fill',
    ]);
    const filled = text({
      shadow,
      outline: { width: 0.5, color: '#000000' },
      box: { fill: '#ffffff', padding: 1 },
    });
    expect(rasterReasons(spreadWith(filled), [])).toEqual([]);
  });
});
