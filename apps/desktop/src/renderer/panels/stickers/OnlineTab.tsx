import { useEffect, useState } from 'react';
import type { StickerSourceInfo } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { FilterBar } from './FilterBar';
import { StickerResults } from './StickerResults';
import { NO_FILTERS, sourceMessage, type Filters } from './model';
import { useOnlineSearch } from './useOnlineSearch';

const t = fr.stickers;

/** "En ligne": Iconify, Openverse and Wikimedia Commons, asked by the app (400 ms after typing). */
export function OnlineTab() {
  const [sources, setSources] = useState<StickerSourceInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  useEffect(() => {
    let live = true;
    window.tb.library.stickers.sources().then(
      (list) => {
        if (!live) return;
        const mine = list.filter((s) => !s.backgrounds);
        setSources(mine);
        setSource((old) => old || mine[0]?.id || '');
      },
      (error: unknown) => {
        if (live) setLoadError(sourceMessage(error));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const search = useOnlineSearch(source === '' ? undefined : source, (q, page) =>
    window.tb.library.stickers.search({ source, q, page }),
  );

  return (
    <div className="stk-tab">
      <div className="stk-controls">
        <input
          className="input"
          type="search"
          aria-label={t.search}
          placeholder={t.searchPlaceholder}
          value={search.text}
          onChange={(e) => search.setText(e.target.value)}
        />
        {sources !== null && sources.length > 1 && (
          <div className="seg" role="group" aria-label={t.source}>
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={source === s.id}
                onClick={() => setSource(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <FilterBar filters={filters} onChange={setFilters} />
      </div>
      {loadError !== null ? (
        <p className="stk-state stk-state--error" role="alert">
          {loadError}
        </p>
      ) : (
        <StickerResults search={search} filters={filters} empty={t.empty} idle={t.emptyOnline} />
      )}
    </div>
  );
}
