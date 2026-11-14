import { describe, expect, it } from 'vitest';
import { newBook } from './factory';
import { freshBook, inner, shape, useCounterIds } from './ops/test-helpers';
import type { Rect } from './schema';
import { snapLinesFor, snapMove, snapResize, type SnapLines } from './snap';

useCounterIds();

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

describe('snapLinesFor', () => {
  it('lists page edges and centres, safe margins and the spine of an A4 inner spread', () => {
    const book = freshBook();
    const lines = snapLinesFor(book, inner(book), []);
    expect(lines.x).toEqual([0, 8, 105, 202, 210, 218, 315, 412, 420]);
    expect(lines.y).toEqual([0, 8, 148.5, 289, 297]);
  });

  it('only lists the pages a spread has', () => {
    const book = freshBook();
    expect(snapLinesFor(book, book.spreads[0]!, []).x).toEqual([210, 218, 315, 412, 420]);
    expect(snapLinesFor(book, book.spreads.at(-1)!, []).x).toEqual([0, 8, 105, 202, 210]);
  });

  it('adds the edges and centre of the spine on a cover', () => {
    const book = { ...newBook({ title: 's', innerSpreads: 1 }), spineWidth: 10 };
    expect(snapLinesFor(book, book.cover, []).x).toEqual([
      0, 8, 105, 202, 210, 215, 220, 228, 325, 422, 430,
    ]);
  });

  it('adds the edges and centres of the other elements', () => {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(shape('a', 50, 100, 30, 40), shape('b', 300, 10, 20, 20));
    const lines = snapLinesFor(book, s, []);
    expect(lines.x).toEqual(expect.arrayContaining([50, 65, 80, 300, 310, 320]));
    expect(lines.y).toEqual(expect.arrayContaining([100, 120, 140, 10, 20, 30]));
  });

  it('leaves out the excluded and the hidden elements', () => {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(shape('a', 50, 100, 30, 40), shape('b', 300, 10, 20, 20));
    s.elements[1]!.hidden = true;
    expect(snapLinesFor(book, s, ['a']).x).toEqual([0, 8, 105, 202, 210, 218, 315, 412, 420]);
  });

  it('uses the box of a rotated element', () => {
    const book = freshBook();
    const s = inner(book);
    // 40 x 10 rotated 90 degrees about its centre (60, 100): a box 10 wide and 40 tall.
    s.elements.push({ ...shape('a', 40, 95, 40, 10), rotation: 90 });
    const { x, y } = snapLinesFor(book, s, []);
    expect(x.filter((v) => Math.abs(v - 55) < 1e-9 || Math.abs(v - 65) < 1e-9)).toHaveLength(2);
    expect(y.filter((v) => Math.abs(v - 80) < 1e-9 || Math.abs(v - 120) < 1e-9)).toHaveLength(2);
  });

  it('records, per line, the extent of what it comes from', () => {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(shape('a', 50, 100, 30, 40));
    const lines = snapLinesFor(book, s, []);
    // A page line runs the height of its page; an element line, the height of the element.
    expect(lines.xSpans?.[lines.x.indexOf(8)]).toEqual([0, 297]);
    expect(lines.xSpans?.[lines.x.indexOf(50)]).toEqual([100, 140]);
    expect(lines.ySpans?.[lines.y.indexOf(120)]).toEqual([50, 80]);
    // Two sources on one line: the extent covers both.
    s.elements.push(shape('b', 50, 200, 10, 10));
    const both = snapLinesFor(book, s, []);
    expect(both.xSpans?.[both.x.indexOf(50)]).toEqual([100, 210]);
    expect(lines.xSpans).toHaveLength(lines.x.length);
    expect(lines.ySpans).toHaveLength(lines.y.length);
  });
});

