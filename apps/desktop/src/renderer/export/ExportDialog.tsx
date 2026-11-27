import type { Book, PreflightIssue } from '@travelbook/core';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ExportPreset, ExportProgress, ExportReport } from '../../shared/api';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import {
  DPI_RANGE,
  QUALITY_CHOICES,
  applyPreset,
  exportablePages,
  isBlocking,
  locate,
  sameOptions,
  toOptions,
  type FieldName,
  type FormState,
  type IssueTarget,
  type Resolution,
} from './exportForm';
import { progressRatio } from './progress';
import './ExportDialog.css';

/** The folder of the last export, offered again next time (a convenience, never required). */
const FOLDER_KEY = 'travelbook.export.outDir';

const readFolder = (): string => {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
};
const writeFolder = (dir: string): void => {
  try {
    localStorage.setItem(FOLDER_KEY, dir);
  } catch {
    // Not remembered: the user picks the folder again.
  }
};

const DEFAULT_FORM: FormState = {
  route: 'pdf',
  rangeMode: 'all',
  from: '1',
  to: '1',
  includeCover: true,
  resolution: '300',
  freeDpi: '300',
  bleed: true,
  cropMarks: true,
  imageFormat: 'jpeg',
  jpegQuality: 98,
  perSpread: false,
  coverMode: 'flat',
  coverAsPages: false,
  outDir: '',
};

/** What main throws reads "Error invoking remote method 'export:run': Error: <message>". */
const messageOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );

/** Save the album, then check it: main checks the album as last saved. */
async function loadPreflight(): Promise<Preflight> {
  try {
    await editorStore.getState().flush();
    return { state: 'ready', issues: await window.tb.exporter.preflight() };
  } catch {
    return { state: 'failed' };
  }
}

type Preflight =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; issues: PreflightIssue[] };
type Phase = 'form' | 'saving' | 'running' | 'done';
type Notice = { kind: 'error' | 'info'; text: string };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="field settings-group">
      <legend>{title}</legend>
      <div className="settings-group__fields">{children}</div>
    </fieldset>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  invalid: boolean;
  help: string;
  unit?: string;
  onChange(value: string): void;
}

function TextField({ label, value, invalid, help, unit, onChange }: TextFieldProps) {
  const helpId = useId();
  const input = (
    <input
      className="input"
      inputMode="numeric"
      value={value}
      aria-invalid={invalid}
      aria-describedby={helpId}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {unit === undefined ? (
        input
      ) : (
        <span className="input-unit">
          {input}
          <span className="input-unit__unit">{unit}</span>
        </span>
      )}
      <span id={helpId} className={invalid ? 'field__help is-error' : 'field__help'}>
        {help}
      </span>
    </label>
  );
}

function issueText(
  book: Book,
  issue: PreflightIssue,
): { text: string; target: IssueTarget | null } {
  const where = locate(book, issue, {
    cover: fr.exporter.pageCover,
    page: fr.exporter.onePage,
    pages: fr.exporter.twoPages,
  });
  const t = fr.exporter;
  switch (issue.kind) {
    case 'lowResolution':
      return {
        text:
          where.place === null ? t.issueLowAnywhere(issue.dpi) : t.issueLow(where.place, issue.dpi),
        target: where.target,
      };
    case 'emptySlot':
      return {
        text: where.place === null ? t.issueEmptyAnywhere : t.issueEmpty(where.place),
        target: where.target,
      };
    case 'textOutsideSafe':
      return {
        text: where.place === null ? t.issueTextAnywhere : t.issueText(where.place),
        target: where.target,
      };
    case 'missingAsset':
      return {
        text: t.issueMissing(where.file ?? issue.assetId, where.place),
        target: where.target,
      };
    case 'missingMap':
      return {
        text: where.place === null ? t.issueMapAnywhere : t.issueMap(where.place),
        target: where.target,
      };
    case 'pageRule':
      return {
        text: t.issueRule(issue.pages, issue.rule.min, issue.rule.multiple),
        target: null,
      };
  }
}

