import type { AssetRef } from '@travelbook/core';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GAP, cellSize, columnsFor, layoutRows, visibleRows } from './gridLayout';
import type { PhotoGroup } from './trayModel';

/** Rows kept mounted beyond the viewport, in px: a fast scroll finds them drawn. */
const OVERSCAN = 240;
/** Horizontal padding of the grid, in px (`--s5` on each side). */
const PAD = 12;

interface Props {
  groups: readonly PhotoGroup[];
  /** The header of a group; without it the groups run into one another without headers. */
  header?(group: PhotoGroup): ReactNode;
  /** One photo, filling its cell. */
  thumb(asset: AssetRef): ReactNode;
}

/**
 * The photos as square thumbnails, three or more to a row, under their group headers. Hand-made
 * windowing: only the rows near the viewport are mounted, so a book of a thousand photos costs
 * the same as one of twenty. The geometry is in `gridLayout.ts`.
 */
export function PhotoGrid({ groups, header, thumb }: Props) {
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
  const layout = useMemo(
    () => layoutRows(groups, columns, cell, header !== undefined),
    [groups, columns, cell, header],
  );
  const shown = visibleRows(layout.rows, view.scrollTop, view.height, OVERSCAN);
  const byKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  return (
    <div
      ref={scroller}
      className="photo-grid"
      onScroll={(e) => {
        // Read now: React may run the updater after the event, when currentTarget is null.
        const scrollTop = e.currentTarget.scrollTop;
        setView((v) => ({ ...v, scrollTop }));
      }}
    >
      <div className="photo-grid__content" style={{ height: layout.height }}>
        {view.width > 0 &&
          shown.map((row) => {
            const group = byKey.get(row.key) as PhotoGroup;
            if (row.kind === 'header') {
              return (
                <div
                  key={`h:${row.key}`}
                  className="photo-grid__row"
                  style={{ top: row.top, height: row.height }}
                >
                  {header?.(group)}
                </div>
              );
            }
            const first = row.ids[0] as number;
            return (
              <div
                key={`p:${row.key}:${first}`}
                className="photo-grid__row photo-grid__row--photos"
                style={{
                  top: row.top,
                  height: row.height - GAP,
                  gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
                }}
              >
                {row.ids.map((i) => {
                  const asset = group.photos[i] as AssetRef;
                  return <div key={asset.id}>{thumb(asset)}</div>;
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
}
