import { DEFAULT_MAP_STYLE, normalizeStyle } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { STYLE_GROUPS, dashId, getToken, setToken, uncoveredTokens } from './styleModel';

describe('style tokens', () => {
  it('every token of MapStyle has a control (but styleVersion and rough, which has its own)', () => {
    expect(uncoveredTokens()).toEqual([]);
  });

  it('every control points at a token of the default style, and no two share one', () => {
    const paths = STYLE_GROUPS.flatMap((g) => g.controls.map((c) => c.path.join('.')));
    expect(new Set(paths).size).toBe(paths.length);
    for (const g of STYLE_GROUPS)
      for (const c of g.controls) expect(getToken(DEFAULT_MAP_STYLE, c.path)).not.toBeUndefined();
  });

  it('every control label is unique, so a control can be found by its name', () => {
    const labels = STYLE_GROUPS.flatMap((g) => g.controls.map((c) => c.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('setToken sets one token on a copy and the result stays a valid style', () => {
    const style = normalizeStyle(DEFAULT_MAP_STYLE);
    const next = setToken(style, ['label', 'halo', 'width'], 1.4);
    expect(next.label.halo.width).toBe(1.4);
    expect(style.label.halo.width).toBe(DEFAULT_MAP_STYLE.label.halo.width);
    expect(normalizeStyle(next)).toEqual(next);
  });

  it('dashId names the known dashes and "custom" for any other', () => {
    expect(dashId(null)).toBe('solid');
    expect(dashId([2.2, 1.5])).toBe('dashed');
    expect(dashId([3, 3])).toBe('custom');
  });
});