describe('snapMove', () => {
  const plain: SnapLines = { x: [10], y: [50] };

  it('snaps an edge that is within the threshold, and not one beyond it', () => {
    const moving = rect(11.2, 0, 4, 4);
    const near = snapMove(moving, plain, 2);
    expect(near.dx).toBeCloseTo(-1.2, 9);
    expect(near.dy).toBe(0);
    expect(snapMove(moving, plain, 1)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snaps the right edge and the centre as well', () => {
    expect(snapMove(rect(5, 0, 4.5, 4), plain, 2).dx).toBeCloseTo(0.5, 9); // right 9.5 -> 10
    expect(snapMove(rect(7.5, 0, 5, 4), plain, 2).dx).toBeCloseTo(0, 9); // centre 10
    expect(snapMove(rect(8.4, 0, 3, 4), plain, 2).dx).toBeCloseTo(0.1, 9); // centre 9.9 -> 10
  });

  it('keeps the closest of several candidates', () => {
    const lines: SnapLines = { x: [10, 11], y: [] };
    // left edge at 10.6: 0.4 from 11 beats 0.6 from 10
    expect(snapMove(rect(10.6, 0, 20, 4), lines, 2).dx).toBeCloseTo(0.4, 9);
  });

  it('snaps both axes independently', () => {
    const out = snapMove(rect(11, 48.5, 4, 4), plain, 2);
    expect(out.dx).toBeCloseTo(-1, 9);
    expect(out.dy).toBeCloseTo(-0.5, 9); // centre 50.5 -> 50
  });

  it('draws a guide that spans the moving rect and the rect the line comes from', () => {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(shape('a', 50, 100, 30, 40));
    const lines = snapLinesFor(book, s, []);
    const out = snapMove(rect(51.2, 20, 10, 10), lines, 2);
    expect(out.dx).toBeCloseTo(-1.2, 9);
    expect(out.dy).toBe(0);
    expect(out.guides).toEqual([{ axis: 'x', at: 50, from: 20, to: 140 }]);
  });

  it('snaps centre to centre', () => {
    const book = freshBook();
    const s = inner(book);
    s.elements.push(shape('a', 50, 100, 30, 40)); // centre x 65
    const lines = snapLinesFor(book, s, []);
    const out = snapMove(rect(59.3, 20, 10, 10), lines, 2); // centre 64.3
    expect(out.dx).toBeCloseTo(0.7, 9);
    expect(out.guides).toEqual([{ axis: 'x', at: 65, from: 20, to: 140 }]);
  });

  it('measures the guide on the snapped rect, so a y snap moves its extent', () => {
    const lines: SnapLines = { x: [10], y: [50], xSpans: [[100, 120]], ySpans: [[0, 4]] };
    const out = snapMove(rect(11, 51, 4, 4), lines, 2);
    expect(out.dy).toBeCloseTo(-1, 9); // top edge 51 -> 50
    expect(out.guides).toEqual([
      { axis: 'x', at: 10, from: 50, to: 120 },
      { axis: 'y', at: 50, from: 0, to: 10 + 4 },
    ]);
  });

  it('draws a guide for every line that ends up under an edge or the centre', () => {
    const lines: SnapLines = { x: [10, 20], y: [] };
    const out = snapMove(rect(10.5, 0, 9, 4), lines, 1); // left -> 10, right 19.5 -> 20 (0.5 each)
    expect(out.dx).toBeCloseTo(-0.5, 9);
    expect(out.guides.map((g) => g.at)).toEqual([10]);
    const both = snapMove(rect(10, 0, 10, 4), lines, 1); // both already on a line
    expect(both).toMatchObject({ dx: 0, dy: 0 });
    expect(both.guides.map((g) => g.at)).toEqual([10, 20]);
  });

  it('spans only the moving rect when the lines carry no extent', () => {
    expect(snapMove(rect(10, 5, 4, 6), plain, 1).guides).toEqual([
      { axis: 'x', at: 10, from: 5, to: 11 },
    ]);
  });

  it('returns no snap on empty lines', () => {
    expect(snapMove(rect(1, 2, 3, 4), { x: [], y: [] }, 5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('snapResize', () => {
  const lines: SnapLines = {
    x: [8, 51.5],
    y: [8, 31],
    xSpans: [
      [0, 297],
      [0, 50],
    ],
    ySpans: [
      [0, 210],
      [0, 210],
    ],
  };
  const box = rect(10, 10, 40, 20); // right 50, bottom 30

  it('moves only the edge a handle drags', () => {
    const e = snapResize(box, 'e', lines, 2, false);
    expect(e.rect).toEqual(rect(10, 10, 41.5, 20));
    expect(e.guides).toEqual([{ axis: 'x', at: 51.5, from: 0, to: 50 }]);

    const w = snapResize(box, 'w', lines, 2, false);
    expect(w.rect).toEqual(rect(8, 10, 42, 20));
    expect(w.guides).toEqual([{ axis: 'x', at: 8, from: 0, to: 297 }]);

    const s = snapResize(box, 's', lines, 2, false);
    expect(s.rect).toEqual(rect(10, 10, 40, 21));
    expect(s.guides).toEqual([{ axis: 'y', at: 31, from: 0, to: 210 }]);

    const n = snapResize(box, 'n', lines, 2, false);
    expect(n.rect).toEqual(rect(10, 8, 40, 22));
    expect(n.guides).toEqual([{ axis: 'y', at: 8, from: 0, to: 210 }]);
  });

  it('does not snap an edge the handle leaves alone', () => {
    // the left edge (10) is 2 from the line at 8, but 'e' drags the right edge only
    expect(snapResize(box, 'e', { x: [8], y: [] }, 2, false)).toEqual({ rect: box, guides: [] });
  });

  it('snaps both edges of a corner handle', () => {
    const se = snapResize(box, 'se', lines, 2, false);
    expect(se.rect).toEqual(rect(10, 10, 41.5, 21));
    expect(se.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
    const nw = snapResize(box, 'nw', lines, 2, false);
    expect(nw.rect).toEqual(rect(8, 8, 42, 22));
    const ne = snapResize(box, 'ne', lines, 2, false);
    expect(ne.rect).toEqual(rect(10, 8, 41.5, 22));
    const sw = snapResize(box, 'sw', lines, 2, false);
    expect(sw.rect).toEqual(rect(8, 10, 42, 21));
  });

  it('does not snap beyond the threshold', () => {
    expect(snapResize(box, 'se', lines, 0.9, false)).toEqual({ rect: box, guides: [] });
  });

  it('keeps the ratio on a corner by following the closer snap', () => {
    const ratio = rect(0, 0, 40, 20); // 2:1
    // x line 1 away, y line 1.8 away: x wins, the height follows
    const out = snapResize(ratio, 'se', { x: [41], y: [21.8] }, 2, true);
    expect(out.rect).toEqual(rect(0, 0, 41, 20.5));
    expect(out.guides).toEqual([{ axis: 'x', at: 41, from: 0, to: 20.5 }]);
    // y line closer: the width follows
    const byY = snapResize(ratio, 'se', { x: [41.5], y: [20.5] }, 2, true);
    expect(byY.rect).toEqual(rect(0, 0, 41, 20.5));
    // top-left corner: the bottom-right corner stays where it is
    const nw = snapResize(rect(10, 10, 40, 20), 'nw', { x: [9], y: [] }, 2, true);
    expect(nw.rect.x).toBeCloseTo(9, 9);
    expect(nw.rect.x + nw.rect.w).toBeCloseTo(50, 9);
    expect(nw.rect.y + nw.rect.h).toBeCloseTo(30, 9);
    expect(nw.rect.w / nw.rect.h).toBeCloseTo(2, 9);
  });

  it('keeps the ratio on an edge by scaling the other side about its centre', () => {
    const out = snapResize(rect(0, 0, 40, 20), 'e', { x: [41], y: [] }, 2, true);
    expect(out.rect.x).toBe(0);
    expect(out.rect.w).toBe(41);
    expect(out.rect.h).toBeCloseTo(20.5, 9);
    expect(out.rect.y + out.rect.h / 2).toBeCloseTo(10, 9);
    const vertical = snapResize(rect(0, 0, 40, 20), 's', { x: [], y: [21] }, 2, true);
    expect(vertical.rect.h).toBe(21);
    expect(vertical.rect.w).toBeCloseTo(42, 9);
    expect(vertical.rect.x + vertical.rect.w / 2).toBeCloseTo(20, 9);
  });

  it('ignores keepRatio on a rect with no area', () => {
    const flat = rect(0, 0, 40, 0);
    expect(snapResize(flat, 'e', { x: [41], y: [] }, 2, true).rect).toEqual(rect(0, 0, 41, 0));
  });

  it('never snaps an edge across, or onto, the opposite edge', () => {
    const thin = rect(10, 0, 1, 10); // right edge 11
    expect(snapResize(thin, 'e', { x: [10], y: [] }, 3, false).rect).toEqual(thin); // would be 0 wide
    expect(snapResize(thin, 'e', { x: [9], y: [] }, 3, false).rect).toEqual(thin); // would flip
    expect(snapResize(thin, 'w', { x: [11, 12], y: [] }, 3, false).rect).toEqual(thin);
  });
});

describe('snapResize with a locked ratio, on every corner', () => {
  const start = rect(10, 10, 40, 20); // 2:1, right 50, bottom 30

  for (const handle of ['se', 'sw', 'ne', 'nw'] as const) {
    for (const closer of ['x', 'y'] as const) {
      it(`${handle}: follows the ${closer} snap when it is the closer one`, () => {
        const east = handle.includes('e');
        const south = handle.includes('s');
        const dx = closer === 'x' ? 1 : 1.8;
        const dy = closer === 'x' ? 1.8 : 1;
        const lineX = east ? 50 + dx : 10 - dx;
        const lineY = south ? 30 + dy : 10 - dy;
        const { rect: out } = snapResize(start, handle, { x: [lineX], y: [lineY] }, 2, true);
        expect(out.w / out.h).toBeCloseTo(2, 9);
        // the opposite corner does not move
        expect(east ? out.x : out.x + out.w).toBeCloseTo(east ? 10 : 50, 9);
        expect(south ? out.y : out.y + out.h).toBeCloseTo(south ? 10 : 30, 9);
        // the dragged edge of the closer axis lands on its line
        const landed =
          closer === 'x' ? (east ? out.x + out.w : out.x) : south ? out.y + out.h : out.y;
        expect(landed).toBeCloseTo(closer === 'x' ? lineX : lineY, 9);
      });
    }
  }

  it('takes the nearest of several lines for an edge', () => {
    const out = snapResize(start, 'e', { x: [51, 52], y: [] }, 3, false);
    expect(out.rect.w).toBe(41);
  });
});
