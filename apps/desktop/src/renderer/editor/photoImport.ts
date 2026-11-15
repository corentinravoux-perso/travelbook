import type { AssetRef, Book } from '@travelbook/core';
import type { ImportReport } from '../../shared/api';
import { editorStore, type EditorStore } from '../store/editor';
import { trayStore, type ImportFailure, type TrayStore } from '../store/tray';
import { fr } from '../strings/fr';

/** The file name of a path, whichever separator the system uses. */
export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Why a file was refused, in French. Main sends English text (`describeError` in
 * `main/photos/import.ts`), kept for the logs: the user reads the matching sentence of `fr`.
 */
export function describeFailure(reason: string): string {
  const text = fr.photos.failure;
  if (/not found/i.test(reason)) return text.notFound;
  if (/permission denied/i.test(reason)) return text.denied;
  if (/unsupported/i.test(reason)) return text.unsupported;
  if (/does not match the source|changed during/i.test(reason)) return text.changed;
  return text.unreadable;
}

/**
 * The paths of the files and folders dropped from the system. The sandboxed renderer cannot read
 * them itself: `pathForFile` (the preload's `webUtils.getPathForFile`) names them. Something that
 * is not backed by a file on disk (a dragged text, say) gives nothing.
 */
export function droppedPaths(
  files: ArrayLike<File>,
  pathForFile: (file: File) => string,
): string[] {
  return Array.from(files).flatMap((file) => {
    try {
      const path = pathForFile(file);
      return path === '' ? [] : [path];
    } catch {
      return [];
    }
  });
}

/** `book` with `assets` added to `book.assets`; the same book when it already holds them all. */
export function withAssets(book: Book, assets: readonly AssetRef[]): Book {
  const missing = assets.filter((a) => book.assets[a.id] === undefined);
  if (missing.length === 0) return book;
  return {
    ...book,
    assets: { ...book.assets, ...Object.fromEntries(missing.map((a) => [a.id, a])) },
  };
}

export interface ImportDeps {
  editor: EditorStore;
  tray: TrayStore;
  import(paths: string[]): Promise<ImportReport>;
  onProgress(cb: (done: number, total: number) => void): () => void;
}

export interface PhotoImporter {
  /**
   * Import files or folders into the open album and add the new photos to the book as one undo
   * step. Resolves to the ids of the photos the paths gave, in the order the report lists them
   * (new ones, then ones the album already had), ready to be placed; empty when nothing came in.
   * Imports run one after the other. Files that failed are left in the tray store, in French.
   */
  importPaths(paths: string[]): Promise<string[]>;
}

export function createPhotoImporter(deps: ImportDeps): PhotoImporter {
  /**
   * Main forgets nothing it imported, but an undo removes the photos from the book: a file
   * imported again then comes back as a duplicate whose record only we still hold. Kept per book.
   */
  const seen = new Map<string, Map<string, AssetRef>>();
  let queue: Promise<unknown> = Promise.resolve();

  const run = async (paths: string[]): Promise<string[]> => {
    const { editor, tray } = deps;
    const start = editor.getState().book;
    if (!start || paths.length === 0) return [];
    tray.getState().setProgress({ done: 0, total: 0 });
    const off = deps.onProgress((done, total) => tray.getState().setProgress({ done, total }));
    let report: ImportReport;
    try {
      report = await deps.import(paths);
    } catch (error) {
      console.warn('The import failed:', error);
      tray.getState().setFailures([{ name: null, reason: fr.photos.importFailed }]);
      return [];
    } finally {
      off();
      tray.getState().setProgress(null);
    }

    const failures: ImportFailure[] = report.failed.map((f) => ({
      name: baseName(f.path),
      reason: describeFailure(f.reason),
    }));
    tray.getState().setFailures(failures);

    // Another album may be open by now: its book has nothing to do with this import.
    const book = editor.getState().book;
    if (!book || book.id !== start.id) return [];

    const known = seen.get(book.id) ?? new Map<string, AssetRef>();
    seen.set(book.id, known);
    for (const asset of report.added) known.set(asset.id, asset);
    const ids = [
      ...new Set([...report.added.map((a) => a.id), ...report.duplicates.map((d) => d.assetId)]),
    ];
    const records = ids.flatMap((id) => {
      const asset = known.get(id);
      return asset ? [asset] : [];
    });
    editor.getState().apply((b) => withAssets(b, records), fr.photos.undoImport);
    // A duplicate the book neither has nor we remember cannot be placed.
    const after = editor.getState().book;
    return ids.filter((id) => after?.assets[id] !== undefined);
  };

  return {
    importPaths(paths) {
      const result = queue.then(() => run(paths));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

/** The app's importer, over `window.tb`. */
export const photoImporter = createPhotoImporter({
  editor: editorStore,
  tray: trayStore,
  import: (paths) => window.tb.photos.import(paths),
  onProgress: (cb) => window.tb.photos.onProgress(cb),
});
