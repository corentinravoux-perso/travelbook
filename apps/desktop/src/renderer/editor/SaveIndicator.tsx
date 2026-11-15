import { editorStore, useEditor } from '../store/editor';
import { useProject } from '../store/project';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';

/**
 * Autosave state in the top bar: saved, saving (a change waits for the debounce or is being
 * written), or failed with a retry. A note follows Ctrl+S for a moment.
 */
export function SaveIndicator() {
  const status = useEditor((s) => s.saveStatus);
  const note = useProject((s) => s.snapshotNote);

  return (
    <div className="save-state" role="status" aria-live="polite">
      {note !== null && (
        <span className={note === 'failed' ? 'save-state__note is-error' : 'save-state__note'}>
          {note === 'failed' ? fr.save.snapshotFailed : fr.save.snapshotSaved}
        </span>
      )}
      {status === 'error' ? (
        <>
          <span className="save-state__text is-error">
            <Icon name="alert-triangle" />
            {fr.save.failed}
          </span>
          <button
            type="button"
            className="button button--small"
            onClick={() =>
              void editorStore
                .getState()
                .flush()
                .catch(() => {})
            }
          >
            {fr.save.retry}
          </button>
        </>
      ) : (
        <span className="save-state__text">
          {status === 'saved' ? fr.save.saved : fr.save.saving}
        </span>
      )}
    </div>
  );
}
