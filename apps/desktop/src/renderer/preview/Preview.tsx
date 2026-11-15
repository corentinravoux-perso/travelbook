import { MM_TO_PX, pageBox, spreadSize } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { clickDirection, pagesLabel, previewPages, turn } from './previewModel';
import './Preview.css';

/** Room kept round the spread, in px. */
const MARGIN = 32;

const KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (i, n) => turn(i, 1, n),
  ArrowLeft: (i, n) => turn(i, -1, n),
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * The album as it will be seen, over the whole window: the cover, then every spread, drawn by the
 * single renderer without frames for empty photo slots and without guides. The arrow keys, and a
 * click on the left or the right half of the stage, turn the pages; Escape (or the close button)
 * returns to the editor. It starts on the spread being edited, and leaves the editor where it was.
 * The editor behind it is inert.
 */
export function Preview() {
  const book = useEditor((s) => s.book);
  const [index, setIndex] = useState(() => {
    const { book: b, currentSpreadId } = editorStore.getState();
    return b === null
      ? 0
      : Math.max(
          0,
          previewPages(b).findIndex((s) => s.id === currentSpreadId),
        );
  });
  const pages = useMemo(() => (book === null ? [] : previewPages(book)), [book]);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const count = pages.length;
  const at = Math.min(index, Math.max(count - 1, 0));
  const countRef = useRef(count);
  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        editorStore.getState().setPreview(false);
        return;
      }
      const go = KEYS[e.key];
      if (go === undefined) return;
      e.preventDefault();
      setIndex((i) => go(i, countRef.current));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRoom({ w: r.width, h: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const spread = pages[at];
  if (book === null || spread === undefined) return null;
  const size = spreadSize(book, spread);
  const k =
    room === null
      ? 0
      : Math.max(
          0,
          Math.min(
            (room.w - 2 * MARGIN) / (size.w * MM_TO_PX),
            (room.h - 2 * MARGIN) / (size.h * MM_TO_PX),
          ),
        );
  const mm = MM_TO_PX * k;
  const sides = spread.kind === 'cover' ? null : (['left', 'right'] as const);

  return (
    <div
      ref={rootRef}
      className="preview"
      role="dialog"
      aria-modal="true"
      aria-label={fr.preview.title}
      tabIndex={-1}
    >
      <div
        ref={stageRef}
        className="preview__stage"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setIndex(turn(at, clickDirection(e.clientX, r.left + r.width / 2), count));
        }}
      >
        {k > 0 && (
          <div
            className="preview__spread"
            role="img"
            aria-label={fr.preview.stage}
            data-spread-id={spread.id}
            style={{ width: size.w * mm, height: size.h * mm }}
          >
            {/* Paper under each page that exists; the cover is one sheet. */}
            {sides === null ? (
              <div className="preview__paper" style={{ inset: 0 }} />
            ) : (
              sides.map((side) => {
                const box = pageBox(book, spread, side);
                return box === null ? null : (
                  <div
                    key={side}
                    className="preview__paper"
                    style={{
                      left: box.x * mm,
                      top: box.y * mm,
                      width: box.w * mm,
                      height: box.h * mm,
                    }}
                  />
                );
              })
            )}
            <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
              <SpreadView
                book={book}
                spread={spread}
                quality="preview"
                assetUrl={assetUrl}
                showEmptySlots={false}
              />
            </div>
          </div>
        )}
      </div>
      <footer className="preview__bar">
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.previous}
          title={fr.preview.previous}
          disabled={at === 0}
          onClick={() => setIndex(turn(at, -1, count))}
        >
          <Icon name="chevron-left" />
        </button>
        <output className="preview__position" aria-live="polite">
          {fr.preview.position(pagesLabel(book, spread), at + 1, count)}
        </output>
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.next}
          title={fr.preview.next}
          disabled={at === count - 1}
          onClick={() => setIndex(turn(at, 1, count))}
        >
          <Icon name="chevron-right" />
        </button>
        <span className="preview__hint">{fr.preview.hint}</span>
        <span className="shell-top__grow" />
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.close}
          title={fr.preview.close}
          onClick={() => editorStore.getState().setPreview(false)}
        >
          <Icon name="x" />
        </button>
      </footer>
    </div>
  );
}
