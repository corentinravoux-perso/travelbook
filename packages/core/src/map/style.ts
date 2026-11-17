import { MapStyleSchema } from './schema';
import type { MapStyle } from './types';

/** A built-in or user style for a map, as `resources/maps/presets/<id>.json` and `map-styles.json` store it. */
export interface MapPreset {
  id: string;
  name: string;
  style: MapStyle;
}

/**
 * The tokens a style is completed from: the `carnet` look, the owner's favourite. Never mutated;
 * `normalizeStyle` hands out copies.
 */
export const DEFAULT_MAP_STYLE: MapStyle = {
  styleVersion: 1,
  land: { fill: '#f4e7c9', stroke: '#8b5e3c', width: 0.55 },
  regions: { stroke: '#d6c196', width: 0.15, dash: null },
  neighbours: { fill: '#ece3cf', stroke: '#d6c196', width: 0.2 },
  lakes: { fill: '#bcd4e0', stroke: '#8b5e3c', width: 0.2 },
  outline: { color: '#8b5e3c', width: 0.55, detail: 1 },
  label: {
    font: 'Lora',
    weight: 700,
    italicSights: true,
    sizePt: 9.5,
    color: '#4a2f1a',
    case: 'none',
    letterSpacingEm: 0,
    halo: { color: '#fbf4e2', width: 0.8 },
  },
  markers: {
    capital: { kind: 'point', color: '#8b3a12', stroke: '#fbf4e2', scale: 1.5 },
    city: { kind: 'point', color: '#8b5e3c', stroke: '#fbf4e2', scale: 1 },
    sight: { kind: 'star', color: '#c2410c', stroke: '#fbf4e2', scale: 1 },
    custom: { kind: 'pin', color: '#c2410c', stroke: null, scale: 1 },
  },
  route: {
    voiture: { color: '#e2571e', width: 0.7, dash: [2.2, 1.5] },
    bus: { color: '#e2571e', width: 0.7, dash: [2.2, 1.5] },
    train: { color: '#e2571e', width: 0.7, dash: null },
    avion: { color: '#1f3a5f', width: 0.6, dash: [0.01, 1.7] },
    bateau: { color: '#1f3a5f', width: 0.6, dash: [1, 1] },
    pied: { color: '#e2571e', width: 0.5, dash: [0.5, 1] },
  },
  badge: { fill: '#e2571e', text: '#ffffff', stroke: '#fbf4e2', font: 'Caveat', weight: 700 },
  medallion: { ringColor: '#ffffff', ringWidth: 0.6 },
  sizes: { marker: 3, badge: 5, vehicle: 6 },
  rough: null,
};

type Json = Record<string, unknown>;

/** A deep copy of plain JSON data (a style holds nothing else). */
const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `raw` laid over `template`: the template's keys only (so an unknown token is dropped), and
 * `raw`'s value where it has one, else the template's. A value the template does not nest (a
 * colour, a dash list, a `null` for a missing `rough`) is taken whole. The result shares no object
 * with the template and edits none of `raw`.
 */
function overlay(template: unknown, raw: unknown): unknown {
  if (isRecord(template)) {
    const given = isRecord(raw) ? raw : {};
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, overlay(value, given[key])]),
    );
  }
  return raw === undefined ? clone(template) : raw;
}

/**
 * Put back the default of the token a schema issue points at: the leaf, or the whole section
 * when the issue is inside a value the default does not nest (`rough.seed`, `route.avion.dash.0`).
 * Edits only the objects `overlay` made.
 */
function resetToDefault(style: Json, path: readonly PropertyKey[]): void {
  let node = style;
  let template: Json = DEFAULT_MAP_STYLE as unknown as Json;
  for (const [depth, part] of path.entries()) {
    const key = String(part);
    const next = template[key];
    if (isRecord(next) && depth < path.length - 1) {
      node = node[key] as Json;
      template = next;
    } else {
      node[key] = clone(next);
      return;
    }
  }
}

/**
 * A style complete and valid whatever `raw` is (spec 7.9): an album or a template saved by
 * another release, or edited by hand. A missing token is filled from `DEFAULT_MAP_STYLE`, an
 * unknown one dropped, an invalid one (wrong type, out of range) put back to its default, and
 * `styleVersion` is 1. The result is a new object.
 */
export function normalizeStyle(raw: unknown): MapStyle {
  const candidate = overlay(DEFAULT_MAP_STYLE, raw) as Json;
  const first = MapStyleSchema.safeParse(candidate);
  if (first.success) return first.data;
  for (const issue of first.error.issues) resetToDefault(candidate, issue.path);
  const second = MapStyleSchema.safeParse(candidate);
  // Every issue was put back to a default that is valid: the second parse cannot fail.
  return second.success ? second.data : clone(DEFAULT_MAP_STYLE);
}

/** The keys of a style that hold a paint: a CSS colour, or `null` for not painted. */
const PAINT_KEYS = new Set(['fill', 'stroke', 'color', 'text', 'ringColor']);

/** Every paint of a style, by its path: what a template brings to a map. */
export function styleColours(style: MapStyle): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const walk = (node: Json, at: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = at ? `${at}.${key}` : key;
      if (PAINT_KEYS.has(key) && (typeof value === 'string' || value === null)) out[path] = value;
      else if (isRecord(value)) walk(value, path);
    }
  };
  walk(style as unknown as Json, '');
  return out;
}

/**
 * `style` with the colours of `template` (fills, strokes, text, rings; a `null` "not painted"
 * included) and nothing else: the user's sizes, widths, fonts, markers, dashes and hand-drawn
 * outline are kept when they switch templates. Both are normalized first; the result is new.
 */
export function withTemplateColours(style: unknown, template: unknown): MapStyle {
  const into = normalizeStyle(style) as unknown as Json;
  for (const [path, value] of Object.entries(styleColours(normalizeStyle(template)))) {
    const keys = path.split('.');
    const last = keys.pop() as string;
    let node = into;
    for (const key of keys) node = node[key] as Json;
    node[last] = value;
  }
  return into as unknown as MapStyle;
}
