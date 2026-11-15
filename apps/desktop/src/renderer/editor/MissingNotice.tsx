import { useEditor } from '../store/editor';
import { projectStore, useProject } from '../store/project';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';

/** Lists the originals that were missing when the album was opened. Not modal: it can be closed. */
export function MissingNotice() {
  const missing = useProject((s) => s.missing);
  const assets = useEditor((s) => s.book?.assets);
  if (missing.length === 0) return null;

  return (
    <aside className="missing-notice" role="status" aria-label={fr.missing.title(missing.length)}>
      <div className="missing-notice__body">
        <p className="missing-notice__title">
          <Icon name="alert-triangle" />
          {fr.missing.title(missing.length)}
        </p>
        <ul className="missing-notice__list">
          {missing.map((id) => (
            <li key={id}>{assets?.[id]?.originalName ?? id}</li>
          ))}
        </ul>
        <p className="missing-notice__hint">{fr.missing.hint}</p>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.missing.dismiss}
        title={fr.missing.dismiss}
        onClick={() => projectStore.getState().dismissMissing()}
      >
        <Icon name="x" />
      </button>
    </aside>
  );
}
