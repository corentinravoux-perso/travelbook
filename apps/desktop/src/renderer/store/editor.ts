import {
  createHistory,
  type Book,
  type History,
  type ShapeElement,
  type Side,
  type Spread,
} from '@travelbook/core';
import { createStore, useStore, type StoreApi } from 'zustand';

/** Every document change is saved this long after the last one. */
export const SAVE_DELAY_MS = 1000;

/** The panels the rail switches between, in rail order. */
export const PANELS = ['photos', 'templates', 'stickers', 'backgrounds', 'text', 'shapes'] as const;
export type PanelId = (typeof PANELS)[number];

/** What a drag on the canvas does: select, pan, draw a text box, or draw a shape (`shapeKind`). */
export type Tool = 'select' | 'pan' | 'text' | 'shape';

/** The kinds of shape the shape tool draws. */
export type ShapeKind = ShapeElement['shape'];

/** The overlays drawn over the spread, each switchable (spec §8). */
export interface Guides {
  bleed: boolean;
  trim: boolean;
  safe: boolean;
  gutter: boolean;
  /** The rulers round the canvas and the ruler guides on the page. Kept across sessions. */
  rulers: boolean;
}

/** Thickness of the rulers: a bigger ruler has bigger numbers. */
export type RulerSize = 'small' | 'medium' | 'large';
export const RULER_SIZES: Record<RulerSize, number> = { small: 20, medium: 24, large: 32 };
export const RULER_SIZE_KEY = 'travelbook.rulerSize';

function storedRulerSize(): RulerSize {
  try {
    const v = globalThis.localStorage?.getItem(RULER_SIZE_KEY);
    return v === 'small' || v === 'large' ? v : 'medium';
  } catch {
    return 'medium';
  }
}

/** Where the choice of showing the rulers is kept (renderer `localStorage`). */
export const RULERS_KEY = 'travelbook.rulers';

