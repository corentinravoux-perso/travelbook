import { spreadSize, type Book, type Spread } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor';
import { MissingNotice } from './MissingNotice';
import { fr } from '../strings/fr';

const MM_TO_PX = 96 / 25.4;
/** Free room kept around the page, in px. */
const MARGIN = 32;

function spreadName(book: Book, spread: Spread): string {
  if (spread.kind === 'cover') return fr.shell.coverName;
  return fr.shell.spreadName(book.spreads.indexOf(spread) + 1);
}

/**
 * The current spread, scaled down to fit the workspace. Read-only for now: Task 5.2 replaces this
 * with the editing canvas (selection, zoom, guides).
 */
export function Canvas() {
  const book = useEditor((s) => s.book);
  const currentId = useEditor((s) => s.currentSpreadId);
  const hostRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setRoom({ w: host.clientWidth, h: host.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const spread =
    book === null
      ? undefined
      : currentId === book.cover.id
        ? book.cover
        : book.spreads.find((s) => s.id === currentId);

  if (book === null || spread === undefined) {
    return (
      <main className="shell-canvas" aria-label={fr.shell.canvas}>
        <p className="shell-canvas__empty">{fr.shell.noAlbum}</p>
      </main>
    );
  }

  const size = spreadSize(book, spread);
  const pxW = size.w * MM_TO_PX;
  const pxH = size.h * MM_TO_PX;
  const scale = Math.max(
    0.05,
    Math.min((room.w - 2 * MARGIN) / pxW, (room.h - 2 * MARGIN) / pxH, 1),
  );

  return (
    <main className="shell-canvas" aria-label={fr.shell.canvas} ref={hostRef}>
      <MissingNotice />
      <div
        className="canvas-page"
        role="img"
        aria-label={spreadName(book, spread)}
        data-spread-id={spread.id}
        style={{ width: pxW * scale, height: pxH * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <SpreadView
            book={book}
            spread={spread}
            quality="preview"
            assetUrl={(id, q) => `tb://asset/${id}?v=${q === 'export' ? 'original' : q}`}
            showEmptySlots
          />
        </div>
      </div>
    </main>
  );
}
