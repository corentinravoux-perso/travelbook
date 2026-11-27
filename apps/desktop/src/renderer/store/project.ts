import type { Book } from '@travelbook/core';
import { createStore, useStore, type StoreApi } from 'zustand';
import type {
  CreateProjectOptions,
  OpenedProject,
  ProjectInfo,
  RecentProject,
  SnapshotInfo,
} from '../../shared/api';
import { geometryCache } from '../maps/geometryCache';
import { captureCoverThumb, createCoverThumbs } from '../editor/coverThumb';
import { editorStore, type EditorStore } from './editor';

/** An automatic snapshot is taken this often while the book has changed since the last one. */
export const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;
/** How long the note that follows Ctrl+S stays in the top bar. */
export const SNAPSHOT_NOTE_MS = 2500;

export type View = 'home' | 'editor';
/** What failed on the home screen; the text is in `fr.home`. */
export type ProjectError = 'create' | 'open' | 'duplicate' | 'delete' | 'rename';
export type SnapshotNote = 'saved' | 'failed';

export interface ProjectState {
  view: View;
  /** Most recent first; loaded by `refreshRecent`. */
  recent: RecentProject[];
  /** True while a create, an open (including its folder dialog) or a duplication is running. */
  busy: boolean;
  /** The folder of the album being duplicated, `null` when none is. */
  duplicating: string | null;
  error: ProjectError | null;
  /** Ids of the assets whose original file was missing when the book was opened. */
  missing: string[];
  snapshotNote: SnapshotNote | null;

  refreshRecent(): Promise<void>;
  /** Create a book and show it. Resolves to false when the user cancelled or it failed. */
  createProject(options: CreateProjectOptions): Promise<boolean>;
  /** Open the book in `dir` (or the one a folder dialog gives) and show it; false if not shown. */
  openProject(dir?: string): Promise<boolean>;
  /** Copy the album in `dir` as "<title> (copie)" and refresh the list, without opening it. */
  duplicateProject(dir: string): Promise<boolean>;
  /** Move the album in `dir` to the system trash and refresh the list; false when it failed. */
  deleteProject(dir: string): Promise<boolean>;
  /** Give the album in `dir` a new title and refresh the list; false when it failed. */
  renameProject(dir: string, title: string): Promise<boolean>;
  /** Save the open book, then show the home screen. A failed save keeps the editor on screen. */
  goHome(): Promise<void>;
  dismissMissing(): void;
  /** Originals that were put back: they are no longer missing. */
  restoreMissing(ids: readonly string[]): void;
  /** Ctrl+S: save the book, then write a manual snapshot. */
  manualSnapshot(): Promise<void>;
  /** Start the 10-minute automatic snapshots; returns the function that stops them. */
  startAutoSnapshots(intervalMs?: number): () => void;
}

export interface ProjectStoreDeps {
  editor: EditorStore;
  /** Brings the cover thumbnail up to date; called while the editor is still on screen. */
  flushCover?(): Promise<void>;
  api: {
    create(options: CreateProjectOptions): Promise<ProjectInfo | null>;
    open(dir?: string): Promise<OpenedProject | null>;
    recent(): Promise<RecentProject[]>;
    duplicate(dir: string): Promise<ProjectInfo>;
    delete(dir: string): Promise<void>;
    rename(dir: string, title: string): Promise<ProjectInfo>;
    snapshot(label: SnapshotInfo['label']): Promise<SnapshotInfo>;
  };
}

export type ProjectStore = StoreApi<ProjectState>;

