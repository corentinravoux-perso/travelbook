import { useState } from 'react';

const parse = (text: string): number | null => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

interface Props {
  label: string;
  /** `null` (only with `nullable`): the field is empty. */
  value: number | null;
  min: number;
  max: number;
  step: number;
  /** An empty field is `null` instead of being ignored. */
  nullable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  onChange(value: number | null): void;
}

/**
 * A number typed in. While typing only a value that is valid and in range is emitted, and the
 * text is never rewritten from what the field itself emitted ("12" passes through "1", below
 * the minimum of 4). The comma of French decimals is accepted. On blur a value out of range is
 * clamped. The text follows the value only when it changed from outside (a preset, an undo).
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  nullable = false,
  placeholder,
  disabled,
  title,
  className = 'input',
  onChange,
}: Props) {
  const show = (v: number | null) => (v === null ? '' : String(v));
  const [text, setText] = useState(show(value));
  // the last value this field emitted (or was given): a different `value` came from outside
  const [known, setKnown] = useState(value);
  if (value !== known) {
    setKnown(value);
    setText(show(value));
  }
  const emit = (v: number | null) => {
    setKnown(v);
    onChange(v);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={label}
      title={title}
      placeholder={placeholder}
      disabled={disabled}
      data-min={min}
      data-max={max}
      data-step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n === null) {
          if (nullable && e.target.value.trim() === '') emit(null);
          return;
        }
        if (n >= min && n <= max) emit(n);
      }}
      onBlur={() => {
        const n = parse(text);
        if (n === null) {
          setText(show(known));
          return;
        }
        const clamped = Math.min(max, Math.max(min, n));
        setText(String(clamped));
        if (clamped !== known) emit(clamped);
      }}
    />
  );
}
