// TbApi and all IPC payload types live here. Types only: this file is compiled for the renderer,
// the preload and the main process alike.
import type { AssetRef, Book } from '@travelbook/core';

/** One entry of a project's `history/` folder. */
export interface SnapshotInfo {
  /** File name without `.json`: `<ISO timestamp with - instead of : and .>-<label>`. */
  id: string;
  /** ISO 8601 creation time. */
  at: string;
  label: 'auto' | 'manual';
  pages: number;
}

/** One entry of the recent projects list. */
export interface RecentProject {
  dir: string;
  title: string;
  /** ISO 8601. */
  openedAt: string;
  coverThumb?: string;
}

/** The outcome of `photos.import`. The renderer adds `added` to its book and then saves. */
export interface ImportReport {
  added: AssetRef[];
  duplicates: { path: string; assetId: string }[];
  failed: { path: string; reason: string }[];
}

export interface CreateProjectOptions {
  name: string;
  /** Folder that will hold `<slug>.travelbook`. Without it, main asks the user for one. */
  parentDir?: string;
  format?: Book['format'];
}

export interface ProjectInfo {
  /** Absolute path of the `.travelbook` folder. */
  dir: string;
  book: Book;
}

export interface OpenedProject extends ProjectInfo {
  /** Ids of the assets whose original file is gone from the project folder. */
  missing: string[];
}

/** Assets the user brings in as files; photos have their own import. */
export type ImportedAssetKind = Exclude<AssetRef['kind'], 'photo'>;

/** Filled in by Task 3.4 and phase 6. */
export type LibraryApi = Record<string, never>;

/** Filled in by phase 7. */
export type ExportApi = Record<string, never>;

/**
 * `window.tb`. Every method talks to the main process, which validates what it receives. Methods
 * that need a project fail unless one was created or opened.
 */
export interface TbApi {
  project: {
    /** `null` when the user cancels the folder dialog. */
    create(options: CreateProjectOptions): Promise<ProjectInfo | null>;
    /** Without `dir`, main shows a folder dialog; `null` when the user cancels it. */
    open(dir?: string): Promise<OpenedProject | null>;
    /** Replace `book.json`. Main also remembers the book for `snapshot`. */
    save(book: Book): Promise<void>;
    recent(): Promise<RecentProject[]>;
    /** Copy the book as last saved (or opened) into `history/`. */
    snapshot(label: SnapshotInfo['label']): Promise<SnapshotInfo>;
    listSnapshots(): Promise<SnapshotInfo[]>;
    readSnapshot(id: string): Promise<Book>;
    /** Show the project folder in the system file manager. */
    reveal(): Promise<void>;
  };
  photos: {
    /** The image files the user picks in a dialog; empty when they cancel. */
    pick(): Promise<string[]>;
    /** Copy photos (files, or folders of photos) into the open project. Does not touch the book. */
    import(paths: string[]): Promise<ImportReport>;
    /** `cb(done, total)` runs once per file during an import; returns the unsubscribe function. */
    onProgress(cb: (done: number, total: number) => void): () => void;
  };
  assets: {
    /**
     * Copy stickers, backgrounds, patterns or fonts into the open project's `assets/`. Ids are
     * `<kind>-<sha16>`, so they never collide with the id of a photo of the same bytes.
     */
    importFiles(kind: ImportedAssetKind, paths: string[]): Promise<AssetRef[]>;
    /** Not implemented before Task 3.4: rejects. */
    fromLibrary(itemId: string): Promise<AssetRef>;
    /** Up to 6 dominant colours of the given assets, as `#rrggbb`, most present first. */
    palette(assetIds: string[]): Promise<string[]>;
  };
  library: LibraryApi;
  exporter: ExportApi;
  app: {
    version(): Promise<string>;
    /** Only `https:` URLs are opened. */
    openExternal(url: string): Promise<void>;
  };
}
