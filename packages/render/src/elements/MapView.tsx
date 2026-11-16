import {
  fitFrame,
  legPath,
  MM_TO_PX,
  placeLabels,
  projectPlace,
  PT_MM,
  routeNumbers,
  routeSegments,
  type LabelBox,
  type LabelObstacle,
  type MapElement,
  type MapGeometry,
  type MapPlace,
  type MapPlaceKind,
  type MapRouteStyle,
} from '@travelbook/core';
import { useId, type ReactElement, type ReactNode } from 'react';
import type { AssetUrl, Quality } from '../types';
import { round } from '../units';
import { elementBoxStyle } from './boxStyle';
import { MARKER_GLYPHS, VEHICLE_GLYPHS } from './mapMarkers';

/** The crayon hatching, on paper whatever the fit: 45 degrees, mm. */
const HATCH_SPACING = 1.2;
const HATCH_WIDTH = 0.25;
/** Average glyph width in em, to size a label's box before it is laid out. */
const GLYPH_EM = 0.55;
const LABEL_LINE = 1.2;
/** Space between a marker and its label, mm. */
const LABEL_GAP = 0.8;
/** A badge's digits fill this fraction of its diameter. */
const BADGE_TEXT = 0.55;
const VEHICLE_FLIP_ANGLE = 90;

export interface MapViewProps {
  el: MapElement;
  /** `null`: not loaded yet (an empty frame); `'missing'`: the asset is gone or unreadable. */
  geometry: MapGeometry | null | 'missing';
  /** Not used yet: the medallions (photos) are drawn by a later task. */
  quality?: Quality;
  assetUrl?: AssetUrl;
  /** What a missing map says. */
  missingLabel?: string;
}

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);
/** A number for an attribute: finite, at most 4 decimals. */
const f = (n: number): number => round(finite(n));
const paint = (c: string | null): string => c ?? 'none';
const posDashes = (dash: number[] | null): string | undefined => {
  if (!dash) return undefined;
  const d = dash.map((n) => Math.max(0, finite(n)));
  return d.length > 0 && d.reduce((a, b) => a + b, 0) > 0 ? d.map(round).join(' ') : undefined;
};

const cased = (text: string, mode: 'none' | 'upper' | 'lower'): string =>
  mode === 'upper' ? text.toUpperCase() : mode === 'lower' ? text.toLowerCase() : text;

/** A pattern id that is a valid CSS identifier and unique per mounted view. */
function useSafeId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function Hatch(p: {
  id: string;
  color: string;
  /** Map units per mm, when the pattern is used inside the scaled map group; 1 otherwise. */
  unitsPerMm: number;
}): ReactElement {
  const k = p.unitsPerMm;
  return (
    <pattern
      id={p.id}
      patternUnits="userSpaceOnUse"
      width={HATCH_SPACING}
      height={HATCH_SPACING}
      patternTransform={`scale(${round(k, 8)}) rotate(45)`}
    >
      <line
        x1={HATCH_SPACING / 2}
        y1={0}
        x2={HATCH_SPACING / 2}
        y2={HATCH_SPACING}
        stroke={p.color}
        strokeWidth={HATCH_WIDTH}
      />
    </pattern>
  );
}

function Frame(p: { el: MapElement; children: ReactNode }): ReactElement {
  return (
    <div data-element-id={p.el.id} data-element-type="map" style={elementBoxStyle(p.el)}>
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <g transform={`scale(${MM_TO_PX})`}>{p.children}</g>
      </svg>
    </div>
  );
}

/**
 * A map, drawn as SVG in mm (like a shape). The geometry is fitted to the element's box, so a
 * resize shows more or less of the map; strokes stay in mm and labels in pt at any size.
 * Everything drawn is guarded against non-finite numbers: a bad spec skips, it never throws.
 * SpreadView does not pass `missingLabel`: render cannot import the renderer's fr.ts, so the
 * default is the French string itself.
 */
