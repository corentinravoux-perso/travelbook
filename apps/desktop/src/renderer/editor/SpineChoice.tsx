import { pageCount, type Book } from '@travelbook/core';
import { useId, useState } from 'react';
import { fr } from '../strings/fr';

/** The spine widths the control accepts, mm (as the book settings). */
export const SPINE_RANGE = { min: 1, max: 100 } as const;

/**
 * A first guess for the spine of a bound book (hardcover, "format BD"): about 4 mm of boards and
 * glue plus 0.12 mm a page, to the half millimetre, never under 6 mm (room for a title). The
 * printer gives the true width; this only spares the user a blank field.
 */
export function suggestedSpineWidth(book: Book): number {
  const raw = 4 + pageCount(book) * 0.12;
  return Math.min(Math.max(Math.round(raw * 2) / 2, 6), 40);
}

/** The last width the user had this session, offered back when the spine is turned on again. */
let remembered: number | null = null;

/** The width "Avec tranche" restores: the user's last one this session, else the suggestion. */
export function spineWidthToRestore(book: Book): number {
  return remembered ?? suggestedSpineWidth(book);
}

/** For tests: forget the remembered width. */
export function forgetSpineWidth(): void {
  remembered = null;
}

const format = (mm: number): string => String(Math.round(mm * 10) / 10).replace('.', ',');

/** The width typed, in mm, or null when it is not a number inside `SPINE_RANGE`. */
export function parseSpineWidth(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n)) return null;
  if (n < SPINE_RANGE.min || n > SPINE_RANGE.max) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Whether the book has a spine, and how wide: "Avec tranche" (a bound book, BD format: the spine
 * sits between the back and the front) or "Sans tranche" (stapled or spiral: the back and the
 * front meet on the fold). `value` is the spine width in mm, 0 without a spine; `onChange` gets
 * the new width. The width field commits on Enter or when it loses focus, so typing makes one
 * change, not one per key.
 */
export function SpineChoice({
  book,
  value,
  onChange,
  compact = false,
}: {
  book: Book;
  value: number;
  onChange(width: number): void;
  /** The cover toolbar's one-line version: no help text. */
  compact?: boolean;
}) {
  const t = fr.spine;
  const id = useId();
  const [text, setText] = useState(format(value));
  const [invalid, setInvalid] = useState(false);
  // A width changed elsewhere (undo, the book settings) resets the field, during render.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(format(value));
    setInvalid(false);
  }
  const on = value > 0;

  const commit = (): void => {
    const n = parseSpineWidth(text);
    if (n === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    remembered = n;
    if (n !== value) onChange(n);
  };

  return (
    <div className={`spine-choice${compact ? ' spine-choice--compact' : ''}`}>
      {!compact && <span className="field__label">{t.label}</span>}
      <div className="spine-choice__row">
        <div className="seg" role="group" aria-label={t.label}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on) onChange(spineWidthToRestore(book));
            }}
          >
            {t.with}
          </button>
          <button
            type="button"
            aria-pressed={!on}
            onClick={() => {
              if (!on) return;
              remembered = value;
              onChange(0);
            }}
          >
            {t.without}
          </button>
        </div>
        {on && (
          <span className="spine-choice__width">
            <label htmlFor={id}>{t.width}</label>
            <input
              id={id}
              className="input"
              inputMode="decimal"
              aria-invalid={invalid}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
            />
            <span aria-hidden="true">mm</span>
          </span>
        )}
      </div>
      {invalid && (
        <p className="field__help is-error" role="alert">
          {t.invalid(SPINE_RANGE.min, SPINE_RANGE.max)}
        </p>
      )}
      {!compact && !invalid && <p className="field__help">{on ? t.helpWith : t.helpWithout}</p>}
    </div>
  );
}
