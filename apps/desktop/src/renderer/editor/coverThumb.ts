import type { Book } from '@travelbook/core';
import { create } from 'zustand';
import type { EditorStore } from '../store/editor';

/** The thumbnail is rebuilt this long after the last edit of the cover. */
export const COVER_THUMB_DELAY_MS = 3000;

/** What the cover thumbnail shows: when one of these changes, the thumbnail is out of date. */
function shows(book: Book): readonly unknown[] {
  return [book.id, book.cover, book.format, book.spineWidth, book.coverBleed, book.assets];
}

const same = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export interface CoverThumbDeps {
  store: EditorStore;
  /** Draw the cover of `book` and have main write the thumbnail from it. */
  capture(book: Book): Promise<void>;
  /** Does the open project have a thumbnail already? */
  hasThumb(): Promise<boolean>;
  delayMs?: number;
}

export interface CoverThumbs {
  /** Rebuild the thumbnail now if the cover changed since the last one; never rejects. */
  flush(): Promise<void>;
  stop(): void;
}

/**
 * Keeps the project's cover thumbnail up to date for the home screen: 3 s after the cover last
 * changed, and on `flush` (before the window closes or the home screen shows). A book that has no
 * thumbnail yet (new, or its cache was deleted) gets one shortly after it opens. A failure is
 * logged and the thumbnail simply stays as it was: it is a cache.
 */
export function createCoverThumbs({
  store,
  capture,
  hasThumb,
  delayMs = COVER_THUMB_DELAY_MS,
}: CoverThumbDeps): CoverThumbs {
  let last: readonly unknown[] | null = null;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const run = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return running;
    dirty = false;
    running = running.then(async () => {
      const book = store.getState().book;
      if (book === null) return;
      try {
        await capture(book);
      } catch (error) {
        console.warn('Could not write the cover thumbnail:', error);
      }
    });
    return running;
  };

  const mark = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), delayMs);
  };

  const stop = store.subscribe(({ book, history }) => {
    if (book === null) {
      last = null;
      dirty = false;
      clearTimeout(timer);
      return;
    }
    const next = shows(book);
    if (last !== null && same(last, next)) return;
    // A book loaded from disk has no history; an edit, an undo or a redo always leaves some. The
    // same album opened again from the home screen is a load, not a change of its cover.
    const loaded = !history.canUndo && !history.canRedo;
    const opened = last === null || last[0] !== book.id || loaded;
    last = next;
    if (!opened) return mark();
    // A book just opened: forget the previous one's pending rebuild, and check it has a thumbnail.
    dirty = false;
    clearTimeout(timer);
    void hasThumb().then(
      (has) => {
        if (!has && last?.[0] === book.id) mark();
      },
      () => undefined,
    );
  });

  return {
    flush: run,
    stop,
  };
}

/** A region of the window, in CSS px. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The cover to draw for a capture. `CoverStage` shows it over the window for the moment main
 * needs it: it calls `shoot` with where the cover is, then `resolve` (or `reject`).
 */
export interface StageRequest {
  book: Book;
  shoot(rect: StageRect): Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

export const useStage = create<{ request: StageRequest | null }>(() => ({ request: null }));

/** Set by `CoverStage` while it is mounted (the editor is on screen); without it nothing is drawn. */
export const stage = { mounted: false };

/** The app's `capture`: show the cover on the stage and have main write the thumbnail from it. */
export function captureCoverThumb(book: Book): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!stage.mounted) return resolve();
    useStage.setState({
      request: { book, shoot: (rect) => window.tb.project.captureCover(rect), resolve, reject },
    });
  });
}