export function MapView({
  el,
  geometry,
  missingLabel = 'Carte introuvable',
}: MapViewProps): ReactElement {
  const hatchId = useSafeId('map-hatch');
  const w = Math.max(0, finite(el.w));
  const h = Math.max(0, finite(el.h));

  if (geometry === 'missing') {
    return (
      <Frame el={el}>
        <defs>
          <Hatch id={hatchId} color="#b9b2a3" unitsPerMm={1} />
        </defs>
        <rect width={f(w)} height={f(h)} fill={`url(#${hatchId})`} />
        <rect
          x={0.15}
          y={0.15}
          width={f(Math.max(0, w - 0.3))}
          height={f(Math.max(0, h - 0.3))}
          fill="none"
          stroke="#b9b2a3"
          strokeWidth={0.3}
        />
        <text
          x={f(w / 2)}
          y={f(h / 2)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={f(10 * PT_MM)}
          fontFamily="sans-serif"
          fill="#6b6558"
          stroke="#ffffff"
          strokeWidth={1}
          paintOrder="stroke"
        >
          {missingLabel}
        </text>
      </Frame>
    );
  }

  if (geometry === null) {
    return (
      <Frame el={el}>
        {el.background ? <rect width={f(w)} height={f(h)} fill={el.background} /> : null}
      </Frame>
    );
  }

  const { style } = el;
  const fit = fitFrame(geometry, { w, h }, el.frame, el.subject.includeRemote);
  const s = fit.scale;
  const toMm = (lon: number, lat: number): [number, number] => {
    const [x, y] = projectPlace(geometry.projection, lon, lat);
    return [x * s + fit.dx, y * s + fit.dy];
  };
  /** A width in mm as a stroke width inside the scaled map group. */
  const u = (mmWidth: number): number => round(finite(mmWidth) / s, 6);
  const dashU = (dash: number[] | null): string | undefined => {
    const d = dash?.map((n) => finite(n) / s) ?? null;
    return d && d.some((n) => n > 0) ? d.map((n) => round(n, 6)).join(' ') : undefined;
  };

  // A place with no finite position cannot be drawn; the first place of an id is the place.
  const seen = new Set<string>();
  const places = el.places.filter(
    (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && !seen.has(p.id) && seen.add(p.id),
  );
  const kindOf = (p: MapPlace): MapPlaceKind =>
    p.source.kind === 'custom' ? 'custom' : p.source.kind === 'sight' ? 'sight' : 'city';
  const markerOf = (p: MapPlace) => {
    const ms = style.markers[kindOf(p)];
    const base =
      p.markerSize !== null && Number.isFinite(p.markerSize) ? p.markerSize : style.sizes.marker;
    const d = Math.max(0, finite(base) * finite(ms.scale, 1));
    return { ms, d, kind: p.marker ?? ms.kind };
  };
  const at = new Map(places.map((p) => [p.id, toMm(p.lon, p.lat)]));

  const numbers =
    el.route && el.route.numbered ? routeNumbers(el.route) : new Map<string, number[]>();
  const badgeD = Math.max(0, finite(style.sizes.badge));

  // With regions chosen, the rest of the subject is context (neighbours look) and the chosen
  // regions get the land look; with none chosen the land is drawn as is.
  const chosen = el.subject.regions.length > 0 && geometry.paths.selected !== '';
  const landLook = chosen ? style.neighbours : style.land;
  const hatched = style.rough !== null && style.land.fill !== null;
  const landFill = hatched ? `url(#${hatchId})` : paint(style.land.fill);

  // Labels, obstacles.
  const obstacles: LabelObstacle[] = [];
  const labelBoxes: LabelBox[] = [];
  const labelPt = Math.max(0, finite(style.label.sizePt)) * PT_MM;
  places.forEach((p, i) => {
    const [x, y] = at.get(p.id) as [number, number];
    const { d, kind } = markerOf(p);
    const tip = p.shown && MARKER_GLYPHS[kind].anchor === 'tip';
    const cy = tip ? y - d / 2 : y;
    const badged = p.shown && numbers.has(p.id);
    const size = Math.max(p.shown ? d : 0, badged ? badgeD : 0);
    // The marker's glyph is centred on `cy`; a badge sits on the projected point.
    if (p.shown && d > 0) obstacles.push({ x: x - d / 2, y: cy - d / 2, w: d, h: d });
    if (badged && badgeD > 0) {
      obstacles.push({ x: x - badgeD / 2, y: y - badgeD / 2, w: badgeD, h: badgeD });
    }
    if (!p.shown || !p.labelShown) return;
    const text = cased(p.label, style.label.case);
    const chars = Array.from(text).length;
    labelBoxes.push({
      id: p.id,
      // The true point: `labelOffset` is measured from it for every marker kind.
      x,
      y,
      w: chars * labelPt * (GLYPH_EM + finite(style.label.letterSpacingEm)),
      h: labelPt * LABEL_LINE,
      rank: i,
      fixed: p.labelOffset ? { dx: p.labelOffset.dx, dy: p.labelOffset.dy } : undefined,
      gap: size / 2 + LABEL_GAP,
    });
  });
  // The four sides of the box are obstacles, so a label is placed inside it when a position fits.
  const OUT = 1e4;
  const edges: LabelObstacle[] = [
    { x: -OUT, y: -OUT, w: OUT, h: 2 * OUT + h },
    { x: w, y: -OUT, w: OUT, h: 2 * OUT + h },
    { x: 0, y: -OUT, w, h: OUT },
    { x: 0, y: h, w, h: OUT },
  ];
  const offsets = placeLabels(labelBoxes, [...obstacles, ...edges]);
  const clampIn = (c: number, size: number, max: number): number =>
    size >= max ? max / 2 : Math.min(max - size / 2, Math.max(size / 2, c));

  const segments = el.route ? routeSegments(el.route, places) : [];

  const routeStyle = (mode: keyof typeof style.route): MapRouteStyle => style.route[mode];

  return (
    <Frame el={el}>
      <defs>
        {hatched ? (
          <Hatch id={hatchId} color={style.land.fill as string} unitsPerMm={1 / s} />
        ) : null}
      </defs>
      <g data-layer="background">
        {el.background ? <rect width={f(w)} height={f(h)} fill={el.background} /> : null}
      </g>
      <g transform={`translate(${f(fit.dx)} ${f(fit.dy)}) scale(${round(s, 8)})`}>
        <g data-layer="neighbours">
          {el.subject.showNeighbours && geometry.paths.neighbours ? (
            <path
              d={geometry.paths.neighbours}
              fill={paint(style.neighbours.fill)}
              stroke={paint(style.neighbours.stroke)}
              strokeWidth={u(style.neighbours.width)}
              strokeLinejoin="round"
            />
          ) : null}
        </g>
        <g data-layer="land">
          <path
            d={geometry.paths.land}
            fill={chosen ? paint(style.neighbours.fill) : landFill}
            stroke={paint(landLook.stroke)}
            strokeWidth={u(landLook.width)}
            strokeLinejoin="round"
          />
        </g>
        <g data-layer="lakes">
          {el.subject.showLakes && geometry.paths.lakes ? (
            <path
              d={geometry.paths.lakes}
              fill={paint(style.lakes.fill)}
              stroke={paint(style.lakes.stroke)}
              strokeWidth={u(style.lakes.width)}
              strokeLinejoin="round"
            />
          ) : null}
        </g>
        <g data-layer="regions">
          {el.subject.showRegions && geometry.paths.regions && style.regions.stroke ? (
            <path
              d={geometry.paths.regions}
              fill="none"
              stroke={style.regions.stroke}
              strokeWidth={u(style.regions.width)}
              strokeDasharray={dashU(style.regions.dash)}
              strokeLinejoin="round"
            />
          ) : null}
        </g>
        <g data-layer="selected">
          {chosen ? (
            <path
              d={geometry.paths.selected}
              fill={landFill}
              stroke={paint(style.land.stroke)}
              strokeWidth={u(style.land.width)}
              strokeLinejoin="round"
            />
          ) : null}
        </g>
        <g data-layer="outline">
          {geometry.paths.outline && style.outline.color ? (
            <path
              d={geometry.paths.outline}
              fill="none"
              stroke={style.outline.color}
              strokeWidth={u(style.outline.width)}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
        </g>
      </g>
      <g data-layer="leaders" />
      <g data-layer="route">
        {segments.map((seg) => {
          const a = at.get(seg.from.id) as [number, number];
          const b = at.get(seg.to.id) as [number, number];
          const path = legPath(a, b, seg.leg);
          if (!path.d) return null;
          const rs = routeStyle(seg.leg.mode);
          const dash = posDashes(rs.dash);
          const dotted = rs.dash?.some((n) => n > 0 && n < 0.05) ?? false;
          const vehicleD = Math.max(0, finite(style.sizes.vehicle));
          const flip = Math.abs(finite(path.angle)) > VEHICLE_FLIP_ANGLE;
          const walker = seg.leg.mode === 'pied';
          const rotate = walker ? 0 : finite(path.angle);
          const vd = f(vehicleD);
          // The walker stays upright and turns to face left; the others turn with the leg and
          // mirror vertically when heading left, so wheels and hulls stay down.
          const sx = walker && flip ? -vd : vd;
          const sy = !walker && flip ? -vd : vd;
          return (
            <g key={seg.index}>
              <path
                data-leg={seg.index}
                d={path.d}
                fill="none"
                stroke={rs.color}
                strokeWidth={f(rs.width)}
                strokeDasharray={dash}
                strokeLinecap={dotted ? 'round' : 'butt'}
              />
              {seg.leg.icon && vehicleD > 0 ? (
                <path
                  data-vehicle={seg.leg.mode}
                  d={VEHICLE_GLYPHS[seg.leg.mode]}
                  fill={rs.color}
                  fillRule="evenodd"
                  stroke={style.badge.stroke ?? 'none'}
                  strokeWidth={style.badge.stroke ? 0.04 : undefined}
                  transform={`translate(${f(path.mid[0])} ${f(path.mid[1])}) rotate(${f(rotate)}) scale(${sx} ${sy})`}
                />
              ) : null}
            </g>
          );
        })}
      </g>
      <g data-layer="markers">
        {places.map((p) => {
          if (!p.shown) return null;
          const [x, y] = at.get(p.id) as [number, number];
          const { ms, d, kind } = markerOf(p);
          if (d <= 0) return null;
          const glyph = MARKER_GLYPHS[kind];
          const ty = glyph.anchor === 'tip' ? y - d / 2 : y;
          return (
            <path
              key={p.id}
              data-place={p.id}
              d={glyph.d}
              fillRule="evenodd"
              fill={ms.color}
              stroke={paint(ms.stroke)}
              strokeWidth={ms.stroke ? 0.06 : undefined}
              strokeLinejoin="round"
              transform={`translate(${f(x)} ${f(ty)}) scale(${f(d)})`}
            />
          );
        })}
      </g>
      <g data-layer="badges">
        {badgeD > 0
          ? places.map((p) => {
              const nums = numbers.get(p.id);
              if (!p.shown || !nums) return null;
              const [x, y] = at.get(p.id) as [number, number];
              const text = nums.join(',');
              const k = Math.min(1, 2 / Math.max(1, text.length));
              return (
                <g key={p.id} data-badge={p.id}>
                  <circle
                    cx={f(x)}
                    cy={f(y)}
                    r={f(badgeD / 2)}
                    fill={style.badge.fill}
                    stroke={paint(style.badge.stroke)}
                    strokeWidth={style.badge.stroke ? 0.3 : undefined}
                  />
                  <text
                    x={f(x)}
                    y={f(y)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily={style.badge.font}
                    fontWeight={style.badge.weight}
                    fontSize={f(badgeD * BADGE_TEXT * k)}
                    fill={style.badge.text}
                  >
                    {text}
                  </text>
                </g>
              );
            })
          : null}
      </g>
      <g data-layer="labels">
        {places.map((p) => {
          const off = offsets.get(p.id);
          if (!off || !p.shown || !p.labelShown) return null;
          const box = labelBoxes.find((l) => l.id === p.id) as LabelBox;
          const halo = style.label.halo;
          // A label the user placed stays as given; the others are kept inside the box.
          const cx = box.x + off.dx;
          const cy = box.y + off.dy;
          const lx = p.labelOffset ? cx : clampIn(cx, box.w, w);
          const ly = p.labelOffset ? cy : clampIn(cy, box.h, h);
          return (
            <text
              key={p.id}
              data-label={p.id}
              x={f(lx)}
              y={f(ly)}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={style.label.font}
              fontWeight={style.label.weight}
              fontStyle={
                style.label.italicSights && p.source.kind === 'sight' ? 'italic' : undefined
              }
              fontSize={f(labelPt)}
              letterSpacing={`${f(style.label.letterSpacingEm)}em`}
              fill={style.label.color}
              stroke={halo.width > 0 ? halo.color : undefined}
              strokeWidth={halo.width > 0 ? f(halo.width) : undefined}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {cased(p.label, style.label.case)}
            </text>
          );
        })}
      </g>
      <g data-layer="medallions" />
    </Frame>
  );
}
