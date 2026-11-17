import {
  frameZoom,
  MAP_MARKERS,
  MAP_PLACE_KINDS,
  placeKind,
  type AssetRef,
  type MapGeometry,
  type MapMarker,
  type MapPlace,
  type MapPlaceKind,
  type MapTopology,
} from '@travelbook/core';
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

/** One click (or arrow key) moves a label or a medallion by this, mm; with Shift by `NUDGE_BIG_MM`. */
const NUDGE_MM = 0.5;
const NUDGE_BIG_MM = 2;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
/** The four buttons of a nudge pad, in reading order. */
const PAD: { key: keyof typeof t.directions; glyph: string; dir: [number, number] }[] = [
  { key: 'left', glyph: '←', dir: [-1, 0] },
  { key: 'up', glyph: '↑', dir: [0, -1] },
  { key: 'down', glyph: '↓', dir: [0, 1] },
  { key: 'right', glyph: '→', dir: [1, 0] },
];

/**
 * Four arrow buttons that move something by `NUDGE_MM` per click (`NUDGE_BIG_MM` with Shift); the
 * arrow keys do the same while one of them has the focus.
 */
function NudgePad({
  caption,
  label,
  hint,
  disabled,
  onMove,
  children,
}: {
  caption: string;
  label: (direction: string) => string;
  hint: string;
  disabled: boolean;
  onMove: (dx: number, dy: number) => void;
  children?: React.ReactNode;
}) {
  const step = (shift: boolean, dir: [number, number]) => {
    const mm = shift ? NUDGE_BIG_MM : NUDGE_MM;
    onMove(dir[0] * mm, dir[1] * mm);
  };
  return (
    <span className="map-nudge" role="group" aria-label={caption} title={hint}>
      <span className="map-nudge__caption">{caption}</span>
      {PAD.map(({ key, glyph, dir }) => (
        <button
          key={key}
          type="button"
          className="button map-nudge__btn"
          aria-label={label(t.directions[key])}
          disabled={disabled}
          onClick={(e) => step(e.shiftKey, dir)}
          onKeyDown={(e) => {
            const arrow = ARROWS[e.key];
            if (!arrow) return;
            e.preventDefault();
            step(e.shiftKey, arrow);
          }}
        >
          {glyph}
        </button>
      ))}
      {children}
    </span>
  );
}

/** A new medallion: 28 mm across, 30 mm above its point, the photo centred. */
const MEDALLION_DIAMETER_MM = 28;
const MEDALLION_OFFSET_MM = { dx: 0, dy: -30 };

const setPlaces = (places: MapPlace[]) => void updateSpec({ places });

/**
 * One place: shown, its name (renamable), icon size, label shown, removal of a clicked one; below,
 * what it is drawn as (type, marker) and the positions of its label and medallion.
 */
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
  const kind = placeKind(place);
  const nudge = (dx: number, dy: number) => {
    const point = geometry ? placePointMm(geometry, box, spec, place.lon, place.lat) : null;
    const preview = document.querySelector('.map-preview') ?? document;
    const from = place.labelOffset ??
      drawnLabelOffset(preview, place.id, point, frameZoom(spec.frame)) ?? { dx: 0, dy: 0 };
    patch({ labelOffset: { dx: from.dx + dx, dy: from.dy + dy } });
  };
  const nudgePhoto = (dx: number, dy: number) => {
    if (!place.photo) return;
    const at = place.photo.offset;
    patch({ photo: { ...place.photo, offset: { dx: at.dx + dx, dy: at.dy + dy } } });
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
      <div className="map-place__more">
        <select
          className="input map-place__select"
          aria-label={t.kind(place.label)}
          title={t.kindHint}
          value={kind}
          onChange={(e) => patch({ kind: e.target.value as MapPlaceKind })}
        >
          {MAP_PLACE_KINDS.map((k) => (
            <option key={k} value={k}>
              {fr.maps.style.markerKinds[k]}
            </option>
          ))}
        </select>
        <select
          className="input map-place__select"
          aria-label={t.marker(place.label)}
          value={place.marker ?? ''}
          disabled={!place.shown}
          onChange={(e) => patch({ marker: (e.target.value || null) as MapMarker | null })}
        >
          <option value="">
            {t.markerOfStyle(fr.maps.style.shapes[spec.style.markers[kind].kind] ?? '')}
          </option>
          {MAP_MARKERS.map((m) => (
            <option key={m} value={m}>
              {fr.maps.style.shapes[m]}
            </option>
          ))}
        </select>
        <NudgePad
          caption={t.labelCaption}
          label={(d) => t.nudge(place.label, d)}
          hint={t.nudgeHint}
          disabled={!place.shown || !place.labelShown}
          onMove={nudge}
        >
          <button
            type="button"
            className="button map-nudge__btn"
            aria-label={t.autoPositionOf(place.label)}
            title={t.autoPosition}
            disabled={place.labelOffset === null}
            onClick={() => patch({ labelOffset: null })}
          >
            A
          </button>
        </NudgePad>
      </div>
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
              <NudgePad
                caption={t.photoCaption}
                label={(d) => t.photoNudge(place.label, d)}
                hint={t.photoNudgeHint}
                disabled={false}
                onMove={nudgePhoto}
              />
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
