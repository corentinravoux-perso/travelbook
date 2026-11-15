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
  /** True while `openWith` switches albums; changes are refused meanwhile. */
  opening: boolean;

  /**
   * The only way to show another book. `tb.project.save` writes to the project main has open, so
   * the order matters: (1) save the current book now, waiting for any save still running;
   * (2) call `open`, which switches main's project (`tb.project.open` or `create`); (3) show the
   * book it returns, with a fresh history. If step 1 fails, it rejects and nothing switches.
   * `open` resolving to `null` (the user cancelled) keeps the current book. While this runs,
   * `apply`, `undo` and `redo` do nothing, so no change of the old book is saved into the new
   * project. Resolves to what `open` gave.
   */
  openWith<T extends { book: Book }>(open: () => Promise<T | null>): Promise<T | null>;
  /**
   * Save a change still waiting for the debounce now, and wait until every save has reached
   * main. Rejects if that save fails. Call it before anything that ends the editing session.
   */
  flush(): Promise<void>;
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
  /**
   * The last save started; the next one waits for it, so writes reach the disk in order. It never
   * rejects: a failure is reported through `saveStatus` (and to `flush`).
   */
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

    /** Start writing the current book after the saves already started; settles with it. */
    const startSave = (mine: number): Promise<void> => {
      const { book } = get();
      if (!book) return Promise.resolve();
      set({ saveStatus: 'saving' });
      const done = lastSave.then(() => deps.save(book));
      lastSave = done.then(
        () => {
          if (mine === ticket) set({ saveStatus: 'saved' });
        },
        () => {
          if (mine === ticket) set({ saveStatus: 'error' });
        },
      );
      return done;
    };

    const scheduleSave = () => {
      cancelSave();
      const mine = ++ticket;
      set({ saveStatus: 'pending' });
      timer = setTimeout(() => {
        timer = undefined;
        void startSave(mine).catch(() => {}); // reported through `saveStatus`
      }, SAVE_DELAY_MS);
    };

    const flush = async (): Promise<void> => {
      if (timer !== undefined) {
        cancelSave();
        await startSave(ticket);
      }
      await lastSave;
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

    /** Show another document: no history, nothing waiting to be saved. */
    const load = (book: Book) => {
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
      opening: false,

      async openWith(open) {
        await flush();
        set({ opening: true });
        try {
          const opened = await open();
          if (opened) load(opened.book);
          return opened;
        } finally {
          set({ opening: false });
        }
      },
      flush,
      apply(op, label, mergeKey) {
        if (get().opening) return;
        commit(history.apply(openBook(), op, label, mergeKey));
      },
      undo() {
        if (get().opening) return;
        commit(history.undo(openBook()));
      },
      redo() {
        if (get().opening) return;
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
