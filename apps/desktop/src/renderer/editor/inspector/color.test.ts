import { describe, expect, it } from 'vitest';
import { joinColor, splitColor } from './color';

describe('splitColor', () => {
  it('reads a plain hex colour as opaque', () => {
    expect(splitColor('#FFAA00')).toEqual({ hex: '#ffaa00', alpha: 1 });
  });
  it('reads the opacity of an 8-digit hex colour', () => {
    expect(splitColor('#00000066')).toEqual({ hex: '#000000', alpha: 0.4 });
    expect(splitColor('#ffffff00')).toEqual({ hex: '#ffffff', alpha: 0 });
  });
  it('falls back to opaque black for anything else', () => {
    expect(splitColor('rgba(0, 0, 0, 0.3)')).toEqual({ hex: '#000000', alpha: 1 });
    expect(splitColor('white')).toEqual({ hex: '#000000', alpha: 1 });
    expect(splitColor('#fff')).toEqual({ hex: '#000000', alpha: 1 });
  });
});

describe('joinColor', () => {
  it('writes an opaque colour without an alpha part', () => {
    expect(joinColor('#ABCDEF', 1)).toBe('#abcdef');
    expect(joinColor('#abcdef', 0.999)).toBe('#abcdef');
  });
  it('writes the opacity as the last byte', () => {
    expect(joinColor('#000000', 0.4)).toBe('#00000066');
    expect(joinColor('#000000', 0)).toBe('#00000000');
  });
  it('round-trips what it wrote', () => {
    expect(splitColor(joinColor('#336699', 0.55))).toEqual({ hex: '#336699', alpha: 0.55 });
  });
  it('keeps the opacity within 0..1 and survives a bad colour', () => {
    expect(joinColor('#000000', 3)).toBe('#000000');
    expect(joinColor('nope', 0.5)).toBe('#00000080');
  });
});
