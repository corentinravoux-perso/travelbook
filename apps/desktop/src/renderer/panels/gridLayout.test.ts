import type { AssetRef } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import {
  GAP,
  HEADER_HEIGHT,
  MIN_CELL,
  cellSize,
  columnsFor,
  layoutRows,
  visibleRows,
} from './gridLayout';

const photo = (id: string): AssetRef => ({
  id,
  kind: 'photo',
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
});
const group = (key: string, count: number) => ({
  key,
  photos: Array.from({ length: count }, (_, i) => photo(`${key}${i}`)),
});

describe('columnsFor', () => {
  it('fits as many thumbnails of at least the minimum size as the width allows', () => {
    expect(columnsFor(248)).toBe(3);
    expect(columnsFor(416)).toBe(5);
    expect(columnsFor(3 * MIN_CELL + 2 * GAP)).toBe(3);
    expect(columnsFor(3 * MIN_CELL + 2 * GAP - 1)).toBe(2);
  });
  it('never goes under two columns', () => {
    expect(columnsFor(10)).toBe(2);
  });
});

describe('cellSize', () => {
  it('shares the width between the columns and the gaps', () => {
    expect(cellSize(248, 3)).toBeCloseTo((248 - 2 * GAP) / 3);
  });
});

describe('layoutRows', () => {
  it('puts a header, then the photos of the group three to a row', () => {
    const { rows, height } = layoutRows([group('a', 7), group('b', 1)], 3, 80, true);
    expect(rows.map((r) => [r.kind, r.key, r.kind === 'photos' ? r.ids : null])).toEqual([
      ['header', 'a', null],
      ['photos', 'a', [0, 1, 2]],
      ['photos', 'a', [3, 4, 5]],
      ['photos', 'a', [6]],
      ['header', 'b', null],
      ['photos', 'b', [0]],
    ]);
    expect(rows[1]).toMatchObject({ top: HEADER_HEIGHT, height: 80 + GAP });
    expect(height).toBe(2 * HEADER_HEIGHT + 4 * (80 + GAP));
  });
  it('leaves the headers out on request', () => {
    const { rows } = layoutRows([group('a', 4)], 2, 80, false);
    expect(rows.every((r) => r.kind === 'photos')).toBe(true);
    expect(rows).toHaveLength(2);
  });
  it('has no rows and no height for no photos', () => {
    expect(layoutRows([], 3, 80, true)).toEqual({ rows: [], height: 0 });
  });
});

describe('visibleRows', () => {
  const { rows } = layoutRows([group('a', 300)], 3, 80, true); // 1 header + 100 rows
  it('mounts only the rows in view and the overscan around them', () => {
    const shown = visibleRows(rows, 1000, 400, 100);
    expect(shown.length).toBeLessThan(15);
    expect(shown.length).toBeGreaterThan(4);
    const first = shown[0]!;
    const last = shown.at(-1)!;
    expect(first.top + first.height).toBeGreaterThan(900);
    expect(first.top).toBeLessThanOrEqual(900 + 83);
    expect(last.top).toBeLessThan(1500);
    expect(rows[rows.indexOf(last) + 1]!.top).toBeGreaterThanOrEqual(1500);
  });
  it('starts at the first row at the top and ends with the last at the bottom', () => {
    expect(visibleRows(rows, 0, 200, 0)[0]).toBe(rows[0]);
    const bottom = visibleRows(rows, 100_000, 200, 0);
    expect(bottom).toEqual([]);
    const end = visibleRows(rows, rows.at(-1)!.top, 200, 0);
    expect(end.at(-1)).toBe(rows.at(-1));
  });
});
