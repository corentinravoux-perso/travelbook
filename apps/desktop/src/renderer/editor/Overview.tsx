import { useEffect, useRef } from 'react';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { SpreadTile } from './SpreadStrip';
import { addSpreadAfter } from './spreadActions';
import { useSpreadReorder } from './useSpreadReorder';

/** Thumbnail height in the overview, in screen px. */
const THUMB_H = 150;

/**
 * Every spread at once, the cover first, over the whole window (opened from the top bar, closed
 * with Escape). It reorders with the strip's drag logic, inserts a spread at the `+` between two
 * thumbnails, and opens the spread that is clicked. The editor behind it is inert.
 */
export function Overview() {
  const book = useEditor((s) => s.book);
  const currentId = useEditor((s) => s.currentSpreadId);
  const reorder = useSpreadReorder(book?.spreads ?? []);
  const rootRef = useRef<HTMLDivElement>(null);
  const { setOverview, goToSpread } = editorStore.getState();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.focus({ preventScroll: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      editorStore.getState().setOverview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  if (book === null) return null;
  const open = (id: string) => {
    goToSpread(id);
    setOverview(false);
  };

  return (
    <div
      ref={rootRef}
      className="overview"
      role="dialog"
      aria-modal="true"
      aria-label={fr.overview.title}
    >
      <header className="overview__bar">
        <h2 className="overview__title">{fr.overview.title}</h2>
        <span className="overview__hint" title={fr.overview.hint}>
          {fr.overview.hint}
        </span>
        <span className="shell-top__grow" />
        <button
          type="button"
          className="icon-button"
          aria-label={fr.overview.close}
          title={fr.overview.close}
          onClick={() => setOverview(false)}
        >
          <Icon name="x" />
        </button>
      </header>
      <ul className="overview__grid">
        {[book.cover, ...book.spreads].map((spread, i) => {
          // `i` counts the cover: the spread after which a new one goes is the one before.
          const after = i >= 2 ? book.spreads[i - 2] : undefined;
          return (
            <li key={spread.id} className="overview__item">
              {after && (
                <button
                  type="button"
                  className="overview__insert"
                  aria-label={fr.overview.insert}
                  title={fr.overview.insert}
                  onClick={() => addSpreadAfter(after.id)}
                >
                  <Icon name="plus" />
                </button>
              )}
              <SpreadTile
                book={book}
                spread={spread}
                height={THUMB_H}
                current={spread.id === currentId}
                reorder={reorder.tile(spread)}
                drop={
                  reorder.mark?.id === spread.id
                    ? reorder.mark.after
                      ? 'after'
                      : 'before'
                    : undefined
                }
                dragging={reorder.dragging === spread.id}
                onOpen={() => open(spread.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
