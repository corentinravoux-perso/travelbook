import { describe, expect, it } from 'vitest';
import { parseField } from './parseField';

describe('parseField', () => {
  it('reads integers and decimals, with a comma or a point', () => {
    expect(parseField('12', 0, 20)).toBe(12);
    expect(parseField(' 2,5 ', 0, 20)).toBe(2.5);
    expect(parseField('0.75', 0, 20)).toBe(0.75);
  });
  it('reads negative numbers, with either minus sign', () => {
    expect(parseField('-3', -20, 20)).toBe(-3);
    expect(parseField('−1,5', -20, 20)).toBe(-1.5);
  });
  it('refuses what is out of range or not a number', () => {
    expect(parseField('21', 0, 20)).toBeNull();
    expect(parseField('-1', 0, 20)).toBeNull();
    expect(parseField('', 0, 20)).toBeNull();
    expect(parseField('abc', 0, 20)).toBeNull();
    expect(parseField('1,2,3', 0, 20)).toBeNull();
    expect(parseField('1e3', 0, 2000)).toBeNull();
  });
});
