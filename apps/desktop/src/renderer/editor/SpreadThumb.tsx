import { MM_TO_PX, pageBox, spineBox, spreadSize, type Book, type Spread } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { assetUrl } from './assetUrl';

/**
 * True once `ref` has come within `margin` px of the viewport, and for good after that: a long
 * book mounts the thumbnails near the scroll position only, and keeps what it has drawn.
 * Without `IntersectionObserver` (a test DOM) everything counts as seen.
 */
export function useSeen(ref: RefObject<Element | null>, margin = 240): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: `${margin}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

interface Props {
  book: Book;
  spread: Spread;
  /** Height of the thumbnail, in screen px. */
  height: number;
}

/** The size of a spread's thumbnail at `height`, in screen px. */
export function thumbSize(book: Book, spread: Spread, height: number): { w: number; h: number } {
  const { w, h } = spreadSize(book, spread);
  return { w: Math.round((w / h) * height), h: height };
}

/**
 * A spread drawn small, by the single renderer at `thumb` quality. What is not a page (the empty
 * half of the first and last spreads) is shaded, and so is the spine of a cover. The thumbnail
 * is decoration: the tile around it carries the name.
 */
function SpreadThumbView({ book, spread, height }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref);
  const size = spreadSize(book, spread);
  const { w } = thumbSize(book, spread, height);
  const scale = height / (size.h * MM_TO_PX);
  const k = w / size.w; // px per mm
  const voids = (['left', 'right'] as const).filter((side) => pageBox(book, spread, side) === null);
  const spine = spread.kind === 'cover' && book.spineWidth > 0 ? spineBox(book) : null;

  return (
    <span
      ref={ref}
      className="thumb"
      aria-hidden="true"
      style={{ width: w, height }}
      data-spread-id={spread.id}
    >
      {seen && (
        <span className="thumb__paper" style={{ transform: `scale(${scale})` }}>
          <SpreadView book={book} spread={spread} quality="thumb" assetUrl={assetUrl} />
        </span>
      )}
      {voids.map((side) => (
        <span
          key={side}
          className="thumb__void"
          style={{ left: side === 'left' ? 0 : w / 2, width: w / 2 }}
        />
      ))}
      {spine && <span className="thumb__spine" style={{ left: spine.x * k, width: spine.w * k }} />}
    </span>
  );
}

/** Redrawn only when what the thumbnail shows changed: not on every edit of another spread. */
export const SpreadThumb = memo(
  SpreadThumbView,
  (a, b) =>
    a.spread === b.spread &&
    a.height === b.height &&
    a.book.assets === b.book.assets &&
    a.book.format === b.book.format &&
    a.book.bleed === b.book.bleed &&
    a.book.coverBleed === b.book.coverBleed &&
    a.book.spineWidth === b.book.spineWidth,
);
