import { useCallback, useState, type ReactNode } from 'react';
import type { OnlineSearch } from './useOnlineSearch';
import { fr } from '../../strings/fr';
import { StickerTile } from './StickerTile';
import { TileGrid } from './TileGrid';
import { tileOfHit, applyFilters, type Filters, type Tile } from './model';
import { placeSticker } from '../../editor/stickerActions';

const t = fr.stickers;

/** Keep a found sticker in the library and flip its favourite flag; remembers it per tile. */
export function useHitFavourites(): {
  isFavourite(tile: Tile): boolean;
  toggle(tile: Tile): void;
} {
  const [on, setOn] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (tile: Tile) => {
      if (tile.ref.kind !== 'hit') return;
      const { source, id } = tile.ref;
      const next = !on.has(tile.key);
      window.tb.library.stickers
        .add({ source, id })
        .then((item) => window.tb.library.setFavourite(item.id, next))
        .then(
          () =>
            setOn((old) => {
              const copy = new Set(old);
              if (next) copy.add(tile.key);
              else copy.delete(tile.key);
              return copy;
            }),
          (error: unknown) => console.error('Favourite failed', error),
        );
    },
    [on],
  );
  return { isFavourite: (tile) => on.has(tile.key), toggle };
}

/**
 * The results of a paged search as a grid: the loading, empty and error states in French, and
 * the "Afficher plus" button that asks for the next page.
 */
export function StickerResults({
  search,
  filters,
  empty,
  idle,
}: {
  search: OnlineSearch;
  filters: Filters;
  /** Said when a search found nothing. */
  empty: ReactNode;
  /** Said before any search was made. */
  idle: ReactNode;
}) {
  const favourites = useHitFavourites();
  const tiles = applyFilters(search.items.map(tileOfHit), filters);
  const { status } = search;

  const footer = (
    <>
      {status === 'loading' && (
        <p className="stk-state" role="status">
          {t.loading}
        </p>
      )}
      {status === 'error' && search.error !== null && (
        <div className="stk-state stk-state--error" role="alert">
          <p>{search.error}</p>
          <button type="button" className="button button--small" onClick={search.retry}>
            {t.retry}
          </button>
        </div>
      )}
      {status === 'done' && tiles.length === 0 && <p className="stk-state">{empty}</p>}
      {status === 'idle' && <p className="stk-state">{idle}</p>}
      {status === 'done' && search.hasMore && (
        <button type="button" className="button button--small stk-more" onClick={search.more}>
          {t.more}
        </button>
      )}
    </>
  );

  return (
    <TileGrid
      tiles={tiles}
      footer={footer}
      renderTile={(tile) => (
        <StickerTile
          tile={tile}
          favourite={favourites.isFavourite(tile)}
          onFavourite={favourites.toggle}
          onPlace={(chosen) => void placeSticker(chosen.ref)}
        />
      )}
    />
  );
}
