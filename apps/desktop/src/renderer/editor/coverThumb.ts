import type { AssetRef, Background, Book } from '@travelbook/core';
import { create } from 'zustand';
import type { EditorStore } from '../store/editor';

/**
 * A capture gives up after this long, images and frames included: the thumbnail is a cache, and a
 * caller (the home button, the close handler) must not wait on it for more than a moment.
 */
export const CAPTURE_BUDGET_MS = 1000;

const backgroundsOf = (book: Book): Background[] =>
  Object.values(book.cover.background).filter((b): b is Background => b !== undefined);

/** The assets the cover draws: photos and stickers on it, and its background images and patterns. */
function coverAssets(book: Book): AssetRef[] {
  const ids = new Set<string>();
  for (const el of book.cover.elements) {
    if ((el.type === 'photo' || el.type === 'sticker') && el.assetId !== null) ids.add(el.assetId);
  }
  for (const b of backgroundsOf(book)) {
    if (b.kind === 'image' || b.kind === 'pattern') ids.add(b.assetId);
  }
  return [...ids].flatMap((id) => book.assets[id] ?? []);
}

/**
 * What the cover thumbnail shows: when one of these changes, the thumbnail is out of date. The
 * cover spread holds its elements and backgrounds; of the book's assets only the ones the cover
 * draws count, so importing photos for the inner pages never marks the thumbnail out of date.
 */
function shows(book: Book): readonly unknown[] {
  return [book.id, book.cover, book.format, book.spineWidth, book.coverBleed, ...coverAssets(book)];
}

const same = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export interface CoverThumbDeps {
  store: EditorStore;
  /** Draw the cover of `book` and have main write the thumbnail from it. */
  capture(book: Book): Promise<void>;
  /** Does the open project have a thumbnail already? */
  hasThumb(): Promise<boolean>;
}

export interface CoverThumbs {
  /** Rebuild the thumbnail now if the cover changed since the last one; never rejects. */
  flush(): Promise<void>;
  /** The editor is on screen: build the thumbnail if the open book has none; never rejects. */
  buildIfMissing(): Promise<void>;
  stop(): void;
}

/**
 * Keeps the project's cover thumbnail up to date for the home screen. Main can only capture what
 * the window shows, so a capture puts the cover on screen for a moment (see `CoverStage`): it is
 * done only where that is expected, never while the user edits:
 *  - `flush`, when the album is closed to the home screen or the window closes, if the cover
 *    changed since the last thumbnail;
 *  - `buildIfMissing`, when the editor shows an album that has no thumbnail (new, or its cache
 *    was deleted).
 * A failure is logged and the thumbnail stays as it was: it is a cache.
 *
 * TODO(task 7.2): draw the cover in the off-screen capture window that the export shares, then
 * this can run during editing too and the stage over the window goes away.
 */
export function createCoverThumbs({ store, capture, hasThumb }: CoverThumbDeps): CoverThumbs {
  let last: readonly unknown[] | null = null;
  let dirty = false;
  let running: Promise<void> = Promise.resolve();
  let building: Promise<void> | null = null;

  /** Captures run one after the other; each draws the book as it is when its turn comes. */
  const run = (): Promise<void> => {
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

  const stop = store.subscribe(({ book, history }) => {
    if (book === null) {
      last = null;
      dirty = false;
      return;
    }
    const next = shows(book);
    if (last !== null && same(last, next)) return;
    // A book loaded from disk has no history; an edit, an undo or a redo always leaves some. The
    // same album opened again from the home screen is a load, not a change of its cover.
    const loaded = last === null || last[0] !== book.id || (!history.canUndo && !history.canRedo);
    last = next;
    dirty = !loaded;
  });

  return {
    flush() {
      if (!dirty) return running;
      dirty = false;
      return run();
    },
    buildIfMissing() {
      building ??= (async () => {
        const id = store.getState().book?.id;
        if (id === undefined) return;
        try {
          if (await hasThumb()) return;
        } catch {
          return;
        }
        if (store.getState().book?.id !== id) return; // another album opened meanwhile
        dirty = false; // this capture shows the latest cover
        await run();
      })().finally(() => {
        building = null;
      });
      return building;
    },
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

/**
 * The app's `capture`: show the cover on the stage and have main write the thumbnail from it. It
 * settles within `CAPTURE_BUDGET_MS`; a page that is not on screen (minimized, hidden) paints no
 * frames and captures nothing, so it is skipped.
 */
export function captureCoverThumb(book: Book): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!stage.mounted || document.visibilityState !== 'visible') return resolve();
    let shooting = false;
    const request: StageRequest = {
      book,
      shoot: (rect) => {
        shooting = true;
        return window.tb.project.captureCover(rect);
      },
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
    const timer = setTimeout(() => {
      // Out of time (slow images, frames that do not come): free the caller, and take the cover
      // off the screen unless main is capturing it right now (it would capture what is beneath).
      if (!shooting && useStage.getState().request === request)
        useStage.setState({ request: null });
      resolve();
    }, CAPTURE_BUDGET_MS);
    useStage.setState({ request });
  });
}
