import type { MapGeometry, MapPlace, MapTopology } from '@travelbook/core';
import { useEffect, useId, useState } from 'react';
import { fr } from '../strings/fr';
import { subjectBase, updateSpec, useMapDialog, type MapSpec } from './dialogModel';
import {
  drawnLabelOffset,
  groupPlaces,
  offeredPlaces,
  patchPlace,
  placePointMm,
  type Row,
} from './placesModel';
import { placeFromBundled } from './dialogModel';
import { NumberField } from './NumberField';
import { getSubject } from './subjects';

const t = fr.maps.places;

/** One arrow key press moves a label by this, mm; with Shift by `NUDGE_BIG_MM`. */
const NUDGE_MM = 0.5;
const NUDGE_BIG_MM = 2;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const setPlaces = (places: MapPlace[]) => void updateSpec({ places });

/** One place: shown, its name (renamable), label shown, label position, removal of a clicked one. */
function PlaceRow({
  row,
  spec,
  geometry,
  box,
}: {
  row: Row;
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
}) {
  const { index, place } = row;
  const patch = (p: Partial<MapPlace>) => setPlaces(patchPlace(spec.places, index, p));
  const nudge = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
    const point = geometry ? placePointMm(geometry, box, spec, place.lon, place.lat) : null;
    const from = place.labelOffset ??
      drawnLabelOffset(document.querySelector('.map-preview') ?? document, place.id, point) ?? {
        dx: 0,
        dy: 0,
      };
    patch({ labelOffset: { dx: from.dx + dir[0] * step, dy: from.dy + dir[1] * step } });
  };
  return (
    <li className="map-place">
      <input
        type="checkbox"
        aria-label={t.show(place.label)}
        checked={place.shown}
        onChange={(e) => patch({ shown: e.target.checked })}
      />
      <input
        type="text"
        className="input map-place__name"
        aria-label={t.rename(place.label)}
        value={place.label}
        onChange={(e) => patch({ label: e.target.value })}
      />
      <NumberField
        className="input map-place__size"
        label={t.size(place.label)}
        title={t.sizeHint}
        min={1}
        max={20}
        step={0.5}
        nullable
        placeholder={String(spec.style.sizes.marker)}
        value={place.markerSize}
        disabled={!place.shown}
        onChange={(markerSize) => patch({ markerSize })}
      />
      <input
        type="checkbox"
        aria-label={t.labelShow(place.label)}
        checked={place.labelShown}
        disabled={!place.shown}
        onChange={(e) => patch({ labelShown: e.target.checked })}
      />
      <button
        type="button"
        className="button map-place__btn"
        aria-label={t.nudge(place.label)}
        title={t.nudgeHint}
        disabled={!place.shown || !place.labelShown}
        onKeyDown={nudge}
      >
        ↔
      </button>
      <button
        type="button"
        className="button map-place__btn"
        aria-label={t.autoPositionOf(place.label)}
        title={t.autoPosition}
        disabled={place.labelOffset === null}
        onClick={() => patch({ labelOffset: null })}
      >
        A
      </button>
      {place.source.kind === 'custom' ? (
        <button
          type="button"
          className="button map-place__btn"
          aria-label={t.remove(place.label)}
          onClick={() => setPlaces(spec.places.filter((_, i) => i !== index))}
        >
          ×
        </button>
      ) : (
        <span />
      )}
    </li>
  );
}

function Group({
  title,
  rows,
  spec,
  geometry,
  box,
}: {
  title: string;
  rows: Row[];
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
}) {
  if (rows.length === 0) return null;
  return (
    <section className="map-places__group">
      <h3 className="map-places__title">{title}</h3>
      <ul className="map-places__list">
        {rows.map((row) => (
          <PlaceRow key={row.index} row={row} spec={spec} geometry={geometry} box={box} />
        ))}
      </ul>
    </section>
  );
}

/** "Ajouter un lieu": the bundled places of the subject not yet on the map. */
function AddPlace({ spec }: { spec: MapSpec }) {
  const bundled = useMapDialog((s) => s.bundled);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<{ id: string; base: MapTopology } | null>(null);
  const listId = useId();
  const regions = spec.subject.regions;
  useEffect(() => {
    let live = true;
    if (regions.length === 0) return;
    // the region polygons decide which places are inside the chosen regions
    subjectBase(spec.subject.id)
      .then((base) => live && setLoaded({ id: spec.subject.id, base }))
      .catch(() => live && setLoaded(null));
    return () => {
      live = false;
    };
  }, [spec.subject.id, regions.length]);
  const base = regions.length > 0 && loaded?.id === spec.subject.id ? loaded.base : null;
  const offered = offeredPlaces(
    bundled,
    spec.places,
    getSubject(spec.subject.id),
    regions,
    base,
    query,
  );
  return (
    <div className="map-places__add">
      <input
        type="search"
        className="input"
        role="searchbox"
        aria-label={t.addLabel}
        aria-controls={listId}
        placeholder={t.addSearch}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul id={listId} className="map-places__offer" role="listbox" aria-label={t.add}>
        {offered.length === 0 && query.trim() !== '' && (
          <li className="map-search__none">{t.none}</li>
        )}
        {offered.map(({ place, inRegion }) => (
          <li key={place.ref} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="map-search__hit"
              aria-label={place.name}
              onClick={() => {
                setQuery('');
                setPlaces([...spec.places, placeFromBundled(place)]);
              }}
            >
              {place.name}
              {!inRegion && <span className="map-search__parent">{t.outOfRegion}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The places of the map: Villes, Sites, the clicked ones, and the way to add one. */
export function PlacesPanel({
  spec,
  geometry,
  box,
}: {
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
}) {
  const groups = groupPlaces(spec.places);
  return (
    <fieldset className="map-places" aria-label={t.title}>
      <legend>{t.title}</legend>
      {spec.places.length === 0 && <p className="field__help">{t.empty}</p>}
      <Group title={t.cities} rows={groups.cities} spec={spec} geometry={geometry} box={box} />
      <Group title={t.sights} rows={groups.sights} spec={spec} geometry={geometry} box={box} />
      <Group title={t.custom} rows={groups.custom} spec={spec} geometry={geometry} box={box} />
      <AddPlace spec={spec} />
      <p className="field__help">{t.hint}</p>
    </fieldset>
  );
}
