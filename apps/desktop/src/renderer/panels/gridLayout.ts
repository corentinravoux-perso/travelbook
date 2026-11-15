import type { PhotoGroup } from './trayModel';

// Geometry of the virtualised thumbnail grid, in px. Pure, so the windowing is tested without a DOM.

/** Space between thumbnails. */
export const GAP = 3;
/** Smallest thumbnail: the grid takes as many columns as fit at this size. */
export const MIN_CELL = 76;
/** Height of a group header. */
export const HEADER_HEIGHT = 30;

/** Columns that fit in `width` (at least 2). */
export function columnsFor(width: number): number {
  return Math.max(2, Math.floor((width + GAP) / (MIN_CELL + GAP)));
}

/** Side of a square thumbnail when `columns` share `width`. */
export function cellSize(width: number, columns: number): number {
  return Math.max(1, (width - GAP * (columns - 1)) / columns);
}

export type Row =
  | { kind: 'header'; key: string; top: number; height: number }
  | { kind: 'photos'; key: string; ids: number[]; top: number; height: number };

export interface GridLayout {
  rows: Row[];
  /** Total height of the scrolled content. */
  height: number;
}

/**
 * Stack the groups into rows: a header (when `headers`), then the group's photos `columns` to a
 * row. `ids` of a photo row are indexes into the group's `photos`, so a row stays small whatever
 * the size of the book.
 */
export function layoutRows(
  groups: readonly PhotoGroup[],
  columns: number,
  cell: number,
  headers: boolean,
): GridLayout {
  const rows: Row[] = [];
  let top = 0;
  for (const group of groups) {
    if (headers) {
      rows.push({ kind: 'header', key: group.key, top, height: HEADER_HEIGHT });
      top += HEADER_HEIGHT;
    }
    for (let start = 0; start < group.photos.length; start += columns) {
      const ids = Array.from(
        { length: Math.min(columns, group.photos.length - start) },
        (_, i) => start + i,
      );
      const height = cell + GAP;
      rows.push({ kind: 'photos', key: group.key, ids, top, height });
      top += height;
    }
  }
  return { rows, height: top };
}

/**
 * The rows to mount for a viewport: those that meet `[scrollTop - overscan, scrollTop + viewport +
 * overscan]`. Rows are in order and stacked, so a binary search finds the first.
 */
export function visibleRows(
  rows: readonly Row[],
  scrollTop: number,
  viewport: number,
  overscan: number,
): Row[] {
  const from = scrollTop - overscan;
  const to = scrollTop + viewport + overscan;
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const row = rows[mid] as Row;
    if (row.top + row.height <= from) low = mid + 1;
    else high = mid;
  }
  const out: Row[] = [];
  for (let i = low; i < rows.length && (rows[i] as Row).top < to; i++) out.push(rows[i] as Row);
  return out;
}