function PreflightList({
  book,
  issues,
  onSee,
}: {
  book: Book;
  issues: PreflightIssue[];
  onSee(target: IssueTarget): void;
}) {
  if (issues.length === 0) return <p className="field__help">{fr.exporter.preflightClean}</p>;
  return (
    <ul className="preflight">
      {issues.map((issue, i) => {
        const { text, target } = issueText(book, issue);
        const blocking = isBlocking(issue);
        return (
          <li
            key={`${i}-${issue.kind}`}
            className={blocking ? 'preflight__item is-blocking' : 'preflight__item'}
          >
            <span
              className="preflight__icon"
              role="img"
              aria-label={blocking ? fr.exporter.blocking : fr.exporter.warning}
              title={blocking ? fr.exporter.blocking : fr.exporter.warning}
            >
              <Icon name="alert-triangle" />
            </span>
            <span className="preflight__text">{text}</span>
            {target !== null && (
              <button
                type="button"
                className="button button--small"
                aria-label={fr.exporter.seeLabel(text)}
                onClick={() => onSee(target)}
              >
                {fr.exporter.see}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The export dialog (spec §10): route, pages, resolution, bleed and marks, image format, cover,
 * destination, presets, the pre-flight list, then progress, cancel and the open-folder button at
 * the end. The export runs on the album as last saved by main, so the book is flushed to disk
 * first and an export never starts while the last save failed.
 */
export function ExportDialog({ book, onClose }: { book: Book; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(() => ({ ...DEFAULT_FORM, outDir: readFolder() }));
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight>({ state: 'loading' });
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const saveStatus = useEditor((s) => s.saveStatus);
  const cancelled = useRef(false);
  const busy = phase === 'saving' || phase === 'running';

  const pages = exportablePages(book);
  const parsed = useMemo(() => toOptions(form, pages), [form, pages]);
  const invalid: readonly FieldName[] = parsed.invalid;
  const bad = (name: FieldName) => invalid.includes(name);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const loadPresets = () =>
    window.tb.exporter.presets.list().then(
      (list) => setPresets(list),
      () => setNotice({ kind: 'error', text: fr.exporter.presetsFailed }),
    );
  useEffect(() => {
    void loadPresets();
  }, []);

  const refreshPreflight = (): Promise<void> => {
    setPreflight({ state: 'loading' });
    return loadPreflight().then(setPreflight);
  };
  useEffect(() => {
    // The state starts as `loading`.
    let live = true;
    void loadPreflight().then((next) => {
      if (live) setPreflight(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    return window.tb.exporter.onProgress(setProgress);
  }, [phase]);

  const issues = preflight.state === 'ready' ? preflight.issues : [];
  const blocked = issues.some(isBlocking);

  // The preset the fields match, if any: a built-in preset has no folder of its own.
  const current = parsed.options;
  const matching =
    current === null
      ? undefined
      : presets.find((p) => sameOptions(current, p.options, p.builtin !== true));
  const builtin = presets.filter((p) => p.builtin === true);
  const mine = presets.filter((p) => p.builtin !== true);

  const choosePreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (preset) setForm((prev) => applyPreset(preset.options, prev.outDir));
  };

  const trimmedName = (saveName ?? '').trim();
  const nameIsBuiltin = builtin.some(
    (p) => p.name.toLocaleLowerCase('fr') === trimmedName.toLocaleLowerCase('fr'),
  );
  const nameReplaces =
    !nameIsBuiltin &&
    mine.some((p) => p.name.toLocaleLowerCase('fr') === trimmedName.toLocaleLowerCase('fr'));

  const submitPreset = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsed.options === null || trimmedName === '' || nameIsBuiltin) return;
    try {
      await window.tb.exporter.presets.save(trimmedName, parsed.options);
      setSaveName(null);
      setNotice(null);
      await loadPresets();
    } catch {
      setNotice({ kind: 'error', text: fr.exporter.presetFailed });
    }
  };

  const deletePreset = async () => {
    if (!matching || matching.builtin === true) return;
    try {
      await window.tb.exporter.presets.delete(matching.name);
      await loadPresets();
    } catch {
      setNotice({ kind: 'error', text: fr.exporter.presetDeleteFailed });
    }
  };

  const pickFolder = async () => {
    const dir = await window.tb.project.pickFolder();
    if (dir !== null) set('outDir', dir);
  };

  const see = (target: IssueTarget) => {
    const editor = editorStore.getState();
    editor.goToSpread(target.spreadId);
    editor.select([target.elementId]);
    ref.current?.close();
  };

  const start = async () => {
    if (parsed.options === null || blocked || busy) return;
    const options = parsed.options;
    setNotice(null);
    setReport(null);
    setProgress(null);
    cancelled.current = false;
    setCancelling(false);
    setPhase('saving');
    try {
      // The export reads the album main has saved: a failed save must stop it.
      await editorStore.getState().flush();
      if (editorStore.getState().saveStatus === 'error') throw new Error('save');
    } catch {
      setNotice({ kind: 'error', text: fr.exporter.saveFailed });
      setPhase('form');
      return;
    }
    setPhase('running');
    try {
      const result = await window.tb.exporter.run(options);
      writeFolder(options.outDir);
      setReport(result);
      setPreflight({ state: 'ready', issues: result.warnings });
      setPhase('done');
    } catch (error) {
      setNotice(
        cancelled.current
          ? { kind: 'info', text: fr.exporter.cancelled }
          : { kind: 'error', text: `${fr.exporter.failed} ${messageOf(error)}` },
      );
      setPhase('form');
      void refreshPreflight();
    }
  };

  const cancel = () => {
    cancelled.current = true;
    setCancelling(true);
    void window.tb.exporter.cancel().catch(() => undefined);
  };

  const reveal = () => {
    window.tb.exporter
      .reveal()
      .catch(() => setNotice({ kind: 'error', text: fr.exporter.revealFailed }));
  };

  const ratio = progress === null ? 0 : progressRatio(progress);
  const isPdf = form.route === 'pdf';
  const isImages = form.route === 'images';
  const freeShown = form.resolution === 'free';
  const canStart = parsed.options !== null && !blocked && !busy;

  return (
    <dialog
      ref={ref}
      className="dialog dialog--scroll dialog--export"
      aria-labelledby="export-title"
      onClose={onClose}
      onCancel={(e) => {
        // Escape must not drop an export on the floor: the button cancels it.
        if (busy) e.preventDefault();
      }}
    >
      <form
        className="dialog__form"
        onKeyDown={(e) => {
          // Enter in a field must not start an export: only the button does.
          if (
            e.key === 'Enter' &&
            e.target instanceof HTMLInputElement &&
            e.target.type === 'text'
          ) {
            e.preventDefault();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <h2 id="export-title" className="dialog__title">
          {fr.exporter.title}
        </h2>

        <fieldset className="export-body" disabled={busy}>
          <div className="export-presets">
            <label className="field export-presets__select">
              <span className="field__label">{fr.exporter.preset}</span>
              <select
                className="input"
                aria-label={fr.exporter.preset}
                value={matching?.name ?? ''}
                onChange={(e) => choosePreset(e.target.value)}
              >
                {matching === undefined && <option value="">{fr.exporter.presetCustom}</option>}
                <optgroup label={fr.exporter.presetBuiltin}>
                  {builtin.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                {mine.length > 0 && (
                  <optgroup label={fr.exporter.presetMine}>
                    {mine.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <button
              type="button"
              className="button"
              disabled={parsed.options === null}
              onClick={() => setSaveName(saveName === null ? '' : null)}
              aria-expanded={saveName !== null}
            >
              {fr.exporter.presetSave}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={fr.exporter.presetDelete}
              title={fr.exporter.presetDelete}
              disabled={matching === undefined || matching.builtin === true}
              onClick={() => void deletePreset()}
            >
              <Icon name="trash" />
            </button>
          </div>
          {saveName !== null && (
            <div className="export-presets__save" role="group" aria-label={fr.exporter.presetSave}>
              <label className="field">
                <span className="field__label">{fr.exporter.presetName}</span>
                <input
                  className="input"
                  value={saveName}
                  maxLength={200}
                  autoFocus
                  aria-invalid={nameIsBuiltin}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitPreset(e);
                  }}
                />
                <span className={nameIsBuiltin ? 'field__help is-error' : 'field__help'}>
                  {nameIsBuiltin
                    ? fr.exporter.presetNameTaken
                    : nameReplaces
                      ? fr.exporter.presetReplace
                      : ''}
                </span>
              </label>
              <button
                type="button"
                className="button"
                disabled={trimmedName === '' || nameIsBuiltin}
                onClick={(e) => void submitPreset(e)}
              >
                {fr.exporter.presetSaveConfirm}
              </button>
            </div>
          )}

          <Group title={fr.exporter.route}>
            <div className="settings-group__wide seg" role="group" aria-label={fr.exporter.route}>
              <button type="button" aria-pressed={isPdf} onClick={() => set('route', 'pdf')}>
                {fr.exporter.routePdf}
              </button>
              <button type="button" aria-pressed={isImages} onClick={() => set('route', 'images')}>
                {fr.exporter.routeImages}
              </button>
            </div>
          </Group>

          <Group title={fr.exporter.pages}>
            <label className="field settings-group__wide">
              <span className="field__label">{fr.exporter.pages}</span>
              <select
                className="input"
                aria-label={fr.exporter.pages}
                value={form.rangeMode}
                onChange={(e) => set('rangeMode', e.target.value as FormState['rangeMode'])}
              >
                <option value="all">{fr.exporter.pagesAll}</option>
                <option value="range">{fr.exporter.pagesRange}</option>
              </select>
            </label>
            {form.rangeMode === 'range' && (
              <>
                <TextField
                  label={fr.exporter.pagesFrom}
                  value={form.from}
                  invalid={bad('from')}
                  help={bad('from') ? fr.exporter.pageInvalid(pages) : fr.exporter.pagesHelp(pages)}
                  onChange={(v) => set('from', v)}
                />
                <TextField
                  label={fr.exporter.pagesTo}
                  value={form.to}
                  invalid={bad('to')}
                  help={bad('to') ? fr.exporter.pageInvalid(pages) : fr.exporter.pagesHelp(pages)}
                  onChange={(v) => set('to', v)}
                />
              </>
            )}
            <label className="check settings-group__wide">
              <input
                type="checkbox"
                checked={form.includeCover}
                onChange={(e) => set('includeCover', e.target.checked)}
              />
              <span>{fr.exporter.includeCover}</span>
            </label>
            {isPdf && (
              <label className="check settings-group__wide">
                <input
                  type="checkbox"
                  checked={form.coverAsPages}
                  disabled={!form.includeCover}
                  onChange={(e) => set('coverAsPages', e.target.checked)}
                />
                <span>
                  {fr.exporter.coverAsPages}
                  <span className="field__help">{fr.exporter.coverAsPagesHelp}</span>
                </span>
              </label>
            )}
          </Group>

          <Group title={fr.exporter.resolution}>
            <label className="field">
              <span className="field__label">{fr.exporter.resolution}</span>
              <select
                className="input"
                aria-label={fr.exporter.resolution}
                value={form.resolution}
                onChange={(e) => set('resolution', e.target.value as Resolution)}
              >
                <option value="150">{fr.exporter.res150}</option>
                <option value="300">{fr.exporter.res300}</option>
                <option value="600">{fr.exporter.res600}</option>
                <option value="free">{fr.exporter.resFree}</option>
                <option value="native">{fr.exporter.resNative}</option>
              </select>
              {form.resolution === 'native' && (
                <span className="field__help">{fr.exporter.resNativeHelp}</span>
              )}
            </label>
            {freeShown && (
              <TextField
                label={fr.exporter.resFreeLabel}
                unit={fr.exporter.dpi}
                value={form.freeDpi}
                invalid={bad('freeDpi')}
                help={fr.exporter.resFreeHelp(DPI_RANGE.min, DPI_RANGE.max)}
                onChange={(v) => set('freeDpi', v)}
              />
            )}
            <label className="check settings-group__wide">
              <input
                type="checkbox"
                checked={form.bleed}
                onChange={(e) => set('bleed', e.target.checked)}
              />
              <span>{fr.exporter.bleed}</span>
            </label>
            {isPdf && (
              <label className="check settings-group__wide">
                <input
                  type="checkbox"
                  checked={form.cropMarks}
                  onChange={(e) => set('cropMarks', e.target.checked)}
                />
                <span>
                  {fr.exporter.cropMarks}
                  <span className="field__help">{fr.exporter.cropMarksHelp}</span>
                </span>
              </label>
            )}
          </Group>

          <Group title={isImages ? fr.exporter.imageFormat : fr.exporter.perSpreadPdf}>
            {isImages && (
              <>
                <label className="field">
                  <span className="field__label">{fr.exporter.imageFormat}</span>
                  <select
                    className="input"
                    aria-label={fr.exporter.imageFormat}
                    value={form.imageFormat}
                    onChange={(e) => set('imageFormat', e.target.value as FormState['imageFormat'])}
                  >
                    <option value="jpeg">{fr.exporter.jpeg}</option>
                    <option value="png">{fr.exporter.png}</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{fr.exporter.quality}</span>
                  <select
                    className="input"
                    aria-label={fr.exporter.quality}
                    value={form.jpegQuality}
                    disabled={form.imageFormat !== 'jpeg'}
                    onChange={(e) => set('jpegQuality', Number(e.target.value))}
                  >
                    {QUALITY_CHOICES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="check settings-group__wide">
              <input
                type="checkbox"
                checked={form.perSpread}
                onChange={(e) => set('perSpread', e.target.checked)}
              />
              <span>{isImages ? fr.exporter.perSpread : fr.exporter.perSpreadPdf}</span>
            </label>
            {isImages && (
              <label className="field settings-group__wide">
                <span className="field__label">{fr.exporter.coverMode}</span>
                <select
                  className="input"
                  aria-label={fr.exporter.coverMode}
                  value={form.coverMode}
                  disabled={!form.includeCover}
                  onChange={(e) => set('coverMode', e.target.value as FormState['coverMode'])}
                >
                  <option value="flat">{fr.exporter.coverFlat}</option>
                  <option value="panels">{fr.exporter.coverPanels}</option>
                </select>
              </label>
            )}
          </Group>

          <Group title={fr.exporter.destination}>
            <div className="settings-group__wide">
              <div className="export-folder">
                <input
                  className="input"
                  aria-label={fr.exporter.destination}
                  aria-invalid={bad('outDir') && form.outDir !== ''}
                  value={form.outDir}
                  placeholder={fr.exporter.pathPlaceholder}
                  spellCheck={false}
                  onChange={(e) => set('outDir', e.target.value)}
                />
                <button type="button" className="button" onClick={() => void pickFolder()}>
                  <Icon name="folder-open" />
                  {fr.exporter.choose}
                </button>
              </div>
              <span className="field__help">{fr.exporter.pathHelp}</span>
            </div>
          </Group>

          <p className="export-note">{fr.exporter.colourNote}</p>

          <section className="export-preflight" aria-labelledby="export-preflight-title">
            <h3 id="export-preflight-title" className="export-preflight__title">
              {fr.exporter.preflight}
            </h3>
            {preflight.state === 'loading' && (
              <p className="field__help">{fr.exporter.preflightRunning}</p>
            )}
            {preflight.state === 'failed' && (
              <p className="field__help is-error">
                {fr.exporter.preflightFailed}{' '}
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => void refreshPreflight()}
                >
                  {fr.exporter.retry}
                </button>
              </p>
            )}
            {preflight.state === 'ready' && (
              <PreflightList book={book} issues={preflight.issues} onSee={see} />
            )}
          </section>
        </fieldset>

        {blocked && !busy && <p className="dialog__error">{fr.exporter.missingBlocks}</p>}
        {saveStatus === 'error' && !busy && notice === null && (
          <p className="dialog__error" role="alert">
            {fr.exporter.saveFailed}
          </p>
        )}
        {notice !== null && (
          <p className={notice.kind === 'error' ? 'dialog__error' : 'export-info'} role="alert">
            {notice.text}
          </p>
        )}

        {phase === 'saving' && <p className="field__help">{fr.exporter.saving}</p>}
        {phase === 'running' && (
          <div className="export-progress">
            <div className="import-progress-text">
              <span>
                {progress === null
                  ? fr.exporter.starting
                  : `${fr.exporter.progress(progress.page, progress.total)} · ${
                      fr.exporter.steps[progress.step as keyof typeof fr.exporter.steps] ??
                      progress.step
                    }`}
              </span>
              <span>{Math.round(ratio * 100)} %</span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-label={fr.exporter.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <div className="progress__bar" style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        )}
        {phase === 'done' && report !== null && (
          <div className="export-done" role="status">
            <p>
              {fr.exporter.done(report.pages, report.seconds)}{' '}
              {fr.exporter.files(report.files.length)}.
              {report.warnings.length > 0 && ` ${fr.exporter.warnings(report.warnings.length)}`}
            </p>
            <button type="button" className="button" onClick={reveal}>
              <Icon name="folder-open" />
              {fr.exporter.reveal}
            </button>
          </div>
        )}

        <div className="dialog__actions">
          {phase === 'running' ? (
            <button type="button" className="button" disabled={cancelling} onClick={cancel}>
              {cancelling ? fr.exporter.cancelling : fr.exporter.cancel}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button"
                disabled={phase === 'saving'}
                onClick={() => ref.current?.close()}
              >
                {fr.exporter.close}
              </button>
              <button type="submit" className="button button--primary" disabled={!canStart}>
                {phase === 'done' ? fr.exporter.again : fr.exporter.start}
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
