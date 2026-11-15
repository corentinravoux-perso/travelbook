import { useEffect } from 'react';
import { trayStore, useTray } from '../store/tray';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import './Photos.css';

function ImportProgress() {
  const progress = useTray((s) => s.progress);
  if (!progress) return null;
  const { done, total } = progress;
  return (
    <div className="import-progress">
      <div className="import-progress-text">
        <span>{fr.photos.importing}</span>
        <span>{fr.photos.importProgress(done, total)}</span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={fr.photos.importing}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        data-indeterminate={total === 0 || undefined}
      >
        <div
          className="progress__bar"
          style={{ width: total === 0 ? '30%' : `${(done / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** What the last import could not take, file by file; not modal, and dismissible. */
function ImportFailures() {
  const failures = useTray((s) => s.failures);
  if (failures.length === 0) return null;
  const whole = failures.length === 1 && failures[0]?.name === null;
  return (
    <aside className="import-notice" role="alert">
      <div className="import-notice-body">
        <p className="import-notice-title">
          {whole ? fr.photos.importFailed : fr.photos.failedTitle(failures.length)}
        </p>
        {!whole && (
          <>
            <ul className="import-notice-list">
              {failures.map((f, i) => (
                <li key={i}>{fr.photos.failedLine(f.name ?? '', f.reason)}</li>
              ))}
            </ul>
            <p className="import-notice-hint">{fr.photos.failedRest}</p>
          </>
        )}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.photos.dismiss}
        title={fr.photos.dismiss}
        onClick={() => trayStore.getState().setFailures([])}
      >
        <Icon name="x" />
      </button>
    </aside>
  );
}

/**
 * Where an import stands, in the panel column whichever panel is open: the progress bar while it
 * runs, then the files it could not take. Imports start from the Photos panel, but also from a
 * drop of files on the page, and a bad file must be seen wherever the user is.
 */
export function ImportStatus() {
  // A notice about the previous album's files does not belong to the album opened now.
  useEffect(() => {
    trayStore.getState().setFailures([]);
  }, []);
  return (
    <>
      <ImportProgress />
      <ImportFailures />
    </>
  );
}
