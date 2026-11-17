import { normalizeStyle, type MapPreset, type MapStyle } from '@travelbook/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import {
  canApply,
  closeMapDialog,
  mapDialogStore,
  newMapBox,
  pickSubject,
  updateSpec,
  useMapDialog,
  type MapSpec,
} from './dialogModel';
import { applyMap } from './mapActions';
import { MapPreview, usePreviewGeometry } from './MapPreview';
import {
  MAPS_BASE,
  getSubject,
  loadSubjectIndex,
  searchSubjects,
  type SearchHit,
} from './subjects';
import './MapDialog.css';

const t = fr.maps;

/** The built-in presets, in the order of the chips (`resources/maps/presets/<id>.json`). */
const BUILT_IN = ['ardoise', 'safran', 'carnet', 'encre', 'crayon', 'pastel'] as const;

/** Used when the box of the map cannot be known: the page of an A4 album inside its margins. */
const FALLBACK_BOX = { w: 190, h: 277 };

/** The size the map will have: the box it is reopened in, or the page in view inset by the margin. */
function useMapBox(): { w: number; h: number } {
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const side = useEditor((s) => s.activePage);
  const target = useMapDialog((s) => s.target);
  if (!book) return FALLBACK_BOX;
  if (target) {
    const el = [book.cover, ...book.spreads]
      .find((s) => s.id === target.spreadId)
      ?.elements.find((e) => e.id === target.elementId);
    if (el) return { w: el.w, h: el.h };
  }
  const box = spreadId ? newMapBox(book, spreadId, side) : null;
  return box ? { w: box.w, h: box.h } : FALLBACK_BOX;
}

