import { useEffect, useRef } from 'react';
import type { RecentProject } from '../../shared/api';
import { fr } from '../strings/fr';

interface Props {
  project: RecentProject;
  busy: boolean;
  failed: boolean;
  onConfirm(): void;
  onClose(): void;
}

/**
 * Asks before an album goes to the trash. A native modal dialog: Escape and "Annuler" close it
 * and nothing happens; the focus starts on "Annuler", so Enter alone never deletes.
 */
export function DeleteAlbumDialog({ project, busy, failed, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancel.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="delete-album-title"
      aria-describedby="delete-album-text"
      onClose={onClose}
    >
      <div className="dialog__form">
        <h2 id="delete-album-title" className="dialog__title">
          {fr.home.deleteTitle(project.title)}
        </h2>
        <p id="delete-album-text">{fr.home.deleteText}</p>
        {failed && (
          <p className="dialog__error" role="alert">
            {fr.home.deleteFailed}
          </p>
        )}
        <div className="dialog__actions">
          <button
            ref={cancel}
            type="button"
            className="button"
            onClick={() => ref.current?.close()}
          >
            {fr.home.deleteCancel}
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {fr.home.deleteConfirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
