// TbApi and all IPC payload types live here. Types only: this file is compiled for the renderer,
// the preload and the main process alike.
import type { AssetRef, Book, Licence, Template } from '@travelbook/core';

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

/** What a user library item is: a file the user keeps across albums. */
export type LibraryItemKind = 'sticker' | 'background' | 'font' | 'template';

/** The kinds `library.add` takes: templates are kept by `library.userTemplates`, not as files. */
export type LibraryFileKind = Exclude<LibraryItemKind, 'template'>;

export interface LibraryItem {
  /** `<kind>-<sha16>` of the file's bytes; also the `tb://library/<id>` address. */
  id: string;
  kind: LibraryItemKind;
  /** Relative to the library folder: `files/<id>.<ext>`. */
  file: string;
  title: string;
  tags: string[];
  /** Where the file comes from, when that is known. */
  licence?: Licence;
  /** ISO 8601. */
  addedAt: string;
  favourite: boolean;
  /** ISO 8601; set each time the item is copied into an album. */
  lastUsedAt?: string;
}

export interface LibraryQuery {
  /** Every word must appear in the title or in a tag; case and accents do not matter. */
  text?: string;
  /** `true` keeps the favourites only. */
  favourite?: boolean;
  /** The `n` items copied into an album most recently (never-used items are left out). */
  recent?: number;
}

/** Filled in further by phase 6 (online sources). */
export interface LibraryApi {
  /** Newest first, or most recently used first with `query.recent`. */
  list(kind: LibraryItemKind, query?: LibraryQuery): Promise<LibraryItem[]>;
  /**
   * Keep copies of files in the library. The title is the file name without its extension. A file
   * already there (same bytes) gives the existing item. A refused file stops the call: the files
   * before it stay added.
   */
  add(kind: LibraryFileKind, paths: string[]): Promise<LibraryItem[]>;
  setFavourite(itemId: string, on: boolean): Promise<void>;
  /** Forget an item and delete its file. Albums that already hold a copy keep it. */
  remove(itemId: string): Promise<void>;
  /** The user's own templates (`origin: 'user'`), one JSON file each. */
  userTemplates: {
    /** Replaces the template with the same id. */
    save(template: Template): Promise<void>;
    list(): Promise<Template[]>;
    delete(templateId: string): Promise<void>;
  };
}

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
    /** A folder dialog to choose where a new album goes; `null` when the user cancels it. */
    pickFolder(): Promise<string | null>;
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
    /**
     * Copy a library item into the open project's `assets/` (once, whatever the number of calls),
     * and mark the item as used. Same asset shape and id as `importFiles`, plus the item's licence.
     */
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
    /**
     * Register what runs when the window is about to close: it must resolve once the open album
     * is saved, and reject if saving fails (main then asks the user what to do). One handler at
     * a time; without one, the window closes at once. Returns the unregister function.
     */
    onCloseRequest(handler: () => Promise<void>): () => void;
  };
}
