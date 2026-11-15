import { describe, expect, it } from 'vitest';
import { MASK_PRESETS, featherCss, maskCss } from './masks';

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
    expect([...MASK_PRESETS]).toEqual([
      'arch',
      'blob',
      'brush',
      'circle',
      'diamond',
      'heart',
      'hexagon',
      'star',
      'torn',
      'wave',
    ]);
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

  it('draws nothing for a frame with no area', () => {
    for (const preset of MASK_PRESETS) {
      expect(maskCss({ kind: 'preset', preset }, { w: 0, h: 40 })).toEqual({});
      expect(maskCss({ kind: 'preset', preset }, { w: 40, h: 0 })).toEqual({});
    }
  });

  describe.each(['torn', 'wave', 'blob', 'brush'])('irregular preset %s', (preset) => {
    const outlineIn = (frame: { w: number; h: number }) =>
      maskCss({ kind: 'preset', preset }, frame).outline ?? '';

    it.each([
      { w: 30, h: 30 },
      { w: 200, h: 120 },
      { w: 20, h: 300 },
      { w: 3, h: 3 },
    ])('stays inside a $w x $h mm frame, whatever its size', (frame) => {
      const points = pairs(outlineIn(frame));
      expect(points.length).toBeGreaterThan(4);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(frame.w + 1e-6);
        expect(y).toBeLessThanOrEqual(frame.h + 1e-6);
      }
    });

    it('is the same shape every time', () => {
      expect(outlineIn(FRAME)).toBe(outlineIn({ ...FRAME }));
    });

    it('is not a rectangle, an ellipse or any regular figure: it has many distinct points', () => {
      const points = pairs(outlineIn({ w: 120, h: 80 }));
      expect(new Set(points.map(([x, y]) => `${x},${y}`)).size).toBeGreaterThan(20);
    });
  });

  it('gives a torn edge teeth of a fixed depth, so a large frame has more of them', () => {
    const small = pairs(
      maskCss({ kind: 'preset', preset: 'torn' }, { w: 60, h: 40 }).outline ?? '',
    );
    const large = pairs(
      maskCss({ kind: 'preset', preset: 'torn' }, { w: 240, h: 160 }).outline ?? '',
    );
    expect(large.length).toBeGreaterThan(2 * small.length);
    // How far in from the nearest side a point of the outline is.
    const inset = ([x, y]: [number, number], w: number, h: number) => Math.min(x, w - x, y, h - y);
    expect(Math.max(...large.map((p) => inset(p, 240, 160)))).toBeLessThanOrEqual(3);
    expect(Math.max(...large.map((p) => inset(p, 240, 160)))).toBeGreaterThan(1.5);
    // Some points sit on the frame itself, so the shape still fills it.
    expect(Math.min(...large.map((p) => inset(p, 240, 160)))).toBe(0);
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

describe('featherCss', () => {
  const decode = (css: ReturnType<typeof featherCss>): string => {
    const match = /^url\("data:image\/svg\+xml,([^"]*)"\)$/.exec(css?.maskImage ?? '');
    return decodeURIComponent(match?.[1] ?? '');
  };

  it('is nothing when there is no feather', () => {
    expect(featherCss({ kind: 'rect' }, FRAME, 0)).toBeUndefined();
    expect(featherCss({ kind: 'rect' }, FRAME, -2)).toBeUndefined();
    expect(featherCss({ kind: 'rect' }, FRAME, Number.NaN)).toBeUndefined();
  });

  it('stretches one SVG image over the frame, once', () => {
    const css = featherCss({ kind: 'rect' }, FRAME, 5);
    expect(css?.maskSize).toBe('100% 100%');
    expect(css?.maskRepeat).toBe('no-repeat');
    const svg = decode(css);
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('viewBox="0 0 80 50"');
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it('fades the outline from nothing at the edge to full at the feather width', () => {
    // Pull the edge in by half the feather, then blur it by a quarter of it either side.
    const svg = decode(featherCss({ kind: 'rect' }, FRAME, 6));
    expect(svg).toContain('<feMorphology operator="erode" radius="3"/>');
    expect(svg).toContain('<feGaussianBlur stdDeviation="1.5"/>');
  });

  it('follows the shape of the mask', () => {
    expect(decode(featherCss({ kind: 'rect' }, FRAME, 4))).toContain(
      '<rect width="80" height="50"',
    );
    expect(decode(featherCss({ kind: 'rounded', radius: 6 }, FRAME, 4))).toContain('rx="6"');
    expect(decode(featherCss({ kind: 'ellipse' }, FRAME, 4))).toContain(
      '<ellipse cx="40" cy="25" rx="40" ry="25"',
    );
    const outline = maskCss({ kind: 'preset', preset: 'heart' }, FRAME).outline;
    expect(decode(featherCss({ kind: 'preset', preset: 'heart' }, FRAME, 4))).toContain(
      `<path d="${outline}"`,
    );
  });

  it('treats an unknown preset and an unset radius as a rect', () => {
    expect(decode(featherCss({ kind: 'preset', preset: 'nope' }, FRAME, 4))).toContain('<rect ');
    const svg = decode(featherCss({ kind: 'rounded' }, FRAME, 4));
    expect(svg).toContain('<rect ');
    expect(svg).not.toContain('rx=');
  });

  it('never fades past the middle of the short side', () => {
    // A 15 mm feather on a 20 mm frame would leave nothing to see: it is held to 10 mm.
    const svg = decode(featherCss({ kind: 'rect' }, { w: 40, h: 20 }, 15));
    expect(svg).toContain('<feMorphology operator="erode" radius="5"/>');
    expect(svg).toContain('<feGaussianBlur stdDeviation="2.5"/>');
  });

  it('makes a data URI that holds no quote, parenthesis or space', () => {
    const css = featherCss({ kind: 'preset', preset: 'star' }, FRAME, 4);
    const uri = /^url\("([^"]*)"\)$/.exec(css?.maskImage ?? '')?.[1] ?? '';
    expect(uri).toMatch(/^data:image\/svg\+xml,[^"'() ]+$/);
  });
});
