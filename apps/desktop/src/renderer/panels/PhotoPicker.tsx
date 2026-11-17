import { assetUsage, fillSlot, type AssetRef, type Book } from '@travelbook/core';
import { useEffect, useMemo, useRef } from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { PhotoGrid } from './PhotoGrid';
import { PhotoThumb } from './PhotoThumb';
import { pickerSections, type PhotoGroup } from './trayModel';

const SECTION_TITLE: Record<string, string> = {
  unused: fr.photos.pickerUnused,
  used: fr.photos.pickerUsed,
};

/**
 * Chooses a photo for a frame, over the tray: the photos not placed yet come first. A click on
 * one calls `fillSlot` (replacing the frame's photo if it has one) and closes the picker.
 */
export function PhotoPicker({ book }: { book: Book }) {
  const pickerId = useEditor((s) => s.pickerId);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const frame = findSpread(book, spreadId)?.elements.find((el) => el.id === pickerId);

  // The frame can disappear while the picker is open (undo, delete): nothing left to fill.
  const gone = frame === undefined;
  useEffect(() => {
    if (gone) editorStore.getState().closePicker();
  }, [gone]);

  const choose = (asset: AssetRef) => {
    const store = editorStore.getState();
    if (frame?.type === 'photo' && spreadId !== null && frame.assetId !== asset.id) {
      store.apply((b) => fillSlot(b, spreadId, frame.id, asset.id), fr.photos.undoFill);
    }
    store.closePicker();
  };
  return (
    <PhotoChoice
      book={book}
      hint={fr.photos.pickerHint}
      onChoose={choose}
      onClose={() => editorStore.getState().closePicker()}
    />
  );
}

/**
 * The photos of the album to choose one from (unused first), with its close button and Escape,
 * which closes it before anything under it can react. The caller decides what a choice does.
 */
export function PhotoChoice({
  book,
  hint,
  onChoose,
  onClose,
}: {
  book: Book;
  hint: string;
  onChoose(asset: AssetRef): void;
  onClose(): void;
}) {
  const sections = useMemo(() => pickerSections(book), [book]);
  const usage = useMemo(() => assetUsage(book), [book]);

  // Escape closes the chooser first, before it can clear a selection or close a dialog.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <section className="photo-picker" aria-label={fr.photos.pickerTitle}>
      <header className="photo-picker__head">
        <h3 className="photo-picker__title">{fr.photos.pickerTitle}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label={fr.photos.pickerClose}
          title={fr.photos.pickerClose}
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </header>
      {sections.length === 0 ? (
        <p className="shell-empty">{fr.photos.pickerEmpty}</p>
      ) : (
        <>
          <p className="photo-picker__hint">{hint}</p>
          <PhotoGrid
            groups={sections}
            header={(group: PhotoGroup) => (
              <div className="photo-day">
                <span className="photo-day__label">{SECTION_TITLE[group.key]}</span>
                <span className="photo-day__count">{group.photos.length}</span>
              </div>
            )}
            thumb={(asset) => (
              <PhotoThumb
                asset={asset}
                uses={usage[asset.id] ?? 0}
                onActivate={() => onChoose(asset)}
              />
            )}
          />
        </>
      )}
    </section>
  );
}
