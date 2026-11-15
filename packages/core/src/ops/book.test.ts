import { describe, expect, it } from 'vitest';
import { setBookSettings } from './book';
import { OpError } from './errors';
import { addElement } from './elements';
import { freshBook, shape, useCounterIds } from './test-helpers';

useCounterIds();

describe('setBookSettings', () => {
  it('changes only the fields given', () => {
    const book = freshBook(1);
    const out = setBookSettings(book, {
      bleed: 5,
      pageRule: { min: 32, multiple: 4 },
      settings: { frenchTypography: false },
    });
    expect(out).toMatchObject({
      bleed: 5,
      coverBleed: 3,
      safeMargin: 8,
      pageRule: { min: 32, multiple: 4 },
      settings: { frenchTypography: false, dpiGood: 250, dpiLow: 150 },
    });
  });

  it('returns a new book and leaves the old one alone', () => {
    const book = freshBook(1);
    const out = setBookSettings(book, { spineWidth: 12 });
    expect(book.spineWidth).toBe(0);
    expect(out.spineWidth).toBe(12);
  });

  it('moves the front page with the spine and keeps spine content centred on it', () => {
    let book = setBookSettings(freshBook(1), { spineWidth: 10 });
    const cover = book.cover.id;
    book = addElement(book, cover, shape('back', 10, 10, 50, 50));
    book = addElement(book, cover, shape('spine', 211, 20, 8, 100)); // centre 215 = 210 + 5
    book = addElement(book, cover, shape('front', 230, 10, 50, 50));
    const out = setBookSettings(book, { spineWidth: 20 });
    const at = (id: string) => out.cover.elements.find((e) => e.id === id)!;
    expect(at('back').x).toBe(10);
    expect(at('front').x).toBe(240);
    expect(at('spine').x + 4).toBe(220); // centre of the new spine: 210 + 10
  });

  it.each([
    { bleed: -1 },
    { spineWidth: Number.NaN },
    { pageRule: { min: 0, multiple: 2 as const } },
    { pageRule: { min: 24, multiple: 3 as unknown as 2 } },
    { settings: { dpiGood: 100 } },
  ])('rejects %j', (patch) => {
    expect(() => setBookSettings(freshBook(1), patch)).toThrow(OpError);
  });
});
