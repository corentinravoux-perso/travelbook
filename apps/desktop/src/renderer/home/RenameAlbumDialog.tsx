import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { RecentProject } from '../../shared/api';
import { fr } from '../strings/fr';

/** The longest album title (main refuses longer ones, as when an album is created). */
export const MAX_TITLE_LENGTH = 200;

interface Props {
  project: RecentProject;
  busy: boolean;
  failed: boolean;
  onSubmit(title: string): void;
  onClose(): void;
}

/**
 * Asks for the new title of an album. A native modal dialog: the field starts with the current
 * title, selected, so typing replaces it; Enter renames, Escape and "Annuler" close and nothing
 * happens. A blank title, or the same one, cannot be submitted.
 */
export function RenameAlbumDialog({ project, busy, failed, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const helpId = useId();
  const [title, setTitle] = useState(project.title);
  const trimmed = title.trim();
  const valid = trimmed !== '' && trimmed !== project.title;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    input.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !busy) onSubmit(trimmed);
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="rename-album-title" onClose={onClose}>
      <form className="dialog__form" onSubmit={submit}>
        <h2 id="rename-album-title" className="dialog__title">
          {fr.home.renameTitle}
        </h2>
        <div className="field">
          <label className="field__label" htmlFor={fieldId}>
            {fr.newBook.titleField}
          </label>
          <input
            ref={input}
            id={fieldId}
            className="input"
            type="text"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            aria-describedby={helpId}
            onChange={(e) => setTitle(e.target.value)}
          />
          <span id={helpId} className="field__help">
            {fr.home.renameHelp}
          </span>
        </div>
        {failed && (
          <p className="dialog__error" role="alert">
            {fr.home.renameFailed}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {fr.home.renameCancel}
          </button>
          <button type="submit" className="button button--primary" disabled={!valid || busy}>
            {fr.home.renameConfirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
