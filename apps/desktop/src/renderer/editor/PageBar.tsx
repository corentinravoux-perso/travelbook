import { pageBox, type Book, type Side, type Spread } from '@travelbook/core';
import { editorStore, useEditor } from '../store/editor';
import { photosOnTarget, randomCount } from '../panels/templatesModel';
import { templatesStore } from '../store/templates';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { pageNumbers } from './pages';

const t = fr.templates;

/** The page names under a spread: the front of the cover, or the numbered pages the spread has. */
function pagesOf(book: Book, spread: Spread): { side: Side; label: string }[] {
  if (spread.kind === 'cover') return [{ side: 'right', label: t.coverLabel }];
  const numbers = pageNumbers(book, spread);
  return (['left', 'right'] as const).flatMap((side) => {
    const n = numbers[side];
    return n === null ? [] : [{ side, label: t.pageLabel(n) }];
  });
}

/**
 * A strip under each page of the spread in view: its name, which on a spread of two pages also
 * points the templates at it, and "Mise en page aléatoire", which lays the page out again with
 * another template that has as many photos.
 */
export function PageBar({ book, spread, scale }: { book: Book; spread: Spread; scale: number }) {
  const active = useEditor((s) => s.activePage);
  const pages = pagesOf(book, spread);
  const pointable = spread.kind === 'inner';
  return (
    <div
      className="page-bar"
      role="group"
      aria-label={t.pageBar}
      // A press here is not on the page: it must not start a marquee or clear the selection.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {pages.map(({ side, label }) => {
        const box = pageBox(book, spread, side);
        if (box === null) return null;
        const photos = randomCount(photosOnTarget(book, spread, side));
        const pointed = pointable && active === side;
        return (
          <div
            key={side}
            className="page-bar__cell"
            style={{ left: box.x * scale, width: box.w * scale }}
          >
            {pointable ? (
              <button
                type="button"
                className="page-bar__label"
                aria-pressed={pointed}
                aria-label={t.pointAtPage(label)}
                onClick={() => editorStore.getState().setActivePage(side)}
              >
                {label}
              </button>
            ) : (
              <span className="page-bar__label page-bar__label--plain">{label}</span>
            )}
            <button
              type="button"
              className="page-bar__random"
              aria-label={t.randomFor(label)}
              title={photos === 0 ? t.randomNeedsPhotos : t.randomFor(label)}
              disabled={photos === 0}
              onClick={() => {
                if (pointable) editorStore.getState().setActivePage(side);
                templatesStore.getState().randomLayout(spread.id, side);
              }}
            >
              <Icon name="arrows-shuffle" />
              <span className="page-bar__random-text">{t.random}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
