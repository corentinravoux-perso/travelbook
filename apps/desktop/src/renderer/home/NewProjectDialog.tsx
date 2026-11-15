import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CreateProjectOptions } from '../../shared/api';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { DEFAULT_FORMAT, FORMAT_PRESETS, matchPreset, parseSide } from './formats';

const CUSTOM = 'custom';
const LAST_FOLDER_KEY = 'travelbook.lastParentDir';

function readLastFolder(): string | null {
  try {
    return localStorage.getItem(LAST_FOLDER_KEY);
  } catch {
    return null;
  }
}

function writeLastFolder(dir: string): void {
  try {
    localStorage.setItem(LAST_FOLDER_KEY, dir);
  } catch {
    // The remembered folder is a convenience.
  }
}

function presetName(id: string): string {
  return fr.newBook.presets[id as keyof typeof fr.newBook.presets] ?? id;
}

/** A page outline drawn at the preset's proportions, inside a square box. */
function PageGlyph({ width, height }: { width: number; height: number }) {
  const longest = Math.max(width, height);
  return (
    <span className="format-glyph" aria-hidden="true">
      <span
        className="format-glyph__page"
        style={{ width: `${(width / longest) * 100}%`, height: `${(height / longest) * 100}%` }}
      />
    </span>
  );
}

interface Props {
  busy: boolean;
  failed: boolean;
  onSubmit(options: CreateProjectOptions & { parentDir: string }): void;
  onClose(): void;
}

/**
 * Title, folder and format of a new book (spec §8). A native modal dialog: the browser traps
 * focus, and Escape closes it.
 */
export function NewProjectDialog({ busy, failed, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<string | null>(readLastFolder);
  const [preset, setPreset] = useState<string>(DEFAULT_FORMAT.id);
  const [widthText, setWidthText] = useState(String(DEFAULT_FORMAT.width));
  const [heightText, setHeightText] = useState(String(DEFAULT_FORMAT.height));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const width = parseSide(widthText);
  const height = parseSide(heightText);
  const valid = title.trim() !== '' && folder !== null && width !== null && height !== null;

  const choosePreset = (id: string) => {
    setPreset(id);
    const found = FORMAT_PRESETS.find((p) => p.id === id);
    if (found) {
      setWidthText(String(found.width));
      setHeightText(String(found.height));
    }
  };
  const editSide = (side: 'width' | 'height', text: string) => {
    const w = side === 'width' ? parseSide(text) : width;
    const h = side === 'height' ? parseSide(text) : height;
    (side === 'width' ? setWidthText : setHeightText)(text);
    setPreset(w !== null && h !== null ? (matchPreset(w, h)?.id ?? CUSTOM) : CUSTOM);
  };

  const pickFolder = async () => {
    try {
      const picked = await window.tb.project.pickFolder();
      if (picked !== null) setFolder(picked);
    } catch (error) {
      console.warn('Could not pick a folder:', error);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    writeLastFolder(folder);
    onSubmit({
      name: title.trim(),
      parentDir: folder,
      format: { width, height },
    });
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="new-book-title" onClose={onClose}>
      <form className="dialog__form" onSubmit={submit}>
        <h2 id="new-book-title" className="dialog__title">
          {fr.newBook.title}
        </h2>

        <label className="field">
          <span className="field__label">{fr.newBook.titleField}</span>
          <input
            className="input"
            type="text"
            value={title}
            placeholder={fr.newBook.titlePlaceholder}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label" id="new-book-folder-label">
            {fr.newBook.folderField}
          </span>
          <div className="folder-row">
            <span
              className={folder === null ? 'folder-row__path is-empty' : 'folder-row__path'}
              aria-labelledby="new-book-folder-label"
              title={folder ?? undefined}
            >
              {folder ?? fr.newBook.folderEmpty}
            </span>
            <button type="button" className="button" onClick={() => void pickFolder()}>
              <Icon name="folder-open" />
              {fr.newBook.chooseFolder}
            </button>
          </div>
          <span className="field__help">{fr.newBook.folderHelp}</span>
        </div>

        <fieldset className="field formats">
          <legend className="field__label">{fr.newBook.formatField}</legend>
          <div className="formats__grid">
            {FORMAT_PRESETS.map((p) => (
              <label key={p.id} className="format-option">
                <input
                  type="radio"
                  name="format"
                  checked={preset === p.id}
                  onChange={() => choosePreset(p.id)}
                />
                <PageGlyph width={p.width} height={p.height} />
                <span className="format-option__name">{presetName(p.id)}</span>
                <span className="format-option__size">
                  {p.width} × {p.height}
                </span>
              </label>
            ))}
            <label className="format-option">
              <input
                type="radio"
                name="format"
                checked={preset === CUSTOM}
                onChange={() => choosePreset(CUSTOM)}
              />
              <PageGlyph width={width ?? 3} height={height ?? 4} />
              <span className="format-option__name">{fr.newBook.custom}</span>
            </label>
          </div>
          <div className="size-row">
            <label className="field">
              <span className="field__label">{fr.newBook.width}</span>
              <span className="input-unit">
                <input
                  className="input"
                  inputMode="decimal"
                  value={widthText}
                  aria-invalid={width === null}
                  onChange={(e) => editSide('width', e.target.value)}
                />
                <span className="input-unit__unit">{fr.newBook.unit}</span>
              </span>
            </label>
            <label className="field">
              <span className="field__label">{fr.newBook.height}</span>
              <span className="input-unit">
                <input
                  className="input"
                  inputMode="decimal"
                  value={heightText}
                  aria-invalid={height === null}
                  onChange={(e) => editSide('height', e.target.value)}
                />
                <span className="input-unit__unit">{fr.newBook.unit}</span>
              </span>
            </label>
            <span
              className={width === null || height === null ? 'field__help is-error' : 'field__help'}
            >
              {fr.newBook.sizeHelp}
            </span>
          </div>
        </fieldset>

        {failed && (
          <p className="dialog__error" role="alert">
            {fr.home.createFailed}
          </p>
        )}

        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {fr.newBook.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={!valid || busy}>
            {fr.newBook.create}
          </button>
        </div>
      </form>
    </dialog>
  );
}
