import type { Spread } from '@travelbook/core';
import { useCallback, useState, type DragEvent, type KeyboardEvent } from 'react';
import { moveSpreadTo } from './spreadActions';
import { dropIndex } from './pages';

/** Drag data type: only a drag that started on one of our tiles is a reorder. */
const DRAG_TYPE = 'application/x-travelbook-spread';

export interface DropMark {
  id: string;
  after: boolean;
}

export interface ReorderTile {
  /** Spread on the tile; only inner spreads can be dragged. */
  draggable: boolean;
  onDragStart(e: DragEvent<HTMLElement>): void;
  onDragOver(e: DragEvent<HTMLElement>): void;
  onDragLeave(e: DragEvent<HTMLElement>): void;
  onDrop(e: DragEvent<HTMLElement>): void;
  onDragEnd(): void;
  /** Alt+Left or Alt+Right moves an inner spread by one place: the keyboard's way to reorder. */
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
}

/**
 * The drag logic of the strip and of the overview: inner spreads are dragged, every tile is a
 * drop target (the first and last spreads accept a drop next to them, inside), and `moveSpread`
 * does the move. `mark` says where the drop would go, for the tile to show it.
 */
export function useSpreadReorder(spreads: readonly Spread[]): {
  mark: DropMark | null;
  dragging: string | null;
  tile(spread: Spread): ReorderTile;
} {
  const [dragging, setDragging] = useState<string | null>(null);
  const [mark, setMark] = useState<DropMark | null>(null);

  const end = useCallback(() => {
    setDragging(null);
    setMark(null);
  }, []);

  const tile = (spread: Spread): ReorderTile => {
    const index = spreads.indexOf(spread);
    const inner = spread.kind === 'inner';
    return {
      draggable: inner,
      onDragStart: (e) => {
        if (!inner) return;
        e.dataTransfer.setData(DRAG_TYPE, spread.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(spread.id);
      },
      onDragOver: (e) => {
        // The cover is not part of the order: nothing can be dropped on it.
        if (dragging === null || spread.kind === 'cover' || spread.id === dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const box = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > box.left + box.width / 2;
        setMark((m) => (m?.id === spread.id && m.after === after ? m : { id: spread.id, after }));
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMark(null);
      },
      onDrop: (e) => {
        if (dragging === null || spread.kind === 'cover') return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > box.left + box.width / 2;
        const from = spreads.findIndex((s) => s.id === dragging);
        if (from > 0) moveSpreadTo(dragging, dropIndex(from, index, after, spreads.length));
        end();
      },
      onDragEnd: end,
      onKeyDown: (e) => {
        if (!inner || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        const to = Math.min(
          Math.max(index + (e.key === 'ArrowLeft' ? -1 : 1), 1),
          spreads.length - 2,
        );
        if (to !== index) moveSpreadTo(spread.id, to);
      },
    };
  };

  return { mark, dragging, tile };
}