function rulersShown(): boolean {
  try {
    return globalThis.localStorage?.getItem(RULERS_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** `pending`: a change waits for the debounce; `error`: the last save failed. */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/** Zoom bounds; 1 is 96 px per inch. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The cover or an inner spread of `book`, by id. */
export function findSpread(book: Book | null, id: string | null): Spread | undefined {
  if (book === null || id === null) return undefined;
  return book.cover.id === id ? book.cover : book.spreads.find((s) => s.id === id);
}

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
  /** While true the canvas keeps the whole spread in view: it sets `zoom` itself. */
  fit: boolean;
  tool: Tool;
  /** What the shape tool draws. */
  shapeKind: ShapeKind;
  panel: PanelId;
  /**
   * The page of an inner spread that page templates go on: the one the user last pointed at.
   * The cover, the first spread and the last have one page each and ignore it.
   */
  activePage: Side;
  guides: Guides;
  rulerSize: RulerSize;
  /** True while the full-screen overview of the spreads is open. */
  overview: boolean;
  /** True while the full-window preview of the album (spec §8) is open. */
  preview: boolean;
  /** A short message to show over the canvas (a paste that failed, say); `null` for none. */
  notice: string | null;
  /** The photo frame being cropped (pan and zoom of its image), or `null`. Always in the current spread. */
  cropId: string | null;
  /** The photo frame whose photo the picker is choosing, or `null`. Always in the current spread. */
  pickerId: string | null;
  /** The text element being typed in (Tiptap is mounted over it), or `null`. Always in the current spread. */
  editingId: string | null;
  /** True when the editing session of `editingId` starts with all its text selected (a new preset). */
  editSelectAll: boolean;
  saveStatus: SaveStatus;
  /** True while `openWith` saves the old book and switches albums; changes are refused. */
  opening: boolean;

  /**
   * The only way to show another book. `tb.project.save` writes to the project main has open, so
   * the order matters: (1) save the current book now, waiting for any save still running;
   * (2) call `open`, which switches main's project (`tb.project.open` or `create`); (3) show the
   * book it returns, with a fresh history. If step 1 fails, it rejects and nothing switches.
   * `open` resolving to `null` (the user cancelled) keeps the current book. While this runs,
   * `apply`, `undo` and `redo` do nothing, so no change of the old book is saved into the new
   * project. Resolves to what `open` gave. A second call while one runs rejects.
   */
  openWith<T extends { book: Book }>(open: () => Promise<T | null>): Promise<T | null>;
  /**
   * Resolve once the book on screen is saved: start a change still waiting for the debounce now,
   * wait for the saves already running, and save again if the latest save failed. Rejects if a
   * save it waits for fails and the retry fails too. Call it before anything that ends the
   * editing session.
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
  /** Point at a page of the spread in view (see `activePage`). */
  setActivePage(page: Side): void;
  /** Choose what a drag on the canvas does; `shape` is the kind drawn when `tool` is `shape`. */
  setTool(tool: Tool, shape?: ShapeKind): void;
  /** Type in the text element `id`: it alone is selected, crop and picker close. */
  enterTextEdit(id: string, selectAll?: boolean): void;
  exitTextEdit(): void;
  /** Edit the spread `id` (the cover or an inner spread); the selection is emptied. */
  goToSpread(id: string): void;
  /** Open or close the overview of the spreads. */
  setOverview(open: boolean): void;
  /** Open or close the full-window preview of the album. */
  setPreview(open: boolean): void;
  /** Replace the selection (ids of the current spread). */
  select(ids: string[]): void;
  /** Zoom to `zoom` (clamped) and stop fitting. */
  setZoom(zoom: number): void;
  /** Multiply the zoom by `factor`. */
  zoomBy(factor: number): void;
  /** Keep the whole spread in view, whatever the window size. */
  fitSpread(): void;
  /** Show `message` over the canvas until `notify(null)`. */
  notify(message: string | null): void;
  /** Crop the photo frame `id`: it alone is selected, and the picker closes. */
  enterCrop(id: string): void;
  exitCrop(): void;
  /** Open the picker over the photo tray to fill or replace the photo of frame `id`. */
  openPicker(id: string): void;
  closePicker(): void;
  /** Show or hide one overlay of the canvas. */
  setGuide(guide: keyof Guides, on: boolean): void;
  /** Make the rulers thinner or thicker; kept across sessions. */
  setRulerSize(size: RulerSize): void;
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
   * rejects: a failure is reported through `saveStatus`, which `flush` reads to save again.
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

    /**
     * Loop until the book on screen is on disk: start a waiting save now, wait for the saves
     * already running, and save again if the latest one failed. A failing save rejects. A change
     * made meanwhile is caught by the next turn.
     */
    const flush = async (): Promise<void> => {
      for (;;) {
        if (timer !== undefined) {
          cancelSave();
          await startSave(ticket);
        } else {
          await lastSave;
          if (timer !== undefined) continue;
          if (get().saveStatus !== 'error') return;
          await startSave(ticket);
        }
      }
    };

    /**
     * The spread to show once `next` replaces `previous`: the current one if it survived, else
     * the one that took its place (or the one before it, at the end of the book).
     */
    const surviving = (previous: Book | null, next: Book): string | null => {
      const id = get().currentSpreadId;
      if (id === null || findSpread(next, id)) return id;
      const at = previous?.spreads.findIndex((s) => s.id === id) ?? -1;
      return (next.spreads[Math.min(Math.max(at, 0), next.spreads.length - 1)] ?? next.cover).id;
    };

    /** Show `next` if it differs from the current book, and save it. */
    const commit = (next: Book) => {
      const previous = get().book;
      if (next === previous) return;
      const currentSpreadId = surviving(previous, next);
      set({
        book: next,
        history: snapshot(),
        ...(currentSpreadId !== get().currentSpreadId
          ? { currentSpreadId, selection: [], cropId: null, pickerId: null, editingId: null }
          : {}),
      });
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
        cropId: null,
        pickerId: null,
        editingId: null,
        tool: 'select',
        fit: true,
        overview: false,
        preview: false,
        saveStatus: 'saved',
      });
    };

    return {
      book: null,
      history: NO_HISTORY,
      currentSpreadId: null,
      selection: [],
      zoom: 1,
      fit: true,
      tool: 'select',
      shapeKind: 'rect',
      panel: 'photos',
      activePage: 'left',
      guides: { bleed: true, trim: true, safe: true, gutter: true, rulers: rulersShown() },
      rulerSize: storedRulerSize(),
      overview: false,
      preview: false,
      notice: null,
      cropId: null,
      pickerId: null,
      editingId: null,
      editSelectAll: false,
      saveStatus: 'saved',
      opening: false,

      async openWith(open) {
        if (get().opening) throw new Error('Another album is already opening.');
        // From here on no change is accepted, so nothing can arm a save of the old book that
        // would fire after `open` has switched main's project.
        set({ opening: true });
        try {
          await flush();
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
      setActivePage(page) {
        if (get().activePage !== page) set({ activePage: page });
      },
      setTool(tool, shape) {
        set({ tool, ...(shape !== undefined ? { shapeKind: shape } : {}) });
      },
      enterTextEdit(id, selectAll = false) {
        set({
          editingId: id,
          editSelectAll: selectAll,
          cropId: null,
          pickerId: null,
          selection: [id],
          tool: 'select',
        });
      },
      exitTextEdit() {
        if (get().editingId !== null) set({ editingId: null, editSelectAll: false });
      },
      goToSpread(id) {
        const { book, currentSpreadId } = get();
        if (!findSpread(book, id) || id === currentSpreadId) return;
        set({
          currentSpreadId: id,
          selection: [],
          cropId: null,
          pickerId: null,
          editingId: null,
        });
      },
      setOverview(open) {
        if (get().overview !== open) set({ overview: open });
      },
      setPreview(open) {
        if (get().preview !== open) set({ preview: open });
      },
      select(ids) {
        const current = get().selection;
        if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
        set({ selection: ids });
      },
      setZoom(zoom) {
        set({ zoom: clampZoom(zoom), fit: false });
      },
      zoomBy(factor) {
        set({ zoom: clampZoom(get().zoom * factor), fit: false });
      },
      fitSpread() {
        set({ fit: true });
      },
      notify(message) {
        set({ notice: message });
      },
      enterCrop(id) {
        set({ cropId: id, pickerId: null, editingId: null, selection: [id] });
      },
      exitCrop() {
        if (get().cropId !== null) set({ cropId: null });
      },
      openPicker(id) {
        set({ pickerId: id, cropId: null, editingId: null, panel: 'photos' });
      },
      closePicker() {
        if (get().pickerId !== null) set({ pickerId: null });
      },
      setRulerSize(size) {
        set({ rulerSize: size });
        try {
          globalThis.localStorage?.setItem(RULER_SIZE_KEY, size);
        } catch {
          // No storage: the size lasts for the session.
        }
      },
      setGuide(guide, on) {
        set({ guides: { ...get().guides, [guide]: on } });
        if (guide === 'rulers') {
          try {
            globalThis.localStorage?.setItem(RULERS_KEY, on ? 'on' : 'off');
          } catch {
            // No storage (a test, a locked profile): the choice lasts for the session.
          }
        }
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
