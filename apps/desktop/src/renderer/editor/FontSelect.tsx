import { useEffect, useState } from 'react';
import type { FontCategory, FontFamily } from '../../shared/api';
import { firstFamily } from '../fonts/bookFonts';
import {
  albumOnlyFamilies,
  cssOf,
  familyNamed,
  fontListStore,
  useFontList,
} from '../fonts/fontList';
import { FontsDialog } from '../panels/FontsDialog';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';

const t = fr.fonts;
const CATEGORIES: FontCategory[] = ['manuscrite', 'serif', 'sans', 'titre', 'machine'];

interface Props {
  /** The stored font family (`'Lora', serif`). */
  value: string;
  /** What to store: the CSS font family. */
  onChange(css: string): void;
  id?: string;
  label: string;
  className?: string;
  /** Offer "Plus de polices…" (not in the toolbar over the canvas: a dialog would end the typing). */
  more?: boolean;
}

/**
 * The font picker: every family of the list, each name in its own face. The bundled ones come
 * first, by category, then the user's own, then the families only the album has. "Plus de
 * polices…" opens the catalogue and the file import.
 */
export function FontSelect({ value, onChange, id, label, className, more = false }: Props) {
  const families = useFontList((s) => s.families);
  const book = useEditor((s) => s.book);
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    void fontListStore.getState().load();
  }, []);

  const albumOnly = albumOnlyFamilies(book, families);
  const current = familyNamed([...families, ...albumOnly], value);
  const bundled = families.filter((f) => f.origin === 'bundled');
  const own = families.filter((f) => f.origin === 'library');

  const option = (f: FontFamily) => (
    <option key={f.family} value={cssOf(f)} style={{ fontFamily: cssOf(f) }}>
      {f.family}
    </option>
  );

  return (
    <>
      <select
        id={id}
        className={className}
        aria-label={id === undefined ? label : undefined}
        value={current === undefined ? '' : cssOf(current)}
        style={{ fontFamily: current === undefined ? undefined : cssOf(current) }}
        onChange={(e) => onChange(e.target.value)}
      >
        {current === undefined && (
          <option value="" disabled>
            {firstFamily(value) || t.other}
          </option>
        )}
        {CATEGORIES.map((category) => {
          const group = bundled.filter((f) => f.category === category);
          return group.length === 0 ? null : (
            <optgroup key={category} label={t.category[category]}>
              {group.map(option)}
            </optgroup>
          );
        })}
        {own.length > 0 && <optgroup label={t.groupOwn}>{own.map(option)}</optgroup>}
        {albumOnly.length > 0 && <optgroup label={t.groupAlbum}>{albumOnly.map(option)}</optgroup>}
      </select>
      {more && (
        <button
          type="button"
          className="button button--small font-more"
          onClick={() => setDialog(true)}
        >
          {t.more}
        </button>
      )}
      {dialog && <FontsDialog onClose={() => setDialog(false)} />}
    </>
  );
}
