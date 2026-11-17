import { useCallback, useEffect, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { LibraryItem } from '../../../shared/api';
import { droppedPaths } from '../../editor/photoImport';
import { placeSticker } from '../../editor/stickerActions';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import { FilterBar } from './FilterBar';
import { StickerTile } from './StickerTile';
import { TileGrid } from './TileGrid';
import { NO_FILTERS, applyFilters, tileOfItem, type Filters, type Tile } from './model';

const t = fr.stickers;

export type LibraryView = 'favourites' | 'recent';

/** How many recently placed or imported stickers the "Récents" tab shows. */
export const RECENT_COUNT = 60;

const EMPTY: Record<LibraryView, string> = {
  favourites: t.emptyFavourites,
  recent: t.emptyRecent,
};

/** Image files of a drag or a paste that are not backed by a file on disk (pasted, or dragged from a browser). */
async function unbackedImages(
  files: ArrayLike<File>,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    out.push({ name: file.name || t.pasted, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return out;
}

/**
 * The stickers of the user library: "Récents", the ones placed or imported most recently (images
 * are imported here: drop files or a folder, paste, or drag an image out of a browser), and
 * "Favoris". Both are items of the user library.
 */
export function MineTab({ view }: { view: LibraryView }) {
  const [loaded, setLoaded] = useState<{ view: LibraryView; items: LibraryItem[] } | null>(null);
  // What a tab shows is the list of its own view: the one of another view is not ready yet.
  const items = loaded?.view === view ? loaded.items : null;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  /** Only "Récents" takes new images and removes them. */
  const own = view === 'recent';

  const query = view === 'favourites' ? { favourite: true } : { recent: RECENT_COUNT };
  const queryKey = JSON.stringify(query);

  /** Read the list again (after an add, a star, a removal). */
  const reload = useCallback(async (): Promise<void> => {
    setLoaded({ view, items: await window.tb.library.list('sticker', JSON.parse(queryKey)) });
  }, [view, queryKey]);

  useEffect(() => {
    let live = true;
    window.tb.library.list('sticker', JSON.parse(queryKey)).then(
      (list) => {
        if (live) setLoaded({ view, items: list });
      },
      (e: unknown) => {
        console.error('Library failed', e);
        if (!live) return;
        setLoaded({ view, items: [] });
        setError(t.error.other);
      },
    );
    return () => {
      live = false;
    };
  }, [view, queryKey]);

  const fail = (e: unknown): void => {
    console.error('Adding stickers failed', e);
    setError(t.importFailed);
  };

  const addPaths = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    await window.tb.library.add('sticker', paths);
    await reload();
  };
  const addBlobs = async (files: ArrayLike<File>): Promise<void> => {
    const images = await unbackedImages(files);
    for (const image of images) await window.tb.library.stickers.addBytes(image.name, image.bytes);
    if (images.length > 0) await reload();
  };

  const onDrop = (e: DragEvent) => {
    if (!own || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setOver(false);
    setError(null);
    const files = e.dataTransfer.files;
    // The paths and bytes are only readable during the event.
    const paths = droppedPaths(files, (file) => window.tb.photos.pathForFile(file));
    const blobs = Array.from(files).filter((f) => window.tb.photos.pathForFile(f) === '');
    void addPaths(paths)
      .then(() => addBlobs(blobs))
      .catch(fail);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!own || e.clipboardData.files.length === 0) return;
    e.preventDefault();
    setError(null);
    addBlobs(e.clipboardData.files).catch(fail);
  };

  const favourite = (tile: Tile): void => {
    if (tile.ref.kind !== 'item') return;
    window.tb.library.setFavourite(tile.ref.itemId, tile.favourite !== true).then(reload, fail);
  };
  const remove = (tile: Tile): void => {
    if (tile.ref.kind !== 'item') return;
    window.tb.library.remove(tile.ref.itemId).then(reload, fail);
  };

  const tiles = applyFilters((items ?? []).map(tileOfItem), filters);

  return (
    <div
      className={over ? 'stk-tab stk-tab--over' : 'stk-tab'}
      onDragOver={(e) => {
        if (own && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      // Focusable so that Ctrl+V reaches the tab after a click on it.
      tabIndex={own ? 0 : undefined}
    >
      <div className="stk-controls">
        {own && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setError(null);
              window.tb.photos.pick().then(addPaths).catch(fail);
            }}
          >
            <Icon name="plus" />
            {t.import}
          </button>
        )}
        {own && <p className="stk-hint">{t.dropHint}</p>}
        <FilterBar filters={filters} onChange={setFilters} />
        {error !== null && (
          <p className="stk-state stk-state--error" role="alert">
            {error}
          </p>
        )}
      </div>
      {items === null ? (
        <p className="stk-state" role="status">
          {t.loading}
        </p>
      ) : (
        <TileGrid
          tiles={tiles}
          footer={tiles.length === 0 ? <p className="stk-state">{EMPTY[view]}</p> : undefined}
          renderTile={(tile) => (
            <StickerTile
              tile={tile}
              favourite={tile.favourite === true}
              onFavourite={favourite}
              onPlace={(chosen) => void placeSticker(chosen.ref).then(() => reload())}
              {...(own ? { onRemove: remove } : {})}
            />
          )}
        />
      )}
    </div>
  );
}
