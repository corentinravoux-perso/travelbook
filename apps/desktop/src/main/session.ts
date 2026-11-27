import { resolve } from 'node:path';
import type { AssetRef, Book } from '@travelbook/core';
import { coverDirOf } from './project/cover-thumb';
import type { TbExportJob, TbRoots } from './protocol';

/**
 * The project the window has open. Main keeps it so that the renderer never has to name a
 * folder after it was opened, and so that `tb://asset/<id>` can be answered from an index of
 * the assets the project holds instead of from a path the renderer chose.
 */
export interface Session {
  /** Absolute path of the `.travelbook` folder. */
  readonly dir: string;
  /** The book as last created, opened or saved: what `snapshot` copies. */
  book: Book;
  /**
   * Every asset `tb://` may serve, by id: those of the book, plus those imported since. An import
   * is indexed at once, because the renderer saves only after it has added the assets to its
   * book, and an asset is never dropped before the project is closed (its files stay on disk).
   */
  readonly assets: Map<string, AssetRef>;
}

let current: Session | null = null;

/**
 * The queue of what writes into a project folder in the background: imports (photos, stickers,
 * backgrounds, fonts, map geometries) and the copy of the fonts a save needs. They run one at a
 * time, and closing the project waits for them.
 */
export const projectQueue = (dir: string): string => `import:${resolve(dir)}`;

export function openSession(dir: string, book: Book): Session {
  const session: Session = { dir, book, assets: new Map() };
  recordBook(session, book);
  current = session;
  return session;
}

export function currentSession(): Session | null {
  return current;
}

export function requireSession(): Session {
  if (current === null) throw new Error('No project is open: create or open one first');
  return current;
}

/** Forget the open project (tests; the app keeps its project until another one is opened). */
export function closeSession(): void {
  current = null;
}

export function recordBook(session: Session, book: Book): void {
  session.book = book;
  recordAssets(session, Object.values(book.assets));
}

export function recordAssets(session: Session, assets: readonly AssetRef[]): void {
  for (const asset of assets) session.assets.set(asset.id, asset);
}

/** The indexed assets as a record, the shape of `Book['assets']`. */
export function knownAssets(session: Session): Record<string, AssetRef> {
  return Object.fromEntries(session.assets);
}

let libraryFileLookup: (itemId: string) => string | undefined = () => undefined;

/**
 * Tell `tb://library/<itemId>` where an item's file is, relative to the library folder. The user
 * library (Task 3.4) calls this once it exists; until then every item is unknown.
 */
export function setLibraryFileLookup(
  lookup: ((itemId: string) => string | undefined) | null,
): void {
  libraryFileLookup = lookup ?? (() => undefined);
}

/** The roots of the `tb:` scheme for `session` (or for no project at all). */
export function tbRoots(
  session: Session | null,
  fixed: {
    libraryDir: string;
    resourcesDir: string;
    exportJob?: (token: string) => TbExportJob | undefined;
  },
): TbRoots {
  return {
    projectDir: session?.dir ?? null,
    libraryDir: fixed.libraryDir,
    resourcesDir: fixed.resourcesDir,
    asset: (id) => {
      const asset = session?.assets.get(id);
      return asset === undefined
        ? undefined
        : { file: asset.file, proxies: asset.kind === 'photo' };
    },
    libraryFile: (id) => libraryFileLookup(id),
    coverDir: (id) => coverDirOf(id),
    ...(fixed.exportJob ? { exportJob: fixed.exportJob } : {}),
  };
}
