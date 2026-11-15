import {
  pageBox,
  spreadSize,
  type Book,
  type Guide,
  type Spread,
  spineBox,
} from '@travelbook/core';
import type { Guides as GuideToggles } from '../store/editor';

interface Props {
  book: Book;
  spread: Spread;
  /** Which overlays are on. */
  show: GuideToggles;
  /** Px per mm. */
  scale: number;
  /** Lines the move or resize in progress snaps to, spread coordinates. */
  snap: Guide[];
}

/**
 * The page overlays (bleed dashed, safe margin dotted, gutter solid, all 1 px; the trim box
 * fainter) and the snap lines of a drag. Drawn in white with difference blending, so they read on
 * any photo without a hue (visual-direction.md, Canvas).
 */
export function Guides({ book, spread, show, scale, snap }: Props) {
  const s = scale;
  const size = spreadSize(book, spread);
  const bleed = spread.kind === 'cover' ? book.coverBleed : book.bleed;
  const { height: H, width: W } = book.format;
  const pages = (['left', 'right'] as const).flatMap((side) => {
    const page = pageBox(book, spread, side);
    return page ? [{ side, page }] : [];
  });
  // The gutter: the spine zone of a cover, else the line where the two pages meet.
  const spine = spread.kind === 'cover' ? spineBox(book) : null;
  const gutterXs = spine ? [spine.x, spine.x + spine.w] : [W];
  const top = -bleed;
  const bottom = H + bleed;

  return (
    <svg
      className="guides"
      aria-hidden="true"
      width={size.w * s}
      height={size.h * s}
      overflow="visible"
    >
      {show.bleed &&
        pages.map(({ side, page }) => (
          <rect
            key={`bleed-${side}`}
            className="guide guide--bleed"
            x={(side === 'left' ? page.x - bleed : page.x) * s}
            y={(page.y - bleed) * s}
            width={(page.w + bleed) * s}
            height={(page.h + 2 * bleed) * s}
          />
        ))}
      {show.trim &&
        pages.map(({ side, page }) => (
          <rect
            key={`trim-${side}`}
            className="guide guide--trim"
            x={page.x * s}
            y={page.y * s}
            width={page.w * s}
            height={page.h * s}
          />
        ))}
      {show.safe &&
        pages.map(({ side, page }) => (
          <rect
            key={`safe-${side}`}
            className="guide guide--safe"
            x={(page.x + book.safeMargin) * s}
            y={(page.y + book.safeMargin) * s}
            width={(page.w - 2 * book.safeMargin) * s}
            height={(page.h - 2 * book.safeMargin) * s}
          />
        ))}
      {show.gutter &&
        gutterXs.map((x) => (
          <line
            key={`gutter-${x}`}
            className="guide guide--gutter"
            x1={x * s}
            x2={x * s}
            y1={top * s}
            y2={bottom * s}
          />
        ))}
      {snap.map((g, i) =>
        g.axis === 'x' ? (
          <line
            key={i}
            className="guide guide--snap"
            x1={g.at * s}
            x2={g.at * s}
            y1={g.from * s}
            y2={g.to * s}
          />
        ) : (
          <line
            key={i}
            className="guide guide--snap"
            y1={g.at * s}
            y2={g.at * s}
            x1={g.from * s}
            x2={g.to * s}
          />
        ),
      )}
    </svg>
  );
}
