import { fr } from '../../strings/fr';
import type { Filters } from './model';

const t = fr.stickers;

const COLOURS: [Filters['mono'], string][] = [
  ['all', t.colourAll],
  ['colour', t.colourColour],
  ['mono', t.colourMono],
];

/** The two filters of the sticker tabs: colour or monochrome, and "sans attribution". */
export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange(next: Filters): void;
}) {
  return (
    <div className="stk-filters">
      <div className="seg" role="group" aria-label={t.colourFilter}>
        {COLOURS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filters.mono === key}
            onClick={() => onChange({ ...filters, mono: key })}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="insp-check" title={t.noAttributionHelp}>
        <input
          type="checkbox"
          checked={filters.noAttribution}
          onChange={(e) => onChange({ ...filters, noAttribution: e.target.checked })}
        />
        {t.noAttribution}
      </label>
    </div>
  );
}
