import { describe, expect, it } from 'vitest';
import { contrastRatio, shadeOf } from './color';

const luminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
};

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('is 1 for a colour on itself', () => {
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#c8423b', '#f1ece4')).toBe(contrastRatio('#f1ece4', '#c8423b'));
  });
  it('accepts upper-case hex', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });
});

describe('shadeOf', () => {
  it('returns a darker colour', () => {
    const s = shadeOf('#c8423b');
    expect(s).toMatch(/^#[0-9a-f]{6}$/);
    expect(luminance(s)).toBeLessThan(luminance('#c8423b'));
  });
  it('keeps black black', () => {
    expect(shadeOf('#000000')).toBe('#000000');
  });
  it('lowers HSL lightness by 35 %', () => {
    // #808080 is lightness 50.2 %; 65 % of it, 32.6 %, is #535353.
    expect(shadeOf('#808080')).toBe('#535353');
  });
  it('keeps a dark colour distinct from black', () => {
    // #24615b is lightness 26 %: a fixed 18-point step gave #0b1e1c, near black.
    const s = shadeOf('#24615b');
    expect(s).toBe('#173f3b');
  });
});
