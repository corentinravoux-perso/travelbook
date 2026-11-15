import { newBook } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { parseNumber, settingsText, validate } from './bookSettingsForm';

describe('settingsText', () => {
  it('shows the book as it is', () => {
    expect(settingsText(newBook({ title: 'T' }))).toMatchObject({
      width: '210',
      height: '297',
      bleed: '3',
      coverBleed: '3',
      safeMargin: '8',
      spineWidth: '0',
      pageMin: '24',
      pageMultiple: 2,
      dpiGood: '250',
      dpiLow: '150',
    });
  });
});

describe('parseNumber', () => {
  const range = { min: 0, max: 10 };
  it('accepts a comma and the bounds', () => {
    expect(parseNumber('2,5', range)).toBe(2.5);
    expect(parseNumber('0', range)).toBe(0);
    expect(parseNumber('10', range)).toBe(10);
  });
  it('refuses text, signs, out of range, and decimals where whole is asked', () => {
    for (const bad of ['', 'x', '-1', '10.1', '1e3', '2.5.1'])
      expect(parseNumber(bad, range)).toBeNull();
    expect(parseNumber('2.5', range, true)).toBeNull();
    expect(parseNumber('3', range, true)).toBe(3);
  });
});

describe('validate', () => {
  const ok = settingsText(newBook({ title: 'T' }));

  it('gives the values of a valid form', () => {
    const { values, invalid } = validate({ ...ok, spineWidth: '12', pageMultiple: 4 });
    expect(invalid).toEqual([]);
    expect(values).toMatchObject({
      format: { width: 210, height: 297 },
      scaleContent: true,
      spineWidth: 12,
      pageRule: { min: 24, multiple: 4 },
      settings: { frenchTypography: true, dpiGood: 250, dpiLow: 150 },
    });
  });

  it('names every invalid field', () => {
    const { values, invalid } = validate({ ...ok, width: '10', bleed: '11', pageMin: '2.5' });
    expect(values).toBeNull();
    expect(invalid).toEqual(['width', 'bleed', 'pageMin']);
  });

  it('refuses a good resolution below the low one', () => {
    expect(validate({ ...ok, dpiGood: '100' }).invalid).toEqual(['dpiGood']);
  });
});
