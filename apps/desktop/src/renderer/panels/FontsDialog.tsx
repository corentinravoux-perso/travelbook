import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { CatalogueEntry, FontFamily } from '../../shared/api';
import { droppedPaths } from '../editor/photoImport';
import { fontListStore } from '../fonts/fontList';
import { fr } from '../strings/fr';
import { sourceMessage, SEARCH_DEBOUNCE_MS } from './stickers/model';

const t = fr.fonts;

type Search =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; results: CatalogueEntry[] }
  | { state: 'error'; message: string };

/**
 * "Plus de polices": search the Fontsource catalogue (400 ms after typing), add a family to the
 * user library, or import a TTF, OTF or WOFF2 file (a dialog, or a file dropped here). Main does
 * every download; the page only sees the answers. Once a family is added it is in the font list.
 */
export function FontsDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<{ of: string; search: Search } | null>(null);
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // The result on screen is the one of the text now in the box; between a keystroke and the
  // answer the search is pending.
  const query = text.trim();
  const search: Search =
    query === '' ? { state: 'idle' } : answer?.of === query ? answer.search : { state: 'loading' };

  useEffect(() => {
    if (query === '') return;
    let live = true;
    const timer = setTimeout(() => {
      window.tb.library.fonts.searchCatalogue(query).then(
        (results) => {
          if (live) setAnswer({ of: query, search: { state: 'done', results } });
        },
        (error: unknown) => {
          console.error('Font search failed', error);
          if (live)
            setAnswer({ of: query, search: { state: 'error', message: sourceMessage(error) } });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const done = (family: FontFamily): void => {
    void fontListStore.getState().refresh();
    setNote({ kind: 'ok', text: t.imported(family.family) });
  };

  const add = (entry: CatalogueEntry): void => {
    setNote(null);
    setAdding((old) => new Set(old).add(entry.id));
    window.tb.library.fonts
      .addFromCatalogue(entry.id)
      .then((family) => {
        setAdded((old) => new Set(old).add(entry.id));
        done(family);
      })
      .catch((error: unknown) => {
        console.error('Adding a font failed', error);
        setNote({ kind: 'error', text: `${t.addFailed} ${sourceMessage(error)}` });
      })
      .finally(() =>
        setAdding((old) => {
          const copy = new Set(old);
          copy.delete(entry.id);
          return copy;
        }),
      );
  };

  const importPath = (path: string): Promise<void> =>
    window.tb.library.fonts.importFile(path).then(done, (error: unknown) => {
      console.error('Importing a font failed', error);
      setNote({ kind: 'error', text: t.importFailed });
    });

  const pickFile = (): void => {
    setNote(null);
    window.tb.library.fonts
      .pickFile()
      .then((path) => (path === null ? undefined : importPath(path)))
      .catch((error: unknown) => console.error('Font dialog failed', error));
  };

  const onDrop = (e: DragEvent): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setOver(false);
    setNote(null);
    const paths = droppedPaths(e.dataTransfer.files, (file) => window.tb.photos.pathForFile(file));
    void paths.reduce((chain, path) => chain.then(() => importPath(path)), Promise.resolve());
  };

  return (
    <dialog
      ref={ref}
      className="dialog dialog--scroll"
      aria-labelledby="fonts-title"
      onClose={onClose}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div
        className={
          over ? 'dialog__form fonts-dialog fonts-dialog--over' : 'dialog__form fonts-dialog'
        }
      >
        <h2 id="fonts-title" className="dialog__title">
          {t.title}
        </h2>
        <p className="field__help">{t.intro}</p>

        <label className="field">
          <span className="field__label">{t.searchLabel}</span>
          <input
            className="input"
            type="search"
            placeholder={t.searchPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="fonts-results" aria-live="polite">
          {search.state === 'idle' && <p className="field__help">{t.idle}</p>}
          {search.state === 'loading' && <p className="field__help">{t.searching}</p>}
          {search.state === 'error' && <p className="field__help is-error">{search.message}</p>}
          {search.state === 'done' && search.results.length === 0 && (
            <p className="field__help">{t.noResult}</p>
          )}
          {search.state === 'done' && search.results.length > 0 && (
            <ul className="fonts-list">
              {search.results.map((entry) => (
                <li key={entry.id} data-font={entry.id}>
                  <span className="fonts-list__name">{entry.family}</span>
                  <span className="fonts-list__category">{fr.fonts.category[entry.category]}</span>
                  <button
                    type="button"
                    className="button button--small"
                    disabled={adding.has(entry.id) || added.has(entry.id)}
                    onClick={() => add(entry)}
                  >
                    {added.has(entry.id) ? t.added : adding.has(entry.id) ? t.adding : t.add}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fonts-import">
          <button type="button" className="button" onClick={pickFile}>
            {t.importFile}
          </button>
          <span className="field__help">{t.importHelp}</span>
        </div>

        {note !== null && (
          <p
            className={note.kind === 'error' ? 'field__help is-error' : 'field__help'}
            role="status"
          >
            {note.text}
          </p>
        )}

        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {t.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
