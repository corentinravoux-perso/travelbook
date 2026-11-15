import { addElement } from '@travelbook/core';
import { useEffect, useRef } from 'react';
import { createStore, useStore } from 'zustand';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { creditEntries, creditLine, creditsRect, creditsTextElement } from './creditsModel';

const t = fr.credits;

const creditsStore = createStore<{ open: boolean }>(() => ({ open: false }));

export const openCredits = (): void => creditsStore.setState({ open: true });

/** A button that opens the credits dialog. */
export function CreditsMenuButton() {
  return (
    <button type="button" className="button button--small" onClick={openCredits}>
      {fr.stickerInspector.credits}
    </button>
  );
}

/** The top bar entry "Crédits des images". */
export function CreditsEntry() {
  return (
    <button type="button" className="icon-button credits-entry" onClick={openCredits}>
      {t.menu}
    </button>
  );
}

/**
 * "Crédits des images": the licences of every asset the album uses (photos only when they carry
 * licence data), and a button that puts them on the current page as a text block, in one undo
 * step. Mounted once by the shell.
 */
export function CreditsDialog() {
  const open = useStore(creditsStore, (s) => s.open);
  const book = useEditor((s) => s.book);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open || book === null) return null;
  const entries = creditEntries(book);

  const insert = (): void => {
    const state = editorStore.getState();
    const spread = findSpread(state.book, state.currentSpreadId);
    if (state.book === null || spread === undefined) return;
    const el = creditsTextElement(entries, creditsRect(state.book, spread, entries.length));
    state.apply((b) => addElement(b, spread.id, el), t.undoInsert);
    state.select([el.id]);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="dialog dialog--scroll"
      aria-labelledby="credits-title"
      onClose={() => creditsStore.setState({ open: false })}
    >
      <div className="dialog__form">
        <h2 id="credits-title" className="dialog__title">
          {t.title}
        </h2>
        <p className="field__help">{t.intro}</p>
        {entries.length === 0 ? (
          <p className="credits-empty">{t.empty}</p>
        ) : (
          <ul className="credits-list">
            {entries.map((entry) => (
              <li key={entry.assetId} data-asset={entry.assetId}>
                {creditLine(entry)}
              </li>
            ))}
          </ul>
        )}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {t.close}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={entries.length === 0}
            onClick={insert}
          >
            {t.insert}
          </button>
        </div>
      </div>
    </dialog>
  );
}
