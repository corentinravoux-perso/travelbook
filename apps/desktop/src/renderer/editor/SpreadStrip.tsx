import { pageCount, type Book, type Spread } from '@travelbook/core';
import { useEffect, useMemo, useRef } from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import { pageNumbers, pageRuleShortfall, spreadName } from './pages';
import { SpreadThumb } from './SpreadThumb';
import {
  addSpreadAfter,
  deleteSpreadById,
  duplicateSpreadById,
  swapPagesOf,
} from './spreadActions';
import { useSpreadReorder, type ReorderTile } from './useSpreadReorder';

/** Thumbnail height in the strip, in screen px: the strip is 96 px tall. */
const THUMB_H = 52;
const NO_SPREADS: readonly Spread[] = [];

export interface TileProps {
  book: Book;
  spread: Spread;
  height: number;
  current: boolean;
  reorder: ReorderTile;
  drop: 'before' | 'after' | undefined;
  dragging: boolean;
  onOpen(): void;
}

/** One spread as a button: thumbnail, page numbers, drag handle logic. Shared with the overview. */
export function SpreadTile({
  book,
  spread,
  height,
  current,
  reorder,
  drop,
  dragging,
  onOpen,
}: TileProps) {
  const { left, right } = pageNumbers(book, spread);
  const name = spreadName(book, spread);
  const caption = spread.kind === 'cover' ? name : fr.strip.pages(left, right);
  const ref = useRef<HTMLButtonElement>(null);

  // The tile of the spread being edited stays in view in the strip.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <button
      ref={ref}
      type="button"
      className="tile"
      aria-current={current ? 'true' : undefined}
      aria-label={fr.strip.tile(name, fr.strip.pagesLong(left, right))}
      data-spread-id={spread.id}
      data-kind={spread.kind}
      data-drop={drop}
      data-dragging={dragging || undefined}
      onClick={onOpen}
      {...reorder}
    >
      <SpreadThumb book={book} spread={spread} height={height} />
      <span className="tile__caption">{caption}</span>
    </button>
  );
}

const TOOLS: {
  id: 'add' | 'duplicate' | 'remove' | 'swap';
  icon: IconName;
  label: string;
}[] = [
  { id: 'add', icon: 'plus', label: fr.strip.add },
  { id: 'duplicate', icon: 'copy', label: fr.strip.duplicate },
  { id: 'remove', icon: 'trash', label: fr.strip.remove },
  { id: 'swap', icon: 'arrows-exchange', label: fr.strip.swap },
];

/**
 * The cover, then every spread as a thumbnail with its page numbers (spec §8). Click opens a
 * spread; inner spreads drag to reorder; the buttons act on the spread being edited. Beside them,
 * the page count, with a warning (never a block) when it breaks the page rule.
 */
export function SpreadStrip() {
  const book = useEditor((s) => s.book);
  const currentId = useEditor((s) => s.currentSpreadId);
  const { goToSpread } = editorStore.getState();
  const reorder = useSpreadReorder(book?.spreads ?? NO_SPREADS);
  const shortfall = useMemo(() => (book ? pageRuleShortfall(book) : null), [book]);

  if (book === null) {
    return (
      <nav className="shell-strip" aria-label={fr.shell.spreads}>
        <p className="shell-empty">{fr.shell.spreadsEmpty}</p>
      </nav>
    );
  }

  const current = findSpread(book, currentId);
  const inner = current?.kind === 'inner';
  const enabled = { add: true, duplicate: inner, remove: inner, swap: inner };
  const run = (id: (typeof TOOLS)[number]['id']) => {
    if (!current) return;
    if (id === 'add') addSpreadAfter(current.id);
    else if (id === 'duplicate') duplicateSpreadById(current.id);
    else if (id === 'remove') deleteSpreadById(current.id);
    else swapPagesOf(current.id);
  };

  const tile = (spread: Spread) => (
    <SpreadTile
      key={spread.id}
      book={book}
      spread={spread}
      height={THUMB_H}
      current={spread.id === currentId}
      reorder={reorder.tile(spread)}
      drop={reorder.mark?.id === spread.id ? (reorder.mark.after ? 'after' : 'before') : undefined}
      dragging={reorder.dragging === spread.id}
      onOpen={() => goToSpread(spread.id)}
    />
  );

  return (
    <nav className="shell-strip" aria-label={fr.shell.spreads}>
      {tile(book.cover)}
      <span className="shell-sep" />
      <div className="strip__list">{book.spreads.map(tile)}</div>
      <span className="shell-sep" />
      <div className="strip__tools">
        <div className="strip__count" data-warning={shortfall ? '' : undefined}>
          {shortfall && <Icon name="alert-triangle" />}
          <span
            role={shortfall ? 'alert' : undefined}
            title={
              shortfall
                ? fr.strip.ruleBroken(shortfall.pages, shortfall.min, shortfall.multiple)
                : undefined
            }
          >
            {shortfall
              ? fr.strip.ruleBroken(shortfall.pages, shortfall.min, shortfall.multiple)
              : fr.strip.pageCount(pageCount(book))}
          </span>
        </div>
        <div className="strip__buttons" role="group" aria-label={fr.strip.actions}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="icon-button"
              aria-label={t.label}
              title={t.label}
              disabled={!enabled[t.id]}
              onClick={() => run(t.id)}
            >
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
