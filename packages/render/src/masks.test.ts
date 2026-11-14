import { describe, expect, it } from 'vitest';
import { MASK_PRESETS, maskCss } from './masks';

const FRAME = { w: 80, h: 50 };

/** Every x y pair of an absolute path made of M, L, C and Z commands. */
function pairs(d: string): [number, number][] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2)
    out.push([numbers[i] as number, numbers[i + 1] as number]);
  return out;
}

/** The text between `path('` and `')`. */
const pathOf = (clipPath: string | undefined): string =>
  /^path\('([^']*)'\)$/.exec(clipPath ?? '')?.[1] ?? '';

describe('maskCss', () => {
  it('leaves a rect frame unmasked', () => {
    expect(maskCss({ kind: 'rect' }, FRAME)).toEqual({});
  });

  it('turns a rounded mask into a border-radius in mm', () => {
    expect(maskCss({ kind: 'rounded', radius: 4 }, FRAME)).toEqual({ borderRadius: '4mm' });
    expect(maskCss({ kind: 'rounded', radius: 2.5 }, FRAME)).toEqual({ borderRadius: '2.5mm' });
  });

  it('treats a rounded mask with no or a zero radius as a rect', () => {
    expect(maskCss({ kind: 'rounded' }, FRAME)).toEqual({});
    expect(maskCss({ kind: 'rounded', radius: 0 }, FRAME)).toEqual({});
  });

  it('turns an ellipse mask into a 50% border-radius', () => {
    expect(maskCss({ kind: 'ellipse' }, FRAME)).toEqual({ borderRadius: '50%' });
  });

  it('falls back to a rect for an unknown or missing preset', () => {
    expect(maskCss({ kind: 'preset', preset: 'not-a-shape' }, FRAME)).toEqual({});
    expect(maskCss({ kind: 'preset' }, FRAME)).toEqual({});
    expect(maskCss({ kind: 'preset', preset: 'constructor' }, FRAME)).toEqual({});
    expect(maskCss({ kind: 'preset', preset: '__proto__' }, FRAME)).toEqual({});
  });

  it('lists the presets', () => {
    expect([...MASK_PRESETS]).toEqual(['arch', 'circle', 'diamond', 'heart', 'hexagon', 'star']);
  });

  describe.each([...MASK_PRESETS])('preset %s', (preset) => {
    const css = maskCss({ kind: 'preset', preset }, FRAME);

    it('is a closed clip-path in px and an outline in mm', () => {
      expect(css.borderRadius).toBeUndefined();
      expect(pathOf(css.clipPath)).toMatch(/^M[^M]*Z$/);
      expect(css.outline).toMatch(/^M[^M]*Z$/);
    });

    it('draws the same shape in both units', () => {
      const mmPoints = pairs(css.outline ?? '');
      const pxPoints = pairs(pathOf(css.clipPath));
      expect(pxPoints).toHaveLength(mmPoints.length);
      mmPoints.forEach(([x, y], i) => {
        expect(pxPoints[i]?.[0]).toBeCloseTo(x * (96 / 25.4), 1);
        expect(pxPoints[i]?.[1]).toBeCloseTo(y * (96 / 25.4), 1);
      });
    });

    it('stays inside the frame and touches its limiting edges', () => {
      const points = pairs(css.outline ?? '');
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...xs)).toBeLessThanOrEqual(FRAME.w + 1e-6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(FRAME.h + 1e-6);
      // Fills the frame along at least one axis.
      const fillsW = Math.max(...xs) - Math.min(...xs) > FRAME.w - 1e-3;
      const fillsH = Math.max(...ys) - Math.min(...ys) > FRAME.h - 1e-3;
      expect(fillsW || fillsH).toBe(true);
    });
  });

  it('keeps a circle round in a frame that is not square', () => {
    const points = pairs(
      maskCss({ kind: 'preset', preset: 'circle' }, { w: 80, h: 50 }).outline ?? '',
    );
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(50, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(50, 3);
    // Centred in the frame.
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(40, 3);
  });

  it('gives an arch a round top as wide as the frame', () => {
    const outline = maskCss({ kind: 'preset', preset: 'arch' }, { w: 40, h: 60 }).outline ?? '';
    const points = pairs(outline);
    const xs = points.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(0, 3);
    expect(Math.max(...xs)).toBeCloseTo(40, 3);
    // The bottom is flat and square: both bottom corners are points of the path.
    expect(points).toContainEqual([0, 60]);
    expect(points).toContainEqual([40, 60]);
  });

  it('rounds the path numbers', () => {
    const outline = maskCss(
      { kind: 'preset', preset: 'star' },
      { w: 33.333333, h: 33.333333 },
    ).outline;
    expect(outline).not.toMatch(/\d\.\d{4,}/);
  });
});
