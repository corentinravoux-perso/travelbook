import { setBookSettings, setFormat, type Book } from '@travelbook/core';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FORMAT_PRESETS, matchPreset } from '../home/formats';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import {
  PAGE_MULTIPLES,
  RANGES,
  parseNumber,
  settingsText,
  validate,
  type FieldName,
  type SettingsText,
} from './bookSettingsForm';

const CUSTOM = 'custom';

const presetName = (id: string): string =>
  fr.newBook.presets[id as keyof typeof fr.newBook.presets] ?? id;

interface NumberFieldProps {
  label: string;
  unit: string;
  value: string;
  invalid: boolean;
  help: string;
  onChange(value: string): void;
}

/** A labelled number input with its unit; the range help turns red when the value is refused. */
function NumberField({ label, unit, value, invalid, help, onChange }: NumberFieldProps) {
  const helpId = useId();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="input-unit">
        <input
          className="input"
          inputMode="decimal"
          value={value}
          aria-invalid={invalid}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="input-unit__unit">{unit}</span>
      </span>
      <span id={helpId} className={invalid ? 'field__help is-error' : 'field__help'}>
        {help}
      </span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="field settings-group">
      <legend>{title}</legend>
      <div className="settings-group__fields">{children}</div>
    </fieldset>
  );
}

/**
 * The book's format and print settings (spec §7.2, §8), one undo step on Apply. A native modal
 * dialog, like the new-book one. Changing the format can scale the content with it.
 */
