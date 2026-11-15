import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GAP, cellSize, columnsFor } from '../gridLayout';
import type { Tile } from './model';

/** Rows kept mounted beyond the viewport, in px. */
const OVERSCAN = 240;
/** Horizontal padding of the grid, in px (`--s5` on each side). */
const PAD = 12;

interface Props {
  tiles: readonly Tile[];
  renderTile(tile: Tile): ReactNode;
  /** Shown under the last row (a "more" button, a state line). */
  footer?: ReactNode;
}

/** The rows of `count` tiles in `columns` columns that meet the viewport (windowing, by index). */
export function visibleTileRows(
  count: number,
  columns: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  overscan = OVERSCAN,
): { first: number; last: number } {
  const rows = Math.ceil(count / columns);
  const first = Math.max(0, Math.floor((scrollTop - overscan) / rowHeight));
  const last = Math.min(rows - 1, Math.ceil((scrollTop + viewport + overscan) / rowHeight));
  return { first, last };
}

/**
 * Square tiles, as many per row as fit, windowed like the photo grid: only the rows near the
 * viewport are mounted, so a set of several thousand stickers costs no more than a small one.
 */
export function TileGrid({ tiles, renderTile, footer }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 0, height: 0, scrollTop: 0 });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setView((v) =>
        v.width === el.clientWidth && v.height === el.clientHeight
          ? v
          : { ...v, width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const inner = Math.max(0, view.width - 2 * PAD);
  const columns = columnsFor(inner);
  const cell = cellSize(inner, columns);
  const rowHeight = cell + GAP;
  const range = useMemo(
    () => visibleTileRows(tiles.length, columns, rowHeight, view.scrollTop, view.height),
    [tiles.length, columns, rowHeight, view.scrollTop, view.height],
  );
  const rows: number[] = [];
  for (let r = range.first; r <= range.last; r++) rows.push(r);

  return (
    <div
      ref={scroller}
      className="photo-grid stk-grid"
      onScroll={(e) => {
        // Read now: React may run the updater after the event, when currentTarget is null.
        const scrollTop = e.currentTarget.scrollTop;
        setView((v) => ({ ...v, scrollTop }));
      }}
    >
      <div
        className="photo-grid__content"
        style={{ height: Math.ceil(tiles.length / columns) * rowHeight }}
      >
        {view.width > 0 &&
          rows.map((r) => (
            <div
              key={r}
              className="photo-grid__row photo-grid__row--photos"
              style={{
                top: r * rowHeight,
                height: cell,
                gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
              }}
            >
              {tiles.slice(r * columns, (r + 1) * columns).map((tile) => (
                <div key={tile.key}>{renderTile(tile)}</div>
              ))}
            </div>
          ))}
      </div>
      {footer !== undefined && <div className="stk-grid__footer">{footer}</div>}
    </div>
  );
}
