import { useEffect, useState, type DragEvent } from 'react';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import { STICKER_DRAG_TYPE, encodeStickerDrag, licenceMark, type Tile } from './model';

const t = fr.stickers;

/** What main said about a raster hit, remembered so that scrolling back does not ask again. */
const opacityOf = new Map<string, boolean | undefined>();

/** Is this raster hit's picture without any transparent pixel? Asked once, when its tile shows. */
function useOpaque(tile: Tile): boolean {
  const { ref } = tile;
  const asks = ref.kind === 'hit' && tile.raster;
  const [opaque, setOpaque] = useState(() => (asks ? opacityOf.get(tile.key) === true : false));
  useEffect(() => {
    if (!asks || ref.kind !== 'hit' || opacityOf.has(tile.key)) return;
    let live = true;
    window.tb.library.stickers.isOpaque({ source: ref.source, id: ref.id }).then(
      (answer) => {
        opacityOf.set(tile.key, answer);
        if (live && answer === true) setOpaque(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [asks, ref, tile.key]);
  return opaque;
}

interface Props {
  tile: Tile;
  onPlace(tile: Tile): void;
  /** Without it the tile has no star. */
  onFavourite?(tile: Tile): void;
  /** Without it the tile cannot be deleted (only the user's own stickers can). */
  onRemove?(tile: Tile): void;
  favourite: boolean;
}

/**
 * One sticker of a grid: a button that places it (a click, or a drag onto the page), with its
 * licence mark, a star, and the "fond non transparent" mark on a raster that has a background.
 */
export function StickerTile({ tile, onPlace, onFavourite, onRemove, favourite }: Props) {
  const opaque = useOpaque(tile);
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(STICKER_DRAG_TYPE, encodeStickerDrag(tile.ref));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className="stk-tile" data-tile={tile.key}>
      <button
        type="button"
        className="stk-tile__button"
        aria-label={t.place(tile.title)}
        title={tile.title}
        draggable
        onDragStart={onDragStart}
        onClick={() => onPlace(tile)}
      >
        <img src={tile.src} alt="" loading="lazy" draggable={false} />
      </button>
      {tile.licence !== undefined && (
        <span
          className="stk-tile__licence"
          title={t.licenceTitle(tile.licence.licence, tile.licence.author, tile.licence.source)}
        >
          {licenceMark(tile.licence.licence)}
        </span>
      )}
      {opaque && (
        <span
          className="stk-tile__opaque"
          role="img"
          aria-label={t.opaque}
          title={`${t.opaque}. ${t.opaqueHelp}`}
        >
          <Icon name="square" />
        </span>
      )}
      {onRemove !== undefined && (
        <button
          type="button"
          className="stk-tile__remove"
          aria-label={t.remove}
          title={t.remove}
          onClick={() => onRemove(tile)}
        >
          <Icon name="trash" />
        </button>
      )}
      {onFavourite !== undefined && (
        <button
          type="button"
          className="stk-tile__star"
          aria-pressed={favourite}
          aria-label={favourite ? t.unfavourite : t.favourite}
          title={favourite ? t.unfavourite : t.favourite}
          onClick={() => onFavourite(tile)}
        >
          <Icon name="star" />
        </button>
      )}
    </div>
  );
}
