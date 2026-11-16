import { boundingBox, pageBox, spreadSize } from './geometry';
import type { Book, Mm, Rect, Side, Spread } from './schema';

/** Extent of a line along the other axis, in mm. */
export type LineSpan = readonly [from: Mm, to: Mm];

/**
 * Positions, in spread coordinates, that a moving rect snaps to: `x` are vertical lines and `y`
 * horizontal ones, both ascending and without duplicates. `xSpans[i]` is the vertical extent of
 * what `x[i]` comes from (a page, an element), `ySpans[i]` the horizontal extent of `y[i]`. They
 * only size the guides, so lines written by hand may leave them out.
 */
export interface SnapLines {
  x: number[];
  y: number[];
  xSpans?: LineSpan[];
  ySpans?: LineSpan[];
}

/** A line to draw while snapping. `axis: 'x'` is a vertical line at x = `at`, running `from` to `to` in y. */
export interface Guide {
  axis: 'x' | 'y';
  at: Mm;
  from: Mm;
  to: Mm;
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Two positions this close (1 nm) count as the same line. */
const EPS = 1e-6;

type LineMap = Map<number, [from: Mm, to: Mm]>;

function addLine(lines: LineMap, at: number, from: Mm, to: Mm): void {
  const span = lines.get(at);
  if (span) {
    span[0] = Math.min(span[0], from);
    span[1] = Math.max(span[1], to);
  } else {
    lines.set(at, [from, to]);
  }
}

/** Edges and centre of a rect, on both axes. */
function addRect(xs: LineMap, ys: LineMap, r: Rect): void {
  for (const at of [r.x, r.x + r.w / 2, r.x + r.w]) addLine(xs, at, r.y, r.y + r.h);
  for (const at of [r.y, r.y + r.h / 2, r.y + r.h]) addLine(ys, at, r.x, r.x + r.w);
}

function sorted(lines: LineMap): { at: number[]; spans: LineSpan[] } {
  const entries = [...lines].sort(([a], [b]) => a - b);
  return { at: entries.map(([at]) => at), spans: entries.map(([, span]) => span) };
}

const SIDES: Side[] = ['left', 'right'];

/**
 * Lines to snap to on a spread: the edges and centre of each page it has, the safe margins, the
 * spine of a cover (edges and centre), the ruler guides of the spread, and the edges and
 * centres of the visible elements not listed in `excludeIds`. A rotated element counts by its
 * box.
 */
export function snapLinesFor(book: Book, spread: Spread, excludeIds: string[]): SnapLines {
  const xs: LineMap = new Map();
  const ys: LineMap = new Map();
  const margin = book.safeMargin;
  for (const side of SIDES) {
    const page = pageBox(book, spread, side);
    if (!page) continue;
    addRect(xs, ys, page);
    for (const at of [page.x + margin, page.x + page.w - margin]) {
      addLine(xs, at, page.y, page.y + page.h);
    }
    for (const at of [page.y + margin, page.y + page.h - margin]) {
      addLine(ys, at, page.x, page.x + page.w);
    }
  }
  // On an inner spread the gutter is the edge of both pages, already listed.
  if (spread.kind === 'cover') {
    const { width: W, height: H } = book.format;
    addRect(xs, ys, { x: W, y: 0, w: book.spineWidth, h: H });
  }
  // Ruler guides run across the whole spread.
  const { w: spreadW, h: spreadH } = spreadSize(book, spread);
  for (const at of spread.guides?.x ?? []) addLine(xs, at, 0, spreadH);
  for (const at of spread.guides?.y ?? []) addLine(ys, at, 0, spreadW);
  const excluded = new Set(excludeIds);
  for (const el of spread.elements) {
    if (excluded.has(el.id) || el.hidden) continue;
    addRect(xs, ys, el.rotation % 180 === 0 ? el : boundingBox(el));
  }
  const x = sorted(xs);
  const y = sorted(ys);
  return { x: x.at, y: y.at, xSpans: x.spans, ySpans: y.spans };
}

/**
 * Smallest shift that puts one of `anchors` on one of `lines`, if one is within `threshold`.
 * Among equally close candidates the first anchor, then the lowest line, wins.
 */
function shiftTo(anchors: readonly number[], lines: readonly number[], threshold: Mm): number {
  let best: number | null = null;
  for (const anchor of anchors) {
    for (const line of lines) {
      const d = line - anchor;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

/** One guide for each line that has one of `anchors` on it; `cross` is the extent of the moved rect. */
function guidesFor(
  axis: 'x' | 'y',
  anchors: readonly number[],
  cross: LineSpan,
  lines: SnapLines,
): Guide[] {
  const positions = axis === 'x' ? lines.x : lines.y;
  const spans = axis === 'x' ? lines.xSpans : lines.ySpans;
  const guides: Guide[] = [];
  positions.forEach((at, i) => {
    if (!anchors.some((a) => Math.abs(a - at) < EPS)) return;
    const span = spans?.[i] ?? cross;
    guides.push({
      axis,
      at,
      from: Math.min(cross[0], span[0]),
      to: Math.max(cross[1], span[1]),
    });
  });
  return guides;
}

/**
 * Snap a rect that is being moved: its left edge, centre or right edge goes onto a vertical
 * line, its top, centre or bottom onto a horizontal one, whichever is closest within
 * `threshold`. Returns the shift to add to the rect and the guides to draw for the snapped rect.
 * Pass the box of a rotated element, not its frame.
 */
export function snapMove(
  moving: Rect,
  lines: SnapLines,
  threshold: Mm,
): { dx: Mm; dy: Mm; guides: Guide[] } {
  const xAnchors = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const yAnchors = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const dx = shiftTo(xAnchors, lines.x, threshold);
  const dy = shiftTo(yAnchors, lines.y, threshold);
  const guides = [
    ...guidesFor(
      'x',
      xAnchors.map((a) => a + dx),
      [moving.y + dy, moving.y + dy + moving.h],
      lines,
    ),
    ...guidesFor(
      'y',
      yAnchors.map((a) => a + dy),
      [moving.x + dx, moving.x + dx + moving.w],
      lines,
    ),
  ];
  return { dx, dy, guides };
}

/**
 * The line nearest to `edge`, within `threshold`, that leaves the rect with a positive size:
 * `dir` is +1 when the edge is the far one (right, bottom) and -1 when it is the near one.
 */
function lineForEdge(
  edge: number,
  fixed: number,
  dir: 1 | -1,
  lines: readonly number[],
  threshold: Mm,
): number | null {
  let best: number | null = null;
  for (const line of lines) {
    if (dir * (line - fixed) <= 0 || Math.abs(line - edge) > threshold) continue;
    if (best === null || Math.abs(line - edge) < Math.abs(best - edge)) best = line;
  }
  return best;
}

/**
 * Snap a rect that is being resized from `handle`. Only the edges that handle drags move: each
 * goes onto the nearest line within `threshold`, unless that would leave the rect with no area
 * or turn it inside out. The opposite edges stay put.
 *
 * With `keepRatio` the rect keeps the width-to-height ratio of `moving` (a rect with no area
 * has none, so it is ignored there). On a corner, the closer of the two snaps is applied and
 * the other side follows from the ratio; on an edge, the other side follows about its centre.
 * Guides are drawn for the dragged edges that end up on a line.
 */
export function snapResize(
  moving: Rect,
  handle: ResizeHandle,
  lines: SnapLines,
  threshold: Mm,
  keepRatio: boolean,
): { rect: Rect; guides: Guide[] } {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const right = moving.x + moving.w;
  const bottom = moving.y + moving.h;

  let lineX: number | null = null;
  if (east) lineX = lineForEdge(right, moving.x, 1, lines.x, threshold);
  else if (west) lineX = lineForEdge(moving.x, right, -1, lines.x, threshold);
  let lineY: number | null = null;
  if (south) lineY = lineForEdge(bottom, moving.y, 1, lines.y, threshold);
  else if (north) lineY = lineForEdge(moving.y, bottom, -1, lines.y, threshold);

  const ratio = keepRatio && moving.w > 0 && moving.h > 0 ? moving.w / moving.h : null;
  const corner = (east || west) && (north || south);
  if (ratio !== null && corner && lineX !== null && lineY !== null) {
    const distX = Math.abs(lineX - (east ? right : moving.x));
    const distY = Math.abs(lineY - (south ? bottom : moving.y));
    if (distX <= distY) lineY = null;
    else lineX = null;
  }

  let { x, y, w, h } = moving;
  if (lineX !== null) {
    if (east) w = lineX - x;
    else {
      w = right - lineX;
      x = lineX;
    }
  }
  if (lineY !== null) {
    if (south) h = lineY - y;
    else {
      h = bottom - lineY;
      y = lineY;
    }
  }
  if (ratio !== null && lineX !== null) {
    h = w / ratio;
    y = corner ? (north ? bottom - h : y) : moving.y + moving.h / 2 - h / 2;
  } else if (ratio !== null && lineY !== null) {
    w = h * ratio;
    x = corner ? (west ? right - w : x) : moving.x + moving.w / 2 - w / 2;
  }

  const rect = { x, y, w, h };
  const xEdges = [...(east ? [x + w] : []), ...(west ? [x] : [])];
  const yEdges = [...(south ? [y + h] : []), ...(north ? [y] : [])];
  const guides = [
    ...guidesFor('x', xEdges, [y, y + h], lines),
    ...guidesFor('y', yEdges, [x, x + w], lines),
  ];
  return { rect, guides };
}
