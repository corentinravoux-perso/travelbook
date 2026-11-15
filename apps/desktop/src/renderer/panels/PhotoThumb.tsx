import type { AssetRef } from '@travelbook/core';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { fr } from '../strings/fr';

interface Props {
  asset: AssetRef;
  /** How many places of the book use this photo; the count shows over the thumbnail. */
  uses: number;
  /** Ticked in the tray (the picker has no selection). */
  selected?: boolean;
  onActivate(e: MouseEvent | KeyboardEvent): void;
  /** Present when the thumbnail can be dragged onto the page. */
  onDragStart?(e: DragEvent): void;
}

/** One photo of the tray or the picker: its thumbnail, its usage count, and its state. */
export function PhotoThumb({ asset, uses, selected, onActivate, onDragStart }: Props) {
  return (
    <div
      className="photo-thumb"
      role="button"
      tabIndex={0}
      // The tray ticks photos (a toggle button); the picker only chooses, so it has no state.
      aria-pressed={selected}
      aria-label={fr.photos.photoLabel(asset.originalName, uses)}
      title={asset.originalName}
      data-asset-id={asset.id}
      data-uses={uses}
      draggable={onDragStart !== undefined}
      onDragStart={onDragStart}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(e);
        }
      }}
    >
      <img
        src={assetUrl(asset.id, 'thumb')}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
      />
      {uses > 0 && (
        <span className="photo-thumb__uses" aria-hidden="true">
          {uses}
        </span>
      )}
    </div>
  );
}
