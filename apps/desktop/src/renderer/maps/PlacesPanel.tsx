import type { AssetRef, MapGeometry, MapPlace, MapTopology } from '@travelbook/core';
import { useEffect, useId, useState } from 'react';
import { PhotoChoice } from '../panels/PhotoPicker';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import {
  mapDialogStore,
  placeFromBundled,
  subjectBase,
  updateSpec,
  useMapDialog,
  type MapSpec,
} from './dialogModel';
import {
  drawnLabelOffset,
  groupPlaces,
  offeredPlaces,
  patchPlace,
  placePointMm,
  type Row,
} from './placesModel';
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

/** A new medallion: 28 mm across, 30 mm above its point, the photo centred. */
const MEDALLION_DIAMETER_MM = 28;
const MEDALLION_OFFSET_MM = { dx: 0, dy: -30 };

const setPlaces = (places: MapPlace[]) => void updateSpec({ places });

/** One place: shown, its name (renamable), label shown, label position, removal of a clicked one. */
function PlaceRow({
  row,
  spec,
  geometry,
  box,
  medallions,
  onPickPhoto,
}: {
  row: Row;
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
  medallions: boolean;
  onPickPhoto: (placeId: string) => void;
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
  const nudgePhoto = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const dir = ARROWS[e.key];
    if (!dir || !place.photo) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
    const { dx, dy } = place.photo.offset;
    patch({
      photo: { ...place.photo, offset: { dx: dx + dir[0] * step, dy: dy + dir[1] * step } },
    });
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
      {medallions && (
        <div className="map-place__photo">
          <button
            type="button"
            className="button map-place__btn"
            aria-label={place.photo ? t.photoChange(place.label) : t.photo(place.label)}
            onClick={() => onPickPhoto(place.id)}
          >
            {t.photoButton}
          </button>
          {place.photo && (
            <>
              <button
                type="button"
                className="button map-place__btn"
                aria-label={t.photoNudge(place.label)}
                title={t.photoNudgeHint}
                onKeyDown={nudgePhoto}
              >
                ↔
              </button>
              <button
                type="button"
                className="button map-place__btn"
                aria-label={t.photoRemove(place.label)}
                onClick={() => patch({ photo: null })}
              >
                {t.photoRemoveText}
              </button>
            </>
          )}
        </div>
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
  medallions,
  onPickPhoto,
}: {
  title: string;
  rows: Row[];
  spec: MapSpec;
  geometry: MapGeometry | null;
  box: { w: number; h: number };
  medallions: boolean;
  onPickPhoto: (placeId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="map-places__group">
      <h3 className="map-places__title">{title}</h3>
      <ul className="map-places__list">
        {rows.map((row) => (
          <PlaceRow
            key={row.index}
            row={row}
            spec={spec}
            geometry={geometry}
            box={box}
            medallions={medallions}
            onPickPhoto={onPickPhoto}
          />
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
  const book = useEditor((s) => s.book);
  // the place whose photo is being chosen
  const [picking, setPicking] = useState<string | null>(null);
  const choose = (asset: AssetRef) => {
    const s = mapDialogStore.getState().spec;
    const at = s?.places.findIndex((p) => p.id === picking) ?? -1;
    const place = s?.places[at];
    setPicking(null);
    if (!s || !place) return;
    // a second pick keeps where the medallion was put and how big it is
    const photo = place.photo
      ? { ...place.photo, assetId: asset.id }
      : {
          assetId: asset.id,
          offset: { ...MEDALLION_OFFSET_MM },
          diameter: MEDALLION_DIAMETER_MM,
          crop: { scale: 1, cx: 0.5, cy: 0.5 },
        };
    void updateSpec({ places: patchPlace(s.places, at, { photo }) });
  };
  const group = (title: string, rows: Row[]) => (
    <Group
      title={title}
      rows={rows}
      spec={spec}
      geometry={geometry}
      box={box}
      medallions={spec.medallions}
      onPickPhoto={setPicking}
    />
  );
  return (
    <fieldset className="map-places" aria-label={t.title}>
      <legend>{t.title}</legend>
      <label className="map-places__switch" title={t.medallionsHint}>
        <input
          type="checkbox"
          checked={spec.medallions}
          onChange={(e) => void updateSpec({ medallions: e.target.checked })}
        />
        {t.medallions}
      </label>
      {spec.places.length === 0 && <p className="field__help">{t.empty}</p>}
      {group(t.cities, groups.cities)}
      {group(t.sights, groups.sights)}
      {group(t.custom, groups.custom)}
      <AddPlace spec={spec} />
      <p className="field__help">{t.hint}</p>
      {picking !== null && book && (
        <PhotoChoice
          book={book}
          hint={t.pickHint}
          onChoose={choose}
          onClose={() => setPicking(null)}
        />
      )}
    </fieldset>
  );
}
