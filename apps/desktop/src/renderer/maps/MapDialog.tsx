import {
  normalizeStyle,
  templateLook,
  withTemplateLook,
  type MapGeometry,
  type MapPreset,
  type MapStyle,
} from '@travelbook/core';
import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import {
  canApply,
  closeMapDialog,
  mapDialogStore,
  newMapBox,
  beginEditGroup,
  endEditGroup,
  pickSubject,
  redoMapEdit,
  undoMapEdit,
  updateSpec,
  useMapDialog,
  type MapSpec,
} from './dialogModel';
import { applyMap } from './mapActions';
import { MapPreview, usePreviewGeometry } from './MapPreview';
import { PlacesPanel } from './PlacesPanel';
import { RoutePanel } from './RoutePanel';
import { StylePanel } from './StylePanel';
import { styleTemplatesStore, useStyleTemplates } from './styleTemplates';
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
 * The six built-in styles, then the user's own. A chip copies the template's look into the map
 * (`templateLook`: colours, fonts, marker shapes) and keeps the user's other choices (sizes,
 * widths, dashes, case, hand-drawn); the chip whose look equals the map's is pressed.
 */
function Presets({ style }: { style: MapStyle | null }) {
  const mine = useStyleTemplates((s) => s.mine);
  const builtIn = useBuiltInStyles();
  useEffect(() => {
    void styleTemplatesStore.getState().load();
  }, []);
  const same = (candidate: unknown): boolean =>
    style !== null &&
    candidate !== undefined &&
    JSON.stringify(templateLook(style)) === JSON.stringify(templateLook(normalizeStyle(candidate)));
  const apply = (template: unknown) => {
    const now = mapDialogStore.getState().spec?.style ?? null;
    void updateSpec({
      style: now ? withTemplateLook(now, template) : normalizeStyle(template),
    });
  };
  return (
    <div className="map-chips" role="group" aria-label={t.presetsGroup}>
      {BUILT_IN.map((id) => (
        <button
          key={id}
          type="button"
          className="map-chip"
          aria-pressed={same(builtIn[id])}
          disabled={builtIn[id] === undefined}
          onClick={() => apply(builtIn[id])}
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
          onClick={() => apply(p.style)}
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

type TabId = 'places' | 'route' | 'style';
const TABS: TabId[] = ['places', 'route', 'style'];

/**
 * A tab panel's content. While its tab stays hidden it is not drawn again (it keeps its state,
 * not every update): a drag on the preview would otherwise redraw the three panels at each move.
 * It catches up when its tab is shown.
 */
const TabContent = memo(
  function TabContent({ children }: { active: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (prev, next) => !prev.active && !next.active,
);

/**
 * The sections of the right column: a tablist (arrows, Home and End move; only the open tab is in
 * the tab order) with one tabpanel shown at a time. The other panels stay mounted, hidden, so a
 * search or an open list survives a switch. The preview next to it stays in view.
 */
function Sections({
  spec,
  geometry,
  box,
}: {
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
}) {
  const [tab, setTab] = useState<TabId>('places');
  const base = useId();
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({
    places: null,
    route: null,
    style: null,
  });
  const go = (id: TabId) => {
    setTab(id);
    refs.current[id]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    const next: Record<string, number> = {
      ArrowRight: (at + 1) % TABS.length,
      ArrowLeft: (at + TABS.length - 1) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const to = next[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(TABS[to]!);
  };
  return (
    <div className="map-sections">
      <div className="map-tabs" role="tablist" aria-label={t.tabs} onKeyDown={onKeyDown}>
        {TABS.map((id) => (
          <button
            key={id}
            ref={(node) => {
              refs.current[id] = node;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${base}-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className="map-tab"
            onClick={() => setTab(id)}
          >
            {t.tabNames[id]}
          </button>
        ))}
      </div>
      {TABS.map((id) => (
        <div
          key={id}
          className="map-tabpanel"
          role="tabpanel"
          id={`${base}-panel-${id}`}
          aria-labelledby={`${base}-tab-${id}`}
          hidden={tab !== id}
        >
          <TabContent active={tab === id}>
            {id === 'places' && <PlacesPanel spec={spec} geometry={geometry} box={box} />}
            {id === 'route' && <RoutePanel spec={spec} />}
            {id === 'style' && <StylePanel spec={spec} />}
          </TabContent>
        </div>
      ))}
    </div>
  );
}

function MapForm() {
  const state = useMapDialog((s) => s);
  const { spec } = state;
  const box = useMapBox();
  const { geometry, busy, failed } = usePreviewGeometry(spec);
  const applying = state.status === 'applying';
  // the preview enlarged: the search, the templates and the layers make room for it
  const [wide, setWide] = useState(false);
  const large = wide && spec !== null;
  return (
    <div className={large ? 'map-dialog map-dialog--wide' : 'map-dialog'}>
      <header className="map-dialog__head">
        <h2 id="map-title" className="dialog__title">
          {state.target ? t.titleEdit : t.title}
        </h2>
        {!large && (
          <>
            <SubjectSearch />
            {spec && <SubjectLine spec={spec} />}
            <Presets style={spec?.style ?? null} />
          </>
        )}
      </header>

      {spec ? (
        <div className="map-dialog__main">
          <div className="map-dialog__stage">
            <figure className="map-dialog__preview">
              <MapPreview spec={spec} box={box} geometry={geometry} busy={busy} />
              <figcaption className="map-dialog__caption">
                <span className="field__help">{t.previewHint}</span>
                <button
                  type="button"
                  className="button"
                  aria-pressed={large}
                  title={t.enlargeHint}
                  onClick={() => setWide(!large)}
                >
                  {large ? t.shrink : t.enlarge}
                </button>
              </figcaption>
            </figure>
            {failed && (
              <p className="dialog__error" role="alert">
                {t.bakeFailed}
              </p>
            )}
            {state.packLoading && (
              <p className="field__help map-dialog__fallback" role="status">
                {t.packLoading}
              </p>
            )}
            {!state.packLoading && state.packFallback && (
              <p className="field__help map-dialog__fallback" role="status">
                {t.packFallback[state.packFallback]}
              </p>
            )}
            {!large && (
              <div className="map-dialog__options">
                <Layers spec={spec} />
                <button
                  type="button"
                  className="button"
                  disabled={spec.frame === null}
                  onClick={() => void updateSpec({ frame: null })}
                >
                  {t.recenter}
                </button>
              </div>
            )}
          </div>
          <Sections spec={spec} geometry={geometry} box={box} />
        </div>
      ) : (
        <div className="map-dialog__main map-dialog__main--empty">
          <p className="map-dialog__empty">{t.pickFirst}</p>
          <div className="map-dialog__options">
            <Layers spec={null} />
            <button type="button" className="button" disabled>
              {t.recenter}
            </button>
          </div>
        </div>
      )}

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

/** Keys typed into these go to the field (its own undo), not to the dialog's history. */
const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password']);
function typesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}

/**
 * Ctrl+Z undoes the dialog's last edit, Ctrl+Maj+Z and Ctrl+Y redo it; the album behind is not
 * touched (the canvas shortcuts ignore keys from a dialog). In a text field the keys stay its own.
 */
function onDialogKeyDown(e: React.KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || typesText(e.target)) return;
  const key = e.key.toLowerCase();
  const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
  if (key !== 'z' && !redo) return;
  e.preventDefault();
  void (redo ? redoMapEdit() : undoMapEdit());
}

/**
 * A press in the dialog is one undo step until it is released (a drag, a slider, a click), and
 * so is the time a text field has the focus (typing a name).
 */
function onDialogPointerDown(): void {
  beginEditGroup('pointer');
  const end = () => {
    endEditGroup('pointer');
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
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
      onKeyDown={onDialogKeyDown}
      onPointerDownCapture={onDialogPointerDown}
      onFocusCapture={(e) => typesText(e.target) && beginEditGroup('focus')}
      onBlurCapture={(e) => typesText(e.target) && endEditGroup('focus')}
      onCancel={(e) => {
        // Escape must not drop a map that is being placed: the apply goes on
        if (mapDialogStore.getState().status === 'applying') e.preventDefault();
      }}
    >
      <MapForm />
    </dialog>
  );
}
