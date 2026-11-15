// TbApi and all IPC payload types live here. Types only: this file is compiled for the renderer,
// the preload and the main process alike.
import type {
  AssetRef,
  Book,
  Element,
  Licence,
  PreflightIssue,
  Template,
  Theme,
} from '@travelbook/core';

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
  /** A `tb://cover/...` address, set when the project has a cover thumbnail. */
  coverThumb?: string;
}

/** A region of the page, in CSS px from its top left corner. */
export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** The templates and themes the app ships with (`origin: 'bundled'`, ids start with `b-`). */
  bundledTemplates(): Promise<{ templates: Template[]; themes: Theme[] }>;
  /** The patterns and textures the app ships with, each with its licence. */
  bundledBackgrounds(): Promise<BundledBackground[]>;
  /** The user's own templates (`origin: 'user'`, ids start with `user-`), one JSON file each. */
  userTemplates: {
    /** Replaces the template with the same id. */
    save(template: Template): Promise<void>;
    list(): Promise<Template[]>;
    delete(templateId: string): Promise<void>;
  };
}

/** A pattern tile or a paper texture the app ships with, from `resources/backgrounds.json`. */
export interface BundledBackground {
  /** `patterns/<name>.svg` or `textures/<name>.webp`: relative to the bundled resources, and the `tb://resource/` path. */
  file: string;
  kind: 'pattern' | 'texture';
  /** French name. */
  title: string;
  licence: Licence;
}

/** Elements on the system clipboard (`application/x-travelbook`), with what they need. */
export interface ClipboardPayload {
  /** Where they were copied from: pasting back there shifts them so they do not hide the originals. */
  origin: { bookId: string; spreadId: string };
  elements: Element[];
  /** The assets the elements use, as the source album knows them. */
  assets: AssetRef[];
}

/** What the export dialog asks for (Task 7.4 fills it in; Tasks 7.2 and 7.3 carry it out). */
export interface ExportOptions {
  route: 'pdf' | 'images';
  /** Pages by number (the cover is not numbered); the cover follows `includeCover`. */
  pages: 'all' | { from: number; to: number };
  includeCover: boolean;
  dpi: number;
  /** Keep every photo at the pixel size of its visible window instead of the frame at `dpi`. */
  nativeResolution: boolean;
  bleed: boolean;
  cropMarks: boolean;
  imageFormat: 'jpeg' | 'png';
  /** 95 to 100 in the dialog; 98 by default. */
  jpegQuality: number;
  /** Images route: one file per double page instead of one per page. */
  perSpread: boolean;
  /** The cover as three files (front, back, spine) or as one flat sheet. */
  coverMode: 'flat' | 'panels';
  /** Absolute path of the folder the files go to. */
  outDir: string;
}

export interface ExportReport {
  /** Absolute paths, in export order. */
  files: string[];
  pages: number;
  seconds: number;
  warnings: PreflightIssue[];
}

/** `step` is `derivatives`, `render`, `capture` or `write`; `page` counts from 1. */
export interface ExportProgress {
  page: number;
  total: number;
  step: string;
}

export interface ExportPreset {
  name: string;
  /** A built-in preset: it has no destination (`outDir` is empty) and cannot be deleted. */
  builtin?: boolean;
  options: ExportOptions;
}

export interface ExportApi {
  /**
   * Export the album main has open, as it was last saved. Rejects when a photo is missing, when
   * another export is running, or after `cancel` (with partial files removed).
   */
  run(options: ExportOptions): Promise<ExportReport>;
  /** Stop after the page being captured and remove the files written so far. */
  cancel(): Promise<void>;
  onProgress(cb: (progress: ExportProgress) => void): () => void;
  preflight(): Promise<PreflightIssue[]>;
  /** Show the files of the last export in the system file manager. */
  reveal(): Promise<void>;
  presets: {
    /** The built-in presets first, then the user's. */
    list(): Promise<ExportPreset[]>;
    /** A name is unique (case ignored): an existing user preset of that name is replaced. */
    save(name: string, options: ExportOptions): Promise<void>;
    /** Rejects for a built-in preset. */
    delete(name: string): Promise<void>;
  };
}

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
    /**
     * Write the project's cover thumbnail (`cache/cover-thumb.jpg`, long edge 320 px) from what
     * the window shows in `rect` (CSS px of the page). The renderer draws the cover there first.
     */
    captureCover(rect: CaptureRect): Promise<void>;
    /** Does the open project have a cover thumbnail? It is a cache: false means rebuild it. */
    hasCoverThumb(): Promise<boolean>;
  };
  photos: {
    /** The image files the user picks in a dialog; empty when they cancel. */
    pick(): Promise<string[]>;
    /** Copy photos (files, or folders of photos) into the open project. Does not touch the book. */
    import(paths: string[]): Promise<ImportReport>;
    /** `cb(done, total)` runs once per file during an import; returns the unsubscribe function. */
    onProgress(cb: (done: number, total: number) => void): () => void;
    /**
     * The absolute path of a file or folder dropped from the system (the sandboxed renderer
     * cannot read `File.path`). Empty when the `File` is not backed by a file on disk. The result
     * goes to `import`; the renderer never reads the file itself.
     */
    pathForFile(file: File): string;
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
    /**
     * Copy a bundled pattern (an asset of kind `pattern`) or texture (kind `background`) into the
     * open project's `assets/`, with its licence. `file` is a `BundledBackground.file`.
     */
    fromBundled(file: string): Promise<AssetRef>;
    /** Up to 6 dominant colours of the given assets, as `#rrggbb`, most present first. */
    palette(assetIds: string[]): Promise<string[]>;
  };
  library: LibraryApi;
  clipboard: {
    writeElements(payload: ClipboardPayload): Promise<void>;
    /**
     * The elements on the clipboard, or `null`. Files of assets this album does not hold are
     * copied in from the album they came from before it resolves; `assets` are then all in the
     * open project, and the caller adds the missing ones to its book through `store.apply`.
     */
    readElements(): Promise<ClipboardPayload | null>;
  };
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
