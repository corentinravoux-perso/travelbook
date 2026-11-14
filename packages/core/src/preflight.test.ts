import { describe, expect, it } from 'vitest';
import { newBook, newElement } from './factory';
import { freshBook, inner, photo, shape, useCounterIds } from './ops/test-helpers';
import { clone } from './ops/util';
import { preflight, type PreflightIssue } from './preflight';
import type { AssetRef, Book, Element, Spread, TextElement } from './schema';

useCounterIds();

function asset(id: string, file: string, px?: { w: number; h: number }): AssetRef {
  return { id, kind: 'photo', file, originalName: file, sha256: id, ...(px ? { pixel: px } : {}) };
}

function text(id: string, x: number, y: number, w: number, h: number): TextElement {
  return { ...newElement('text', { x, y, w, h }), id };
}

/** A book that is clean: 24 pages and one asset A (500 x 500 px) whose file exists. */
function cleanBook(): { book: Book; files: Set<string> } {
  const book = newBook({ title: 't' });
  book.assets['A'] = asset('A', 'originals/a.jpg', { w: 500, h: 500 });
  return { book, files: new Set(['originals/a.jpg']) };
}

const place = (spread: Spread, ...els: Element[]): void => void spread.elements.push(...els);

describe('preflight', () => {
  it('reports nothing on a clean book', () => {
    const { book, files } = cleanBook();
    const s = book.spreads[1]!;
    place(s, photo('p', 10, 10, 50, 50, 'A'), text('t', 10, 100, 100, 20));
    expect(preflight(book, files)).toEqual([]);
  });

  describe('lowResolution', () => {
    it('reports a photo below dpiLow, with its dpi', () => {
      const { book, files } = cleanBook();
      book.assets['A'] = asset('A', 'originals/a.jpg', { w: 236, h: 236 });
      const s = book.spreads[1]!;
      place(s, photo('p', 10, 10, 50, 50, 'A'));
      expect(preflight(book, files)).toEqual([
        { kind: 'lowResolution', spreadId: s.id, elementId: 'p', dpi: 120 },
      ]);
    });

    it('takes the crop into account', () => {
      const { book, files } = cleanBook();
      book.assets['A'] = asset('A', 'originals/a.jpg', { w: 400, h: 400 }); // 203 dpi at 50 mm
      const s = book.spreads[1]!;
      const p = photo('p', 10, 10, 50, 50, 'A');
      place(s, p);
      expect(preflight(book, files)).toEqual([]);
      p.crop = { scale: 2, cx: 0.5, cy: 0.5 };
      expect(preflight(book, files)).toMatchObject([{ kind: 'lowResolution', dpi: 102 }]);
    });

    it('treats dpiLow itself as acceptable and anything under it as low', () => {
      const { book, files } = cleanBook();
      const s = book.spreads[1]!;
      place(s, photo('p', 10, 10, 25.4, 25.4, 'A')); // one inch
      book.assets['A'] = asset('A', 'originals/a.jpg', { w: 150, h: 150 });
      expect(preflight(book, files)).toEqual([]);
      book.assets['A'] = asset('A', 'originals/a.jpg', { w: 149, h: 149 });
      expect(preflight(book, files)).toMatchObject([{ kind: 'lowResolution', dpi: 149 }]);
      book.settings.dpiLow = 100;
      expect(preflight(book, files)).toEqual([]);
    });

    it('cannot judge a photo whose asset has no pixel size', () => {
      const { book, files } = cleanBook();
      book.assets['A'] = asset('A', 'originals/a.jpg');
      place(book.spreads[1]!, photo('p', 10, 10, 50, 50, 'A'));
      expect(preflight(book, files)).toEqual([]);
    });

    it('skips a frame with no area', () => {
      const { book, files } = cleanBook();
      book.assets['A'] = asset('A', 'originals/a.jpg', { w: 10, h: 10 });
      place(book.spreads[1]!, photo('p', 10, 10, 0, 50, 'A'), photo('q', 10, 10, 50, 0, 'A'));
      expect(preflight(book, files)).toEqual([]);
    });
  });

  describe('emptySlot', () => {
    it('reports a photo frame with no photo', () => {
      const { book, files } = cleanBook();
      const s = book.spreads[1]!;
      place(s, photo('p', 10, 10, 50, 50, null));
      expect(preflight(book, files)).toEqual([
        { kind: 'emptySlot', spreadId: s.id, elementId: 'p' },
      ]);
    });

    it('looks at the cover too', () => {
      const { book, files } = cleanBook();
      place(book.cover, photo('p', 10, 10, 50, 50, null));
      expect(preflight(book, files)).toEqual([
        { kind: 'emptySlot', spreadId: book.cover.id, elementId: 'p' },
      ]);
    });
  });

  describe('textOutsideSafe', () => {
    function issuesFor(...els: Element[]): PreflightIssue[] {
      const { book, files } = cleanBook();
      place(book.spreads[1]!, ...els);
      return preflight(book, files);
    }
    const flagged = (id: string): { kind: string; elementId: string }[] => [
      { kind: 'textOutsideSafe', elementId: id },
    ];

    it('reports a text box that crosses the safe margin of its page', () => {
      expect(issuesFor(text('t', 5, 20, 40, 10))).toMatchObject(flagged('t')); // left
      expect(issuesFor(text('t', 10, 285, 40, 10))).toMatchObject(flagged('t')); // bottom
      expect(issuesFor(text('t', 10, 4, 40, 10))).toMatchObject(flagged('t')); // top
      expect(issuesFor(text('t', 400, 20, 25, 10))).toMatchObject(flagged('t')); // right of right page
    });

    it('names the spread', () => {
      const { book, files } = cleanBook();
      const s = book.spreads[1]!;
      place(s, text('t', 5, 20, 40, 10));
      expect(preflight(book, files)).toEqual([
        { kind: 'textOutsideSafe', spreadId: s.id, elementId: 't' },
      ]);
    });

    it('accepts a box exactly on the safe area, or inside it, on either page', () => {
      expect(issuesFor(text('t', 8, 8, 194, 281))).toEqual([]);
      expect(issuesFor(text('t', 218, 8, 194, 281))).toEqual([]);
      expect(issuesFor(text('t', 10, 20, 40, 10))).toEqual([]);
    });

    it('reports a box across the gutter', () => {
      expect(issuesFor(text('t', 195, 100, 30, 10))).toMatchObject(flagged('t'));
      expect(issuesFor(text('t', 100, 100, 220, 10))).toMatchObject(flagged('t'));
    });

    it('judges a rotated box by the space it takes', () => {
      // 100 x 10 turned 90 degrees about its centre (60, 20): 10 wide, 100 tall, top at -30
      expect(issuesFor({ ...text('t', 10, 15, 100, 10), rotation: 90 })).toMatchObject(
        flagged('t'),
      );
      // the same turned about (60, 100): inside
      expect(issuesFor({ ...text('t', 10, 95, 100, 10), rotation: 90 })).toEqual([]);
    });

    it('does not look at what is not text', () => {
      expect(issuesFor(photo('p', 0, 0, 20, 20, 'A'), shape('s', 0, 0, 20, 20))).toEqual([]);
    });

    it('reports text on a page the spread does not have', () => {
      const { book, files } = cleanBook();
      const first = book.spreads[0]!;
      place(first, text('t', 20, 20, 40, 10)); // left half of the first spread: no page there
      place(first, text('u', 230, 20, 40, 10));
      expect(preflight(book, files)).toEqual([
        { kind: 'textOutsideSafe', spreadId: first.id, elementId: 't' },
      ]);
    });

    it('accepts text inside the spine zone of a cover, in height and width', () => {
      const { book, files } = cleanBook();
      book.spineWidth = 10;
      // 100 x 6 turned 90 degrees about its centre (215, 148.5): x 212..218, y 98.5..198.5
      place(book.cover, { ...text('spine', 165, 145.5, 100, 6), rotation: 90 });
      place(book.cover, text('front', 230, 20, 100, 10), text('back', 20, 20, 100, 10));
      expect(preflight(book, files)).toEqual([]);
    });

    it('reports spine text that is too long or too wide for the spine', () => {
      const { book, files } = cleanBook();
      book.spineWidth = 10;
      place(book.cover, { ...text('long', 65, 145.5, 300, 6), rotation: 90 });
      place(book.cover, { ...text('wide', 165, 141.5, 100, 14), rotation: 90 });
      expect(preflight(book, files)).toEqual([
        { kind: 'textOutsideSafe', spreadId: book.cover.id, elementId: 'long' },
        { kind: 'textOutsideSafe', spreadId: book.cover.id, elementId: 'wide' },
      ]);
    });

    it('uses the safe margin of the book', () => {
      const { book, files } = cleanBook();
      book.safeMargin = 3;
      place(book.spreads[1]!, text('t', 5, 20, 40, 10));
      expect(preflight(book, files)).toEqual([]);
    });
  });

  describe('missingAsset', () => {
    it('reports an asset whose file is absent, once however often it is used', () => {
      const { book, files } = cleanBook();
      files.clear();
      place(book.spreads[1]!, photo('p', 10, 10, 50, 50, 'A'), photo('q', 70, 10, 50, 50, 'A'));
      place(book.spreads[2]!, photo('r', 10, 10, 50, 50, 'A'));
      expect(preflight(book, files)).toEqual([{ kind: 'missingAsset', assetId: 'A' }]);
    });

    it('checks the files of photos, stickers and image and pattern backgrounds', () => {
      const { book, files } = cleanBook();
      for (const id of ['P', 'S', 'B', 'T']) book.assets[id] = asset(id, `originals/${id}.png`);
      const s = book.spreads[1]!;
      place(s, photo('p', 10, 10, 50, 50, 'P'));
      place(s, { ...newElement('sticker', { x: 10, y: 80, w: 20, h: 20 }), id: 's', assetId: 'S' });
      s.background = {
        left: { kind: 'image', assetId: 'B', fit: 'cover', opacity: 1, blur: 0, tint: null },
        right: { kind: 'pattern', assetId: 'T', fg: '#000', bg: '#fff', scale: 1 },
        spread: { kind: 'color', color: '#fff' },
      };
      // backgrounds first, then elements, in the order they are met
      expect(preflight(book, files)).toEqual([
        { kind: 'missingAsset', assetId: 'B' },
        { kind: 'missingAsset', assetId: 'T' },
        { kind: 'missingAsset', assetId: 'P' },
        { kind: 'missingAsset', assetId: 'S' },
      ]);
      for (const id of ['P', 'S', 'B', 'T']) files.add(`originals/${id}.png`);
      expect(preflight(book, files)).toEqual([]);
    });

    it('reports a reference to an asset the book does not list', () => {
      const { book, files } = cleanBook();
      place(book.spreads[1]!, photo('p', 10, 10, 50, 50, 'ghost'));
      expect(preflight(book, files)).toEqual([{ kind: 'missingAsset', assetId: 'ghost' }]);
    });

    it('does not check assets nothing uses', () => {
      const { book, files } = cleanBook();
      book.assets['unused'] = asset('unused', 'originals/unused.jpg');
      expect(preflight(book, files)).toEqual([]);
    });

    it('ignores a sticker that has no asset yet', () => {
      const { book, files } = cleanBook();
      place(book.spreads[1]!, newElement('sticker', { x: 10, y: 10, w: 20, h: 20 }));
      expect(preflight(book, files)).toEqual([]);
    });
  });

  describe('pageRule', () => {
    function bookOf(innerSpreads: number, rule: Book['pageRule']): Book {
      const book = newBook({ title: 't', innerSpreads });
      book.pageRule = rule;
      return book;
    }

    it('reports a book under the minimum or off the multiple', () => {
      const rule = { min: 24, multiple: 4 } as const;
      expect(preflight(bookOf(10, rule), new Set())).toEqual([
        { kind: 'pageRule', pages: 22, rule },
      ]);
      expect(preflight(bookOf(11, rule), new Set())).toEqual([]); // 24 pages
      expect(preflight(bookOf(12, rule), new Set())).toEqual([
        { kind: 'pageRule', pages: 26, rule },
      ]);
      expect(preflight(bookOf(13, rule), new Set())).toEqual([]); // 28 pages
    });

    it('reports a book of the right multiple that is too short', () => {
      const rule = { min: 24, multiple: 2 } as const;
      expect(preflight(bookOf(9, rule), new Set())).toEqual([
        { kind: 'pageRule', pages: 20, rule },
      ]);
      expect(preflight(bookOf(10, { min: 22, multiple: 1 }), new Set())).toEqual([]);
    });
  });

  it('lists the issues in document order, then missing assets, then the page rule', () => {
    const book = freshBook(2); // 6 pages, rule 24 / 2
    book.assets['M'] = asset('M', 'originals/m.jpg', { w: 20, h: 20 });
    place(book.cover, photo('c', 10, 10, 50, 50, null));
    const s = inner(book);
    place(
      s,
      text('t', 5, 20, 40, 10),
      photo('low', 10, 100, 50, 50, 'M'),
      photo('e', 70, 10, 5, 5),
    );
    const issues = preflight(book, new Set());
    expect(issues.map((i) => i.kind)).toEqual([
      'emptySlot', // cover
      'textOutsideSafe',
      'lowResolution',
      'emptySlot',
      'missingAsset',
      'pageRule',
    ]);
  });

  it('ignores hidden elements: they are not drawn', () => {
    const { book, files } = cleanBook();
    files.clear();
    const els = [
      photo('empty', 10, 10, 50, 50, null),
      photo('missing', 10, 70, 50, 50, 'A'),
      text('out', 5, 20, 40, 10),
    ];
    for (const el of els) el.hidden = true;
    place(book.spreads[1]!, ...els);
    expect(preflight(book, files)).toEqual([]);
  });

  it('does not change the book', () => {
    const { book, files } = cleanBook();
    place(book.spreads[1]!, photo('p', 10, 10, 50, 50, null));
    const before = clone(book);
    preflight(book, files);
    expect(book).toEqual(before);
  });
});