export function createProjectStore({ editor, api, flushCover }: ProjectStoreDeps): ProjectStore {
  /** The book as it was at the last snapshot (or when it was opened): the baseline of "changed". */
  let snapshotBase: Book | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotting: Promise<void> = Promise.resolve();

  return createStore<ProjectState>()((set, get) => {
    const note = (value: SnapshotNote) => {
      clearTimeout(noteTimer);
      set({ snapshotNote: value });
      noteTimer = setTimeout(() => set({ snapshotNote: null }), SNAPSHOT_NOTE_MS);
    };

    /** Save the book, snapshot it, and remember what was snapshotted. */
    const takeSnapshot = (label: SnapshotInfo['label']): Promise<void> => {
      const run = async () => {
        await editor.getState().flush();
        const flushed = editor.getState().book;
        await api.snapshot(label);
        snapshotBase = flushed;
      };
      snapshotting = snapshotting.then(run, run);
      return snapshotting;
    };

    const show = async <T extends { book: Book; missing?: string[] }>(
      kind: ProjectError,
      open: () => Promise<T | null>,
    ): Promise<T | null> => {
      if (get().busy) return null;
      set({ busy: true, error: null });
      try {
        const opened = await editor.getState().openWith(open);
        if (opened) {
          snapshotBase = opened.book;
          geometryCache.clear(); // ids are content addresses: another album may differ
          set({ view: 'editor', missing: opened.missing ?? [], snapshotNote: null });
        }
        return opened;
      } catch (error) {
        console.warn(`Could not ${kind} the album:`, error);
        set({ error: kind });
        return null;
      } finally {
        set({ busy: false });
      }
    };

    return {
      view: 'home',
      recent: [],
      duplicating: null,
      busy: false,
      error: null,
      missing: [],
      snapshotNote: null,

      async refreshRecent() {
        try {
          set({ recent: await api.recent() });
        } catch (error) {
          console.warn('Could not read the recent albums:', error);
        }
      },
      async createProject(options) {
        return (await show('create', () => api.create(options))) !== null;
      },
      async openProject(dir) {
        return (await show('open', () => api.open(dir))) !== null;
      },
      async duplicateProject(dir) {
        if (get().busy) return false;
        set({ busy: true, duplicating: dir, error: null });
        try {
          await api.duplicate(dir);
        } catch (error) {
          console.warn('Could not duplicate the album:', error);
          set({ error: 'duplicate' });
          return false;
        } finally {
          set({ busy: false, duplicating: null });
        }
        await get().refreshRecent();
        return true;
      },
      async deleteProject(dir) {
        if (get().busy) return false;
        set({ busy: true, error: null });
        try {
          await api.delete(dir);
        } catch (error) {
          console.warn('Could not delete the album:', error);
          set({ error: 'delete' });
          return false;
        } finally {
          set({ busy: false });
        }
        await get().refreshRecent();
        return true;
      },
      async renameProject(dir, title) {
        if (get().busy) return false;
        set({ busy: true, error: null });
        try {
          await api.rename(dir, title);
        } catch (error) {
          console.warn('Could not rename the album:', error);
          set({ error: 'rename' });
          return false;
        } finally {
          set({ busy: false });
        }
        await get().refreshRecent();
        return true;
      },
      async goHome() {
        try {
          await editor.getState().flush();
        } catch {
          return; // the top bar shows the failed save and offers a retry
        }
        await flushCover?.(); // never rejects: the thumbnail is a cache
        set({ view: 'home' });
        geometryCache.clear();
        await get().refreshRecent();
      },
      dismissMissing() {
        set({ missing: [] });
      },
      restoreMissing(ids) {
        const { missing } = get();
        if (missing.some((id) => ids.includes(id))) {
          set({ missing: missing.filter((id) => !ids.includes(id)) });
        }
      },
      async manualSnapshot() {
        if (get().view !== 'editor' || editor.getState().book === null) return;
        try {
          await takeSnapshot('manual');
          note('saved');
        } catch (error) {
          console.warn('Could not write the snapshot:', error);
          note('failed');
        }
      },
      startAutoSnapshots(intervalMs = AUTO_SNAPSHOT_MS) {
        const timer = setInterval(() => {
          const book = editor.getState().book;
          if (get().view !== 'editor' || book === null || book === snapshotBase) return;
          takeSnapshot('auto').catch((error: unknown) => {
            console.warn('Could not write the automatic snapshot:', error);
          });
        }, intervalMs);
        return () => clearInterval(timer);
      },
    };
  });
}

/** Keeps the cover thumbnail of the open album up to date for the home screen. */
export const coverThumbs = createCoverThumbs({
  store: editorStore,
  capture: captureCoverThumb,
  hasThumb: () => window.tb.project.hasCoverThumb(),
});

/** The app's project store, over `window.tb` and the app's editor store. */
export const projectStore = createProjectStore({
  editor: editorStore,
  flushCover: () => coverThumbs.flush(),
  api: {
    create: (o) => window.tb.project.create(o),
    open: (d) => window.tb.project.open(d),
    recent: () => window.tb.project.recent(),
    duplicate: (d) => window.tb.project.duplicate(d),
    delete: (d) => window.tb.project.delete(d),
    rename: (d, t) => window.tb.project.rename(d, t),
    snapshot: (l) => window.tb.project.snapshot(l),
  },
});

export function useProject<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}
