import { describe, expect, it } from 'vitest';
import { ElementSchema } from '@travelbook/core';
import { isEmptyDoc } from './textActions';
import { BOOK_FONTS } from '../fonts/bookFonts';
import { TEXT_PRESETS, blankTextElement, presetElement } from './textPresets';

describe('text presets', () => {
  it('make valid text elements in a bundled font', () => {
    for (const preset of TEXT_PRESETS) {
      const el = presetElement(preset, { x: 5, y: 6 });
      expect(ElementSchema.safeParse(el).success).toBe(true);
      expect(BOOK_FONTS.map((f) => f.css)).toContain(el.style.fontFamily);
      expect(isEmptyDoc(el.doc)).toBe(false);
      expect(el.w).toBe(preset.size.w);
    }
  });

  it('give the title and caption presets the roles templates look for', () => {
    const role = (id: string) =>
      presetElement(
        TEXT_PRESETS.find((p) => p.id === id)!,
        { x: 0, y: 0 },
      ).textRole;
    expect(role('title')).toBe('title');
    expect(role('caption')).toBe('caption');
    expect(role('body')).toBe('body');
    expect(role('subtitle')).toBeUndefined();
  });

  it('set the quote with French spacing', () => {
    const quote = presetElement(
      TEXT_PRESETS.find((p) => p.id === 'quote')!,
      { x: 0, y: 0 },
    );
    expect(JSON.stringify(quote.doc)).toContain('«\u00A0Citation\u202F»');
  });

  it('start a drawn text empty, in the given box', () => {
    const el = blankTextElement({ x: 1, y: 2, w: 30, h: 10 });
    expect(isEmptyDoc(el.doc)).toBe(true);
    expect([el.x, el.y, el.w, el.h]).toEqual([1, 2, 30, 10]);
  });
});