function SubjectSearch() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const listId = useId();
  useEffect(() => {
    let live = true;
    void loadSubjectIndex()
      .then((index) => live && setHits(searchSubjects(query, index)))
      .catch(() => live && setHits([]));
    return () => {
      live = false;
    };
  }, [query]);
  return (
    <div className="map-search">
      <input
        type="search"
        className="input"
        role="searchbox"
        aria-label={t.searchLabel}
        aria-controls={listId}
        placeholder={t.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && (
        <ul id={listId} className="map-search__hits" role="listbox" aria-label={t.searchLabel}>
          {hits.length === 0 && <li className="map-search__none">{t.noHit}</li>}
          {hits.map((hit) => (
            <li key={`${hit.subjectId}/${hit.regionId ?? ''}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="map-search__hit"
                aria-label={hit.name}
                onClick={() => {
                  setQuery('');
                  void pickSubject(hit.subjectId, hit.regionId);
                }}
              >
                {hit.name}
                {hit.parent && <span className="map-search__parent">{t.regionOf(hit.parent)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Thaïlande ▸ Phuket, Krabi", and the regions of the subject to choose from. */
function SubjectLine({ spec }: { spec: MapSpec }) {
  const subject = getSubject(spec.subject.id);
  const regions = subject?.regions ?? [];
  const chosen = new Set(spec.subject.regions);
  const names = regions.filter((r) => chosen.has(r.id)).map((r) => r.name);
  const toggle = (id: string) => {
    const next = chosen.has(id)
      ? spec.subject.regions.filter((r) => r !== id)
      : [...spec.subject.regions, id];
    void updateSpec({ subject: { ...spec.subject, regions: next } });
  };
  return (
    <div className="map-subject">
      <p className="map-subject__line">
        <strong>{subject?.name ?? spec.subject.id}</strong>
        {names.length > 0 && <span> ▸ {names.join(', ')}</span>}
      </p>
      {regions.length > 0 && (
        <details className="map-regions">
          <summary>{t.regionsChoose(chosen.size)}</summary>
          <ul className="map-regions__list" aria-label={t.regions}>
            {regions.map((r) => (
              <li key={r.id}>
                <label className="check">
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} />
                  {r.name}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The built-in styles, read once per dialog (`resources/maps/presets/<id>.json`). */
function useBuiltInStyles(): Record<string, MapStyle> {
  const [styles, setStyles] = useState<Record<string, MapStyle>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(
      BUILT_IN.map(async (id) => {
        try {
          const response = await fetch(`${MAPS_BASE}presets/${id}.json`);
          if (!response.ok) throw new Error(String(response.status));
          return [id, normalizeStyle(((await response.json()) as MapPreset).style)] as const;
        } catch (error) {
          console.error('Loading a map preset failed', error);
          return null;
        }
      }),
    ).then((list) => {
      if (live) setStyles(Object.fromEntries(list.filter((e) => e !== null)));
    });
    return () => {
      live = false;
    };
  }, []);
  return styles;
}

/**
 * The six built-in styles, then the user's own. A chip copies the style into the map; the chip
 * whose style equals the map's current one is pressed, none once it was edited.
 */
function Presets({ style }: { style: MapStyle | null }) {
  const [mine, setMine] = useState<MapPreset[]>([]);
  const builtIn = useBuiltInStyles();
  useEffect(() => {
    let live = true;
    window.tb.maps
      .listStyles()
      .then((list) => live && setMine(list))
      .catch(() => live && setMine([]));
    return () => {
      live = false;
    };
  }, []);
  const same = (candidate: unknown): boolean =>
    style !== null &&
    candidate !== undefined &&
    JSON.stringify(style) === JSON.stringify(normalizeStyle(candidate));
  return (
    <div className="map-chips" role="group" aria-label={t.presetsGroup}>
      {BUILT_IN.map((id) => (
        <button
          key={id}
          type="button"
          className="map-chip"
          aria-pressed={same(builtIn[id])}
          disabled={builtIn[id] === undefined}
          onClick={() => void updateSpec({ style: normalizeStyle(builtIn[id]) })}
        >
          {t.presetNames[id]}
        </button>
      ))}
      {mine.map((p) => (
        <button
          key={p.id}
          type="button"
          className="map-chip"
          aria-pressed={same(p.style)}
          onClick={() => void updateSpec({ style: normalizeStyle(p.style) })}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

/** The layers and the background. Off until a subject is picked. */
function Layers({ spec }: { spec: MapSpec | null }) {
  const flag = (key: 'showRegions' | 'showNeighbours' | 'includeRemote', label: string) => (
    <label className="check">
      <input
        type="checkbox"
        disabled={!spec}
        checked={spec?.subject[key] ?? false}
        onChange={(e) =>
          spec && void updateSpec({ subject: { ...spec.subject, [key]: e.target.checked } })
        }
      />
      {label}
    </label>
  );
  return (
    <fieldset className="map-layers">
      <legend>{t.layers}</legend>
      {flag('showRegions', t.layerRegions)}
      {flag('showNeighbours', t.layerNeighbours)}
      {flag('includeRemote', t.layerRemote)}
      <span className="map-layers__sep" />
      <legend className="map-layers__bg">{t.background}</legend>
      <label className="check">
        <input
          type="checkbox"
          disabled={!spec}
          checked={!spec || spec.background === null}
          onChange={(e) => void updateSpec({ background: e.target.checked ? null : '#ffffff' })}
        />
        {t.transparent}
      </label>
      {spec && spec.background !== null && (
        <input
          type="color"
          className="map-layers__color"
          aria-label={t.backgroundColor}
          value={spec.background}
          onChange={(e) => void updateSpec({ background: e.target.value })}
        />
      )}
    </fieldset>
  );
}

function MapForm() {
  const state = useMapDialog((s) => s);
  const { spec } = state;
  const box = useMapBox();
  const { geometry, busy, failed } = usePreviewGeometry(spec);
  const applying = state.status === 'applying';
  return (
    <div className="map-dialog">
      <header className="map-dialog__head">
        <h2 id="map-title" className="dialog__title">
          {state.target ? t.titleEdit : t.title}
        </h2>
        <SubjectSearch />
        {spec && <SubjectLine spec={spec} />}
        <Presets style={spec?.style ?? null} />
      </header>

      <div className="map-dialog__body">
        {spec ? (
          <>
            <figure className="map-dialog__preview">
              <MapPreview spec={spec} box={box} geometry={geometry} busy={busy} />
              <figcaption className="field__help">{t.previewHint}</figcaption>
            </figure>
            {failed && (
              <p className="dialog__error" role="alert">
                {t.bakeFailed}
              </p>
            )}
            {state.packFallback && (
              <p className="field__help map-dialog__fallback" role="status">
                {t.packFallback[state.packFallback]}
              </p>
            )}
          </>
        ) : (
          <p className="map-dialog__empty">{t.pickFirst}</p>
        )}
        <div className="map-dialog__options">
          <Layers spec={spec} />
          <button
            type="button"
            className="button"
            disabled={!spec || spec.frame === null}
            onClick={() => void updateSpec({ frame: null })}
          >
            {t.recenter}
          </button>
        </div>
      </div>

      {state.status === 'failed' && (
        <p className="dialog__error" role="alert">
          {t.applyFailed}
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={closeMapDialog}>
          {t.cancel}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!canApply(state)}
          onClick={() => void applyMap(mapDialogStore.getState())}
        >
          {applying ? t.placing : state.target ? t.update : t.place}
        </button>
      </div>
    </div>
  );
}

/** "Créer une carte": the map maker's dialog. Mounted once by the shell; `openMapDialog` opens it. */
export function MapDialog() {
  const open = useMapDialog((s) => s.open);
  const book = useEditor((s) => s.book);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, book]);

  if (!open || book === null) return null;
  return (
    <dialog
      ref={ref}
      className="dialog dialog--map"
      aria-labelledby="map-title"
      onClose={closeMapDialog}
      onCancel={(e) => {
        // Escape must not drop a map that is being placed: the apply goes on
        if (mapDialogStore.getState().status === 'applying') e.preventDefault();
      }}
    >
      <MapForm />
    </dialog>
  );
}
