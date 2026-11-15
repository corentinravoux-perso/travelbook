import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, FORMAT_PRESETS, matchPreset, parseSide } from './formats';

describe('format presets', () => {
  it('lists the spec presets in mm, A4 portrait first', () => {
    expect(FORMAT_PRESETS.map((p) => [p.width, p.height])).toEqual([
      [210, 297],
      [297, 210],
      [148, 210],
      [210, 210],
      [300, 300],
      [240, 320],
    ]);
    expect(DEFAULT_FORMAT.id).toBe('a4-portrait');
  });

  it('finds the preset of a size, and none for a free size', () => {
    expect(matchPreset(240, 320)?.id).toBe('portrait-24x32');
    expect(matchPreset(240, 321)).toBeUndefined();
  });
});

describe('parseSide', () => {
  it.each([
    ['240', 240],
    [' 24,5 ', null], // 24.5 is below the minimum
    ['50', 50],
    ['600', 600],
    ['150,5', 150.5],
    ['297.25', 297.25],
  ])('reads %j', (text, want) => {
    expect(parseSide(text)).toBe(want);
  });

  it.each(['', 'abc', '49.9', '600.1', '-100', '1e2', '12 mm'])('refuses %j', (text) => {
    expect(parseSide(text)).toBeNull();
  });
});
