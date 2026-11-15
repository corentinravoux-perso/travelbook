import { useId, useRef, useState, type ReactNode } from 'react';
import { parseField } from './parseField';

// The small controls an inspector is made of: a titled section, a number field, a slider, a
// colour input, a pressed-or-not button. They hold no document logic: the caller applies changes.

/** A titled block of the inspector, set off from the next by a hairline. */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="insp-sec">
      {title !== undefined && <h3 className="insp-sec__title">{title}</h3>}
      {children}
    </section>
  );
}

/** `12.5` as the French user writes it: `12,5`. */
export const formatNumber = (value: number): string => String(value).replace('.', ',');

/**
 * A number in a field with its unit. The text is kept as typed until Enter or the end of editing,
 * then parsed (a comma is a decimal mark) and handed to `onCommit` if it is within range;
 * otherwise the field goes back to the value. Escape drops the edit.
 */
export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const invalid = draft !== null && parseField(draft, min, max) === null;

  const finish = () => {
    if (draft === null) return;
    const parsed = parseField(draft, min, max);
    setDraft(null);
    if (parsed !== null && parsed !== value) onCommit(parsed);
  };

  return (
    <div className="insp-field">
      <label className="insp-field__label" htmlFor={id}>
        {label}
      </label>
      <span className="insp-field__box">
        <input
          id={id}
          className="insp-field__input"
          inputMode="decimal"
          value={draft ?? formatNumber(value)}
          aria-invalid={invalid || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
        {unit !== undefined && <span className="insp-field__unit">{unit}</span>}
      </span>
    </div>
  );
}

let gestures = 0;

/**
 * A slider with its label and value. A drag, or the keys held on it, is one gesture: `onChange`
 * receives a merge key that stays the same through the gesture, so the editor records one undo
 * step for it.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange(value: number, gesture: string): void;
}) {
  const id = useId();
  const gesture = useRef('');
  const begin = () => {
    gesture.current = `slider:${++gestures}`;
  };
  const key = () => {
    if (gesture.current === '') begin();
    return gesture.current;
  };
  return (
    <div className="insp-slider">
      <label className="insp-slider__label" htmlFor={id}>
        {label}
      </label>
      <output className="insp-slider__value" htmlFor={id}>
        {display}
      </output>
      <input
        id={id}
        type="range"
        className="insp-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={begin}
        onFocus={begin}
        onChange={(e) => onChange(Number(e.target.value), key())}
      />
    </div>
  );
}

/** The system colour input, with its label. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(hex: string, gesture: string): void;
}) {
  const id = useId();
  const gesture = useRef('');
  return (
    <div className="insp-field">
      <label className="insp-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="color"
        className="insp-color"
        value={value}
        onPointerDown={() => {
          gesture.current = `color:${++gestures}`;
        }}
        onChange={(e) => onChange(e.target.value, gesture.current || `color:${++gestures}`)}
      />
    </div>
  );
}
