import { createHistory, type Book, type History } from '@travelbook/core';
import { createStore, useStore, type StoreApi } from 'zustand';

/** Every document change is saved this long after the last one. */
export const SAVE_DELAY_MS = 1000;

/** The panels the rail switches between, in rail order. */
export const PANELS = ['photos', 'templates', 'stickers', 'backgrounds', 'text', 'shapes'] as const;
export type PanelId = (typeof PANELS)[number];

/** What a drag on the canvas does. Task 5.2 adds tools as it needs them. */
export type Tool = 'select' | 'pan';

/** The overlays drawn over the spread, each switchable (spec §8). */
export interface Guides {
  bleed: boolean;
  trim: boolean;
  safe: boolean;
  gutter: boolean;
}

/** `pending`: a change waits for the debounce; `error`: the last save failed. */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/** A document change: a `core` op bound to its arguments. */
export type BookOp = (book: Book) => Book;

export interface EditorState {
  /** The open book; `null` while no album is open. Changed only through `apply`, undo, redo. */
  book: Book | null;
  /** What the undo history can do, refreshed after every change. */
  history: History;
  currentSpreadId: string | null;
  /** Ids of the selected elements of the current spread. */
  selection: string[];
  /** 1 shows the page at 96 px per inch. */
  zoom: number;
  tool: Tool;
  panel: PanelId;
  guides: Guides;
  saveStatus: SaveStatus;

  /** Show another book: forgets the history and any save still waiting for the old one. */
  load(book: Book): void;
  /**
   * Run `op` on the book as one undo step named `label` (applies in a row with the same
   * `mergeKey` form one step), then save the book `SAVE_DELAY_MS` after the last change.
   */
  apply(op: BookOp, label: string, mergeKey?: string): void;
  undo(): void;
  redo(): void;
  setPanel(panel: PanelId): void;
}

export interface EditorStoreDeps {
  /** Writes the book to disk; `window.tb.project.save` in the app. */
  save(book: Book): Promise<void>;
}

export type EditorStore = StoreApi<EditorState>;

const NO_HISTORY: History = { canUndo: false, canRedo: false, labels: [] };

export function createEditorStore(deps: EditorStoreDeps): EditorStore {
  const history = createHistory();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Bumped by every change and by `load`: a save reports its outcome only if nothing happened
   * since it was scheduled (a newer change has its own save; a loaded book is another document).
   */
  let ticket = 0;
  /** The last save started; the next one waits for it, so writes reach the disk in order. */
  let lastSave: Promise<void> = Promise.resolve();

  const snapshot = (): History => ({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    labels: history.labels,
  });

  return createStore<EditorState>()((set, get) => {
    const cancelSave = () => {
      clearTimeout(timer);
      timer = undefined;
    };

    const scheduleSave = () => {
      cancelSave();
      const mine = ++ticket;
      set({ saveStatus: 'pending' });
      timer = setTimeout(() => {
        timer = undefined;
        const { book } = get();
        if (!book) return;
        set({ saveStatus: 'saving' });
        lastSave = lastSave
          .then(() => deps.save(book))
          .then(
            () => {
              if (mine === ticket) set({ saveStatus: 'saved' });
            },
            () => {
              if (mine === ticket) set({ saveStatus: 'error' });
            },
          );
      }, SAVE_DELAY_MS);
    };

    /** Show `next` if it differs from the current book, and save it. */
    const commit = (next: Book) => {
      if (next === get().book) return;
      set({ book: next, history: snapshot() });
      scheduleSave();
    };

    const openBook = (): Book => {
      const { book } = get();
      if (!book) throw new Error('No book is open.');
      return book;
    };

    return {
      book: null,
      history: NO_HISTORY,
      currentSpreadId: null,
      selection: [],
      zoom: 1,
      tool: 'select',
      panel: 'photos',
      guides: { bleed: true, trim: true, safe: true, gutter: true },
      saveStatus: 'saved',

      load(book) {
        cancelSave();
        ticket++;
        history.clear();
        set({
          book,
          history: snapshot(),
          currentSpreadId: book.spreads[0]?.id ?? null,
          selection: [],
          saveStatus: 'saved',
        });
      },
      apply(op, label, mergeKey) {
        commit(history.apply(openBook(), op, label, mergeKey));
      },
      undo() {
        commit(history.undo(openBook()));
      },
      redo() {
        commit(history.redo(openBook()));
      },
      setPanel(panel) {
        set({ panel });
      },
    };
  });
}

/** The app's editor store, saving through the main process. */
export const editorStore = createEditorStore({
  save: (book) => window.tb.project.save(book),
});

/** Read a slice of the editor state in a component; it re-renders when the slice changes. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
