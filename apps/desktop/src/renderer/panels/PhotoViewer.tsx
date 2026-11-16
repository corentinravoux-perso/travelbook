import type { AssetRef, Book } from '@travelbook/core';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { isOnSpread, togglePhotoOnPage } from '../editor/trayToggle';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';

const TAKEN = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function takenOn(asset: AssetRef): string | null {
  const iso = asset.exif?.takenAt;
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : TAKEN.format(date);
}

interface Props {
  book: Book;
  /** The photos to browse, in the order of the tray. */
  photos: AssetRef[];
  /** The photo shown first. */
  start: string;
  usage: Record<string, number>;
  onClose(): void;
}

/**
 * A photo of the tray, large, over the whole window (a double-click on its thumbnail). The arrow
 * keys and the side buttons go through the photos of the tray; the button at the bottom puts the
 * photo on the double page in view or takes it off; Escape, the close button or a click on the
 * dark surround closes it. A modal dialog: the editor's keys do not reach the page behind.
 */
export function PhotoViewer({ book, photos, start, usage, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState(start);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const index = Math.max(
    0,
    photos.findIndex((p) => p.id === id),
  );
  const asset = photos[index] ?? book.assets[id];
  const count = photos.length;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const go = (step: number) => {
    if (count === 0) return;
    setId(photos[(index + step + count) % count]!.id);
  };

  if (!asset) return null;
  const here = isOnSpread(book, spreadId, asset.id);
  const uses = usage[asset.id] ?? 0;
  const date = takenOn(asset);

  return (
    <dialog
      ref={ref}
      className="photo-viewer"
      aria-label={fr.photos.viewer(asset.originalName)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(-1);
        }
      }}
      onClick={(e) => {
        // The dark surround closes; the photo and the bars do not.
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).classList.contains('photo-viewer__stage')
        ) {
          onClose();
        }
      }}
    >
      <header className="photo-viewer__bar">
        <p className="photo-viewer__name" title={asset.originalName}>
          {asset.originalName}
        </p>
        {count > 1 && (
          <p className="photo-viewer__position">{fr.photos.viewerPosition(index + 1, count)}</p>
        )}
        <button
          type="button"
          className="photo-viewer__icon"
          aria-label={fr.photos.viewerClose}
          title={fr.photos.viewerClose}
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </header>
      <div className="photo-viewer__stage">
        {count > 1 && (
          <button
            type="button"
            className="photo-viewer__icon photo-viewer__turn photo-viewer__turn--prev"
            aria-label={fr.photos.viewerPrev}
            title={fr.photos.viewerPrev}
            onClick={() => go(-1)}
          >
            <Icon name="chevron-left" />
          </button>
        )}
        <img
          key={asset.id}
          className="photo-viewer__image"
          src={assetUrl(asset.id, 'preview')}
          alt={asset.originalName}
          draggable={false}
        />
        {count > 1 && (
          <button
            type="button"
            className="photo-viewer__icon photo-viewer__turn photo-viewer__turn--next"
            aria-label={fr.photos.viewerNext}
            title={fr.photos.viewerNext}
            onClick={() => go(1)}
          >
            <Icon name="chevron-right" />
          </button>
        )}
      </div>
      <footer className="photo-viewer__bar photo-viewer__bar--foot">
        <p className="photo-viewer__meta">
          {date !== null && <span>{date}</span>}
          {asset.pixel && <span>{fr.photos.viewerPixels(asset.pixel.w, asset.pixel.h)}</span>}
          <span>{fr.photos.viewerUses(uses)}</span>
        </p>
        <button
          type="button"
          className={here ? 'button photo-viewer__toggle' : 'button button--primary'}
          disabled={spreadId === null}
          onClick={() => togglePhotoOnPage(asset.id)}
        >
          <Icon name={here ? 'photo-off' : 'photo-plus'} />
          {here ? fr.photos.viewerTakeOff : fr.photos.viewerPutOn}
        </button>
      </footer>
    </dialog>
  );
}
