import { MM_TO_PX, spreadSize, type Book, type Spread } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SnapshotInfo } from '../../shared/api';
import { editorStore } from '../store/editor';
import { useProject } from '../store/project';
import { fr } from '../strings/fr';
import { assetUrl } from './assetUrl';
import { spreadName } from './pages';
import './HistoryPanel.css';
import { useMapGeometryLookup } from '../maps/geometryCache';

const t = fr.history;

const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** "14 novembre 2026 à 10:30": a snapshot's time as the tab and the dialog show it. */
export const formatWhen = (iso: string): string => WHEN.format(new Date(iso));

/** Height of the preview of a spread in the dialog, in screen px. */
const PREVIEW_HEIGHT = 320;

type Loaded =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: SnapshotInfo[] };

/** A snapshot, loaded once the dialog opens: its book, or the fact that it could not be read. */
type Snapshot = { status: 'loading' } | { status: 'error' } | { status: 'ready'; book: Book };

/** One spread of a snapshot, drawn by the single renderer at the size of the dialog. */
function SnapshotSpread({ book, spread }: { book: Book; spread: Spread }) {
  const mapGeometry = useMapGeometryLookup();
  const size = spreadSize(book, spread);
  const scale = PREVIEW_HEIGHT / (size.h * MM_TO_PX);
  return (
    <div
      className="history-preview__page"
      style={{ width: size.w * MM_TO_PX * scale, height: PREVIEW_HEIGHT }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <SpreadView
          book={book}
          spread={spread}
          quality="preview"
          assetUrl={assetUrl}
          mapGeometry={mapGeometry}
        />
      </div>
    </div>
  );
}

/**
 * A snapshot in a modal: a read-only look at its spreads, and the restore with a confirmation
 * step of its own (no system dialog). Restoring is one `store.apply`, so Annuler brings the
 * current book back. `confirming` opens straight on the confirmation.
 */
function SnapshotDialog({
  info,
  confirming,
  onClose,
}: {
  info: SnapshotInfo;
  confirming: boolean;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading' });
  const [asking, setAsking] = useState(confirming);
  const [index, setIndex] = useState(0);
  const when = formatWhen(info.at);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    let cancelled = false;
    window.tb.project.readSnapshot(info.id).then(
      (book) => !cancelled && setSnapshot({ status: 'ready', book }),
      () => !cancelled && setSnapshot({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [info.id]);

  const book = snapshot.status === 'ready' ? snapshot.book : null;
  const spreads = book ? [book.cover, ...book.spreads] : [];
  const spread = spreads[Math.min(index, spreads.length - 1)];

  const restore = () => {
    if (!book) return;
    editorStore.getState().apply(() => book, t.undoRestore(when));
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="dialog history-dialog"
      aria-labelledby="history-dialog-title"
      onClose={onClose}
    >
      <div className="dialog__form">
        <h2 id="history-dialog-title" className="dialog__title">
          {t.previewTitle(when)}
        </h2>
        {snapshot.status === 'error' && <p className="dialog__error">{t.previewFailed}</p>}
        {book && spread && !asking && (
          <>
            <p className="history-preview__caption">
              {spreadName(book, spread)} · {t.readOnly}
            </p>
            <div className="history-preview" data-testid="history-preview">
              <SnapshotSpread key={spread.id} book={book} spread={spread} />
            </div>
            <div className="history-preview__nav">
              <button
                type="button"
                className="button button--small"
                disabled={index <= 0}
                onClick={() => setIndex(index - 1)}
              >
                {t.previous}
              </button>
              <button
                type="button"
                className="button button--small"
                disabled={index >= spreads.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                {t.next}
              </button>
            </div>
          </>
        )}
        {asking && (
          <div role="alert" className="history-confirm">
            <p className="history-confirm__question">{t.confirm}</p>
            <p className="history-confirm__help">{t.confirmHelp}</p>
          </div>
        )}
        <div className="dialog__actions">
          {asking ? (
            <>
              <button type="button" className="button" onClick={() => ref.current?.close()}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={book === null}
                onClick={restore}
              >
                {t.confirmRestore}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button" onClick={() => ref.current?.close()}>
                {t.close}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={book === null}
                onClick={() => setAsking(true)}
              >
                {t.restore}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * The History tab: the snapshots of the project, newest first, each with its date, how it was
 * taken, and its page count. "Voir" shows the book as it was; "Restaurer" asks, then replaces the
 * book as an undoable change.
 */
export function HistoryPanel() {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [open, setOpen] = useState<{ info: SnapshotInfo; confirming: boolean } | null>(null);
  // Ctrl+S writes a snapshot while the tab is open: the list follows.
  const note = useProject((s) => s.snapshotNote);

  const load = useCallback(() => {
    window.tb.project.listSnapshots().then(
      (list) =>
        setLoaded({
          status: 'ready',
          list: [...list].sort((a, b) => b.at.localeCompare(a.at)),
        }),
      () => setLoaded({ status: 'error' }),
    );
  }, []);
  useEffect(() => {
    if (note === 'failed') return;
    load();
  }, [load, note]);

  return (
    <div className="history" data-testid="history">
      <h3 className="history__title">{t.title}</h3>
      {loaded.status === 'error' && (
        <div className="history__message">
          <p role="alert">{t.loadFailed}</p>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              setLoaded({ status: 'loading' });
              load();
            }}
          >
            {t.retry}
          </button>
        </div>
      )}
      {loaded.status === 'ready' && loaded.list.length === 0 && (
        <p className="shell-empty">{t.empty}</p>
      )}
      {loaded.status === 'ready' && loaded.list.length > 0 && (
        <ul className="history__list">
          {loaded.list.map((info) => (
            <li key={info.id} className="snapshot" data-snapshot={info.id}>
              <div className="snapshot__text">
                <span className="snapshot__when">{formatWhen(info.at)}</span>
                <span className="snapshot__meta">
                  {t[info.label]} · {t.pages(info.pages)}
                </span>
              </div>
              <button
                type="button"
                className="button button--small"
                onClick={() => setOpen({ info, confirming: false })}
              >
                {t.view}
              </button>
              <button
                type="button"
                className="button button--small"
                onClick={() => setOpen({ info, confirming: true })}
              >
                {t.restore}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <SnapshotDialog
          key={`${open.info.id}:${open.confirming}`}
          info={open.info}
          confirming={open.confirming}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
