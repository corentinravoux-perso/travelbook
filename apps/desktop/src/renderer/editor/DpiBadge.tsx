import type { Book, PhotoElement, Spread } from '@travelbook/core';
import { fr } from '../strings/fr';
import { photoResolution, type Resolution } from './dpi';
import { frame } from './Selection';

/** A frame narrower than this on screen (px) carries the dot alone. */
const COMPACT_BELOW_PX = 96;

/**
 * The resolution badge of a placed photo (spec §8): a dot in the level's colour and the
 * effective resolution at print size. It reads on any photo, so it keeps the same colours in
 * both themes; the colour is never the only signal, since the number is written and the level is
 * in the accessible name.
 */
export function DpiBadge({ resolution, compact }: { resolution: Resolution; compact: boolean }) {
  const { dpi, level } = resolution;
  return (
    <span
      className="dpi-badge"
      role="img"
      aria-label={fr.dpi.badge(level, dpi)}
      data-level={level}
      data-dpi={dpi}
      data-compact={compact || undefined}
    >
      <i className="dpi-badge__dot" />
      {!compact && `${dpi} ${fr.dpi.unit}`}
    </span>
  );
}

/**
 * The badges of every placed photo of a spread, in screen px over the page so that they keep
 * their size at any zoom. Each sits at the bottom left of its frame and turns with it.
 */
export function DpiBadges({ book, spread, scale }: { book: Book; spread: Spread; scale: number }) {
  const photos = spread.elements.filter(
    (el): el is PhotoElement => el.type === 'photo' && !el.hidden,
  );
  return (
    <div className="dpi-layer">
      {photos.map((el) => {
        const resolution = photoResolution(book, el);
        if (!resolution) return null;
        return (
          <div
            key={el.id}
            className="dpi-frame"
            style={{ ...frame(el, scale), transform: `rotate(${el.rotation}deg)` }}
          >
            <DpiBadge resolution={resolution} compact={el.w * scale < COMPACT_BELOW_PX} />
          </div>
        );
      })}
    </div>
  );
}