export function BookSettings({ book, onClose }: { book: Book; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState<SettingsText>(() => settingsText(book));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const { values, invalid } = validate(t);
  const bad = (name: FieldName) => invalid.includes(name);
  const set = <K extends keyof SettingsText>(key: K, value: SettingsText[K]) =>
    setT((prev) => ({ ...prev, [key]: value }));

  const width = parseNumber(t.width, RANGES.side);
  const height = parseNumber(t.height, RANGES.side);
  const preset =
    width !== null && height !== null ? (matchPreset(width, height)?.id ?? CUSTOM) : CUSTOM;
  const formatChanged =
    values !== null &&
    (values.format.width !== book.format.width || values.format.height !== book.format.height);

  const choosePreset = (id: string) => {
    const found = FORMAT_PRESETS.find((p) => p.id === id);
    if (found)
      setT((prev) => ({ ...prev, width: String(found.width), height: String(found.height) }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (values === null) return;
    const { format, scaleContent, ...rest } = values;
    editorStore
      .getState()
      .apply(
        (b) => setBookSettings(formatChanged ? setFormat(b, format, scaleContent) : b, rest),
        fr.bookSettings.undo,
      );
    ref.current?.close();
  };

  const side = fr.bookSettings.sizeRange(RANGES.side.min, RANGES.side.max);
  const range = (r: { min: number; max: number }) => fr.bookSettings.sizeRange(r.min, r.max);

  return (
    <dialog
      ref={ref}
      className="dialog dialog--scroll"
      aria-labelledby="book-settings-title"
      onClose={onClose}
    >
      <form className="dialog__form" onSubmit={submit}>
        <h2 id="book-settings-title" className="dialog__title">
          {fr.bookSettings.title}
        </h2>

        <Group title={fr.bookSettings.format}>
          <label className="field settings-group__wide">
            <span className="field__label">{fr.bookSettings.preset}</span>
            <select className="input" value={preset} onChange={(e) => choosePreset(e.target.value)}>
              {FORMAT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetName(p.id)} ({p.width} × {p.height})
                </option>
              ))}
              <option value={CUSTOM}>{fr.bookSettings.custom}</option>
            </select>
          </label>
          <NumberField
            label={fr.bookSettings.width}
            unit={fr.bookSettings.mm}
            value={t.width}
            invalid={bad('width')}
            help={side}
            onChange={(v) => set('width', v)}
          />
          <NumberField
            label={fr.bookSettings.height}
            unit={fr.bookSettings.mm}
            value={t.height}
            invalid={bad('height')}
            help={side}
            onChange={(v) => set('height', v)}
          />
          <label className="check settings-group__wide">
            <input
              type="checkbox"
              checked={t.scaleContent}
              disabled={!formatChanged}
              onChange={(e) => set('scaleContent', e.target.checked)}
            />
            <span>
              {fr.bookSettings.scaleContent}
              <span className="field__help">{fr.bookSettings.scaleHelp}</span>
            </span>
          </label>
        </Group>

        <Group title={fr.bookSettings.print}>
          <NumberField
            label={fr.bookSettings.bleed}
            unit={fr.bookSettings.mm}
            value={t.bleed}
            invalid={bad('bleed')}
            help={range(RANGES.bleed)}
            onChange={(v) => set('bleed', v)}
          />
          <NumberField
            label={fr.bookSettings.coverBleed}
            unit={fr.bookSettings.mm}
            value={t.coverBleed}
            invalid={bad('coverBleed')}
            help={range(RANGES.coverBleed)}
            onChange={(v) => set('coverBleed', v)}
          />
          <NumberField
            label={fr.bookSettings.safeMargin}
            unit={fr.bookSettings.mm}
            value={t.safeMargin}
            invalid={bad('safeMargin')}
            help={range(RANGES.safeMargin)}
            onChange={(v) => set('safeMargin', v)}
          />
          <NumberField
            label={fr.bookSettings.spineWidth}
            unit={fr.bookSettings.mm}
            value={t.spineWidth}
            invalid={bad('spineWidth')}
            help={range(RANGES.spineWidth)}
            onChange={(v) => set('spineWidth', v)}
          />
        </Group>

        <Group title={fr.bookSettings.pageRule}>
          <NumberField
            label={fr.bookSettings.pageMin}
            unit={fr.bookSettings.pages}
            value={t.pageMin}
            invalid={bad('pageMin')}
            help={fr.bookSettings.pagesRange(RANGES.pageMin.min, RANGES.pageMin.max)}
            onChange={(v) => set('pageMin', v)}
          />
          <label className="field">
            <span className="field__label">{fr.bookSettings.pageMultiple}</span>
            <select
              className="input"
              value={t.pageMultiple}
              onChange={(e) => set('pageMultiple', Number(e.target.value) as 1 | 2 | 4)}
            >
              {PAGE_MULTIPLES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </Group>

        <Group title={fr.bookSettings.quality}>
          <label className="check settings-group__wide">
            <input
              type="checkbox"
              checked={t.frenchTypography}
              onChange={(e) => set('frenchTypography', e.target.checked)}
            />
            <span>
              {fr.bookSettings.frenchTypography}
              <span className="field__help">{fr.bookSettings.frenchHelp}</span>
            </span>
          </label>
          <NumberField
            label={fr.bookSettings.dpiGood}
            unit={fr.bookSettings.dpi}
            value={t.dpiGood}
            invalid={bad('dpiGood')}
            help={
              bad('dpiGood') && parseNumber(t.dpiGood, RANGES.dpi) !== null
                ? fr.bookSettings.dpiOrder
                : fr.bookSettings.dpiRange(RANGES.dpi.min, RANGES.dpi.max)
            }
            onChange={(v) => set('dpiGood', v)}
          />
          <NumberField
            label={fr.bookSettings.dpiLow}
            unit={fr.bookSettings.dpi}
            value={t.dpiLow}
            invalid={bad('dpiLow')}
            help={fr.bookSettings.dpiRange(RANGES.dpi.min, RANGES.dpi.max)}
            onChange={(v) => set('dpiLow', v)}
          />
        </Group>

        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {fr.bookSettings.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={values === null}>
            {fr.bookSettings.apply}
          </button>
        </div>
      </form>
    </dialog>
  );
}
