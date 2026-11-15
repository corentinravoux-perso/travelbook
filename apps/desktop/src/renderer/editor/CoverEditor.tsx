import {
  addElement,
  newElement,
  spineBox,
  type Book,
  type Spread,
  type TextElement,
} from '@travelbook/core';
import { openPosterDialog } from '../posters/PosterDialog';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';

/** 1 pt in mm. */
const PT_MM = 25.4 / 72;

/**
 * The spine on the cover canvas: a shaded band between the back and the front, over the same
 * canvas as any spread (the cover is edited like the others). It lets clicks through; the
 * gutter lines on its edges are drawn by `Guides`. Nothing is drawn when the spine is 0 mm.
 */
export function SpineZone({ book, scale }: { book: Book; scale: number }) {
  if (book.spineWidth <= 0) return null;
  const spine = spineBox(book);
  return (
    <div
      className="spine-zone"
      aria-hidden="true"
      style={{
        left: spine.x * scale,
        top: 0,
        width: spine.w * scale,
        height: spine.h * scale,
      }}
    >
      {spine.w * scale >= 16 && <span className="spine-zone__label">{fr.cover.spineZone}</span>}
    </div>
  );
}

/**
 * A text of the book's title along the spine: an ordinary text element rotated 90° and centred
 * in the spine zone, sized to fit its width. Nothing about it is special once it is placed.
 */
export function spineTextElement(book: Book): TextElement {
  const spine = spineBox(book);
  const h = Math.max(spine.w * 0.8, 3);
  const w = spine.h * 0.6;
  const el = newElement('text', {
    x: spine.x + spine.w / 2 - w / 2,
    y: spine.y + spine.h / 2 - h / 2,
    w,
    h,
  });
  const fontSizePt = Math.min(Math.max(Math.round((h * 0.55) / PT_MM), 6), 28);
  return {
    ...el,
    rotation: 90,
    align: 'center',
    vAlign: 'middle',
    style: { ...el.style, fontSizePt },
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: book.title === '' ? [] : [{ type: 'text', text: book.title }],
        },
      ],
    },
  };
}

function addSpineText(): void {
  const { book, currentSpreadId, apply, select } = editorStore.getState();
  if (!book || currentSpreadId !== book.cover.id || book.spineWidth <= 0) return;
  const el = spineTextElement(book);
  apply((b) => addElement(b, b.cover.id, el), fr.cover.undoSpineText);
  select([el.id]);
}

/** The cover's own tools, over the canvas while the cover is shown. */
export function CoverTools({ book, spread }: { book: Book; spread: Spread }) {
  if (spread.kind !== 'cover') return null;
  const spine = book.spineWidth > 0;
  return (
    <div className="cover-tools" role="toolbar" aria-label={fr.cover.tools}>
      <button type="button" className="button button--small" onClick={openPosterDialog}>
        <Icon name="layout-grid" />
        {fr.poster.open}
      </button>
      <button
        type="button"
        className="button button--small"
        disabled={!spine}
        title={spine ? undefined : fr.cover.spineNone}
        onClick={addSpineText}
      >
        <Icon name="letter-t" />
        {fr.cover.spineText}
      </button>
      {!spine && <span className="cover-tools__hint">{fr.cover.spineNone}</span>}
    </div>
  );
}
