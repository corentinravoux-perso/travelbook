// TbApi and all IPC payload types live here. Types only: this file is compiled for the renderer,
// the preload and the main process alike.
import type { AssetRef, Book, Element, Licence, Template, Theme } from '@travelbook/core';

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

/** One sticker found by a search, offline or online. */
export interface StickerHit {
  /** Where it comes from: an offline set id (`noto`) or an online source id (`openverse`). */
  source: string;
  /** Unique inside `source`. */
  id: string;
  title: string;
  /** URL the renderer can show in an `<img>`: always a `tb://` address (`sticker/` or `remote-thumb/`). */
  thumbUrl: string;
  /** URL of the full file. Main only: the renderer never loads it. */
  fileUrl: string;
  format: 'svg' | 'png' | 'webp' | 'jpg';
  licence: Licence;
  /** A monochrome pictogram that draws in `currentColor` and can be recoloured. */
  mono: boolean;
}

/** The offline sticker browser's pseudo source id; the other ids are online sources. */
export const OFFLINE_SOURCE = 'offline';

export interface StickerSearchQuery {
  /** `offline` or the id of an online source. */
  source: string;
  q: string;
  /** From 1. */
  page: number;
  /** Offline only: one set, one category (French name), colour or monochrome, licence filter. */
  set?: string;
  category?: string;
  mono?: boolean;
  noAttribution?: boolean;
}

export interface StickerSearchResult {
  items: StickerHit[];
  hasMore: boolean;
  /** Offline searches know the total. */
  total?: number;
}

export interface StickerSetInfo {
  id: string;
  name: string;
  count: number;
  licence: Licence;
  mono: boolean;
}

export interface StickerSourceInfo {
  id: string;
  label: string;
  /** The source asks for an account or key; none of the built-in ones does. */
  needsKey: boolean;
  /** Offered by the backgrounds panel (photographs) rather than the stickers panel. */
  backgrounds: boolean;
  /** A key is stored for it (the key itself never leaves main). */
  hasKey: boolean;
}

/** Why an online call failed; carried in the message of the error the renderer gets. */
export type SourceErrorKind = 'offline' | 'rateLimited' | 'badAnswer' | 'tooLarge' | 'notFound';

/** The kind of a `SourceError` that crossed the IPC bridge, or `null` for any other error. */
export function sourceErrorKind(error: unknown): SourceErrorKind | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /SourceError:(offline|rateLimited|badAnswer|tooLarge|notFound)/.exec(message);
  return match ? (match[1] as SourceErrorKind) : null;
}

/** The sticker browser: offline packs, online sources and the user's own files. */
export interface StickersApi {
  /** The offline sets, in display order. */
  sets(): Promise<StickerSetInfo[]>;
  /** The French categories of an offline set, with their sticker counts. */
  categories(setId: string): Promise<{ name: string; count: number }[]>;
  /** The online sources. */
  sources(): Promise<StickerSourceInfo[]>;
  /** Rejects with a `SourceError` kind (see `sourceErrorKind`) when an online source fails. */
  search(query: StickerSearchQuery): Promise<StickerSearchResult>;
  /**
   * Keep a found sticker in the user library (downloading it first when it is online) and give
   * the item; the same sticker again gives the same item. Only hits main handed out are known.
   */
  add(hit: { source: string; id: string }): Promise<LibraryItem>;
  /**
   * Keep an image the renderer holds as bytes (pasted, or dragged out of a browser) as a sticker
   * of the library. PNG, JPEG, WebP or SVG, at most 20 MB.
   */
  addBytes(name: string, bytes: Uint8Array): Promise<LibraryItem>;
  /**
   * Whether a raster hit has no transparent pixel (so it has a background that will show).
   * `undefined` for an SVG or when it cannot be told.
   */
  isOpaque(hit: { source: string; id: string }): Promise<boolean | undefined>;
  /** Save (or, with an empty string, forget) the key of a source that needs one. */
  setKey(sourceId: string, key: string): Promise<void>;
}

/** The five groups of the font list. */
export type FontCategory = 'manuscrite' | 'serif' | 'sans' | 'titre' | 'machine';

/** A family of fonts the editor can offer. */
export interface FontFamily {
  family: string;
  category: FontCategory;
  /** `bundled`: ships with the app; `library`: the user's own; `project`: only the album has it. */
  origin: 'bundled' | 'library' | 'project';
  faces: {
    weight: number;
    style: 'normal' | 'italic';
    /** A `tb://` address the page declares the face with. */
    url: string;
    /** For a `library` face: the library item, which `assets.fromLibrary` copies into an album. */
    itemId?: string;
  }[];
  licence: Licence;
}

/** A family found in the Fontsource catalogue. */
export interface CatalogueEntry {
  id: string;
  family: string;
  category: FontCategory;
}

export interface FontsApi {
  /** Bundled families first, then the user's own. */
  list(): Promise<FontFamily[]>;
  /** Search the Fontsource catalogue (OFL and Apache fonts); rejects with a `SourceError` kind. */
  searchCatalogue(q: string): Promise<CatalogueEntry[]>;
  /** Download a family into the user library; rejects with a `SourceError` kind. */
  addFromCatalogue(id: string): Promise<FontFamily>;
  /** A font file dialog (TTF, OTF, WOFF2); `null` when the user cancels. */
  pickFile(): Promise<string | null>;
  /** Keep a TTF, OTF or WOFF2 file in the user library. */
  importFile(path: string): Promise<FontFamily>;
  /**
   * Copy the faces of these user-library families into the open album's `assets/` and give the
   * asset records, for the caller to add to its book (`store.apply`). Other families are skipped.
   */
  assetsFor(families: string[]): Promise<AssetRef[]>;
}

export interface LibraryApi {
  stickers: StickersApi;
  fonts: FontsApi;
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
