import { useEffect, useState } from 'react';
import type { StickerSetInfo } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { FilterBar } from './FilterBar';
import { StickerResults } from './StickerResults';
import { NO_FILTERS, type Filters } from './model';
import { useOnlineSearch } from './useOnlineSearch';

const t = fr.stickers;

/** Debounce of the offline search box: the packs answer locally, so a short wait is enough. */
const OFFLINE_DEBOUNCE_MS = 200;

/** "Bibliothèque": the sticker sets that ship with the app, by collection and category, offline. */
export function LibraryTab() {
  const [sets, setSets] = useState<StickerSetInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [set, setSet] = useState('');
  const [loaded, setLoaded] = useState<{
    set: string;
    list: { name: string; count: number }[];
  } | null>(null);
  const [category, setCategory] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  useEffect(() => {
    let live = true;
    window.tb.library.stickers.sets().then(
      (list) => {
        if (live) setSets(list);
      },
      (error: unknown) => {
        console.error('Sticker sets failed', error);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (set === '') return;
    let live = true;
    window.tb.library.stickers.categories(set).then(
      (list) => {
        if (live) setLoaded({ set, list });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [set]);
  const categories = set !== '' && loaded?.set === set ? loaded.list : [];

  // The colour filter and "sans attribution" are the packs' own: the pages stay full.
  const key = `offline|${set}|${category}|${filters.mono}|${filters.noAttribution}`;
  const search = useOnlineSearch(
    failed ? undefined : key,
    (q, page) =>
      window.tb.library.stickers.search({
        source: 'offline',
        q,
        page,
        ...(set !== '' ? { set } : {}),
        ...(category !== '' ? { category } : {}),
        ...(filters.mono !== 'all' ? { mono: filters.mono === 'mono' } : {}),
        ...(filters.noAttribution ? { noAttribution: true } : {}),
      }),
    { allowEmpty: true, debounceMs: OFFLINE_DEBOUNCE_MS },
  );

  if (failed) {
    return (
      <p className="stk-state stk-state--error" role="alert">
        {t.unavailable}
      </p>
    );
  }

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
        <label className="stk-select">
          <span className="stk-select__label">{t.set}</span>
          <select
            className="input"
            value={set}
            onChange={(e) => {
              setSet(e.target.value);
              setCategory('');
            }}
          >
            <option value="">{t.allSets}</option>
            {(sets ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {set !== '' && categories.length > 0 && (
          <label className="stk-select">
            <span className="stk-select__label">{t.category}</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t.allCategories}</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <FilterBar filters={filters} onChange={setFilters} />
      </div>
      <StickerResults search={search} filters={NO_FILTERS} empty={t.empty} idle={t.empty} />
    </div>
  );
}
