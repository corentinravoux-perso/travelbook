import type { MapLegMode, MapPlace, MapRoute } from '@travelbook/core';
import { useState } from 'react';
import { fr } from '../strings/fr';
import { updateSpec, type MapSpec } from './dialogModel';
import {
  DEFAULT_LEG,
  addStop,
  moveStop,
  removeStop,
  repairRoute,
  setLeg,
  setStopNumbered,
  stopNumbered,
} from './routeModel';

const t = fr.maps.route;

const MODES: MapLegMode[] = ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied'];

const setRoute = (route: MapRoute | null) => void updateSpec({ route });

/**
 * One stop: its number on the map (a dash when it has none), its place (marked when hidden or
 * gone), whether it is numbered, reorder and remove buttons.
 */
function StopRow({
  route,
  index,
  badge,
  place,
  drag,
}: {
  route: MapRoute;
  index: number;
  /** The number the map shows for this stop, `null` for none. */
  badge: number | null;
  place: MapPlace | undefined;
  drag: {
    from: number | null;
    start: (i: number) => void;
    end: () => void;
  };
}) {
  const n = index + 1;
  const name = place?.label ?? t.missing;
  const last = route.stops.length - 1;
  return (
    <li
      className="map-stop"
      draggable
      onDragStart={(e) => {
        drag.start(index);
        // some engines refuse to start a drag without data
        e.dataTransfer?.setData('text/plain', String(index));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (drag.from !== null) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (drag.from !== null) setRoute(moveStop(route, drag.from, index));
        drag.end();
      }}
      onDragEnd={drag.end}
    >
      <span className="map-stop__n" aria-hidden="true">
        {badge ?? t.noNumber}
      </span>
      <span className="map-stop__name" title={t.stop(n, name)}>
        {name}
        {place && !place.shown && <em className="map-stop__mark"> ({t.hidden})</em>}
      </span>
      <input
        type="checkbox"
        aria-label={t.stopNumbered(n, name)}
        title={t.stopNumberedHint}
        checked={stopNumbered(route, index)}
        disabled={!route.numbered}
        onChange={(e) => setRoute(setStopNumbered(route, index, e.target.checked))}
      />
      <button
        type="button"
        className="button map-place__btn"
        aria-label={t.up(n, name)}
        disabled={index === 0}
        onClick={() => setRoute(moveStop(route, index, index - 1))}
      >
        ↑
      </button>
      <button
        type="button"
        className="button map-place__btn"
        aria-label={t.down(n, name)}
        disabled={index === last}
        onClick={() => setRoute(moveStop(route, index, index + 1))}
      >
        ↓
      </button>
      <button
        type="button"
        className="button map-place__btn"
        aria-label={t.remove(n, name)}
        onClick={() => setRoute(removeStop(route, index))}
      >
        ×
      </button>
    </li>
  );
}

/** The leg from stop `index` to the next: mode, vehicle glyph, curve and bend. */
function LegRow({ route, index }: { route: MapRoute; index: number }) {
  const leg = route.legs[index] ?? DEFAULT_LEG;
  const n = index + 1;
  const patch = (p: Partial<typeof leg>) => setRoute(setLeg(route, index, p));
  return (
    <li className="map-leg" role="group" aria-label={t.leg(n)}>
      <select
        className="input"
        aria-label={t.mode(n)}
        value={leg.mode}
        onChange={(e) => patch({ mode: e.target.value as MapLegMode })}
      >
        {MODES.map((m) => (
          <option key={m} value={m}>
            {t.modes[m]}
          </option>
        ))}
      </select>
      <label className="check">
        <input
          type="checkbox"
          aria-label={t.icon(n)}
          checked={leg.icon}
          onChange={(e) => patch({ icon: e.target.checked })}
        />
        {t.iconText}
      </label>
      <select
        className="input"
        aria-label={t.curve(n)}
        value={leg.curve}
        onChange={(e) => {
          const curve = e.target.value as 'droit' | 'courbe';
          // a curve with no bend looks straight: start with a gentle one
          patch(curve === 'courbe' && leg.bend === 0 ? { curve, bend: 0.3 } : { curve });
        }}
      >
        <option value="droit">{t.curves.droit}</option>
        <option value="courbe">{t.curves.courbe}</option>
      </select>
      <input
        type="range"
        aria-label={t.bend(n)}
        min={-1}
        max={1}
        step={0.1}
        value={Number.isFinite(leg.bend) ? leg.bend : 0}
        disabled={leg.curve !== 'courbe'}
        onChange={(e) => patch({ bend: Number(e.target.value) })}
      />
    </li>
  );
}

/**
 * The itinerary: stops in travel order (chosen among the shown places, one place may come back),
 * with the leg between two stops under the first. Every edit repairs `stops`/`legs` first
 * (see `routeModel`), so a stored route that is out of step opens fine and is fixed on the
 * first change. Changing the route never bakes: it is not a geometry input.
 */
export function RoutePanel({ spec }: { spec: MapSpec }) {
  const route = spec.route;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const byId = new Map<string, MapPlace>();
  for (const p of spec.places) if (!byId.has(p.id)) byId.set(p.id, p);
  const shown = spec.places.filter((p) => p.shown);
  // legs as displayed: the same repair as an edit, without writing it
  const view = route ? repairRoute(route) : null;
  // the number each stop shows, as on the map: numbered stops of shown places count, from 1
  let count = 0;
  const badges = (route?.stops ?? []).map((id, i) =>
    route?.numbered && view && stopNumbered(view, i) && byId.get(id)?.shown ? ++count : null,
  );
  return (
    <fieldset className="map-places map-route" aria-label={t.title}>
      <legend>{t.title}</legend>
      {(!route || route.stops.length === 0) && <p className="field__help">{t.empty}</p>}
      {route && view && (
        <>
          <ol className="map-route__list">
            {route.stops.flatMap((id, i) => [
              <StopRow
                key={`s${i}`}
                route={route}
                index={i}
                badge={badges[i] ?? null}
                place={byId.get(id)}
                drag={{ from: dragFrom, start: setDragFrom, end: () => setDragFrom(null) }}
              />,
              ...(i < route.stops.length - 1
                ? [<LegRow key={`l${i}`} route={view} index={i} />]
                : []),
            ])}
          </ol>
          <label className="check">
            <input
              type="checkbox"
              checked={route.numbered}
              onChange={(e) => setRoute({ ...repairRoute(route), numbered: e.target.checked })}
            />
            {t.numbered}
          </label>
        </>
      )}
      <select
        className="input"
        aria-label={t.addLabel}
        value=""
        onChange={(e) => e.target.value && setRoute(addStop(route, e.target.value))}
      >
        <option value="">{t.addPlaceholder}</option>
        {shown.map((p, i) => (
          <option key={`${p.id}-${i}`} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="field__help">{t.dragHint}</p>
    </fieldset>
  );
}
