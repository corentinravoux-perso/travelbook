import type { ElementBase, Mm } from '../schema';

/** The marks a place can be drawn with. */
export type MapMarker = 'point' | 'pin' | 'flag' | 'badge' | 'star' | 'icon';

/** What a place is, for the style: a capital, a city, a sight or a point the user added. */
export type MapPlaceKind = 'capital' | 'city' | 'sight' | 'custom';

/** How a leg of the itinerary is travelled. */
export type MapLegMode = 'voiture' | 'bus' | 'train' | 'avion' | 'bateau' | 'pied';

export interface MapPlace {
  id: string;
  /** Where the place comes from: a bundled city or sight (`ref` is the bundled place's ref), or a click. */
  source: { kind: 'city' | 'sight'; ref: string } | { kind: 'custom' };
  /** Degrees. */
  lon: number;
  lat: number;
  label: string;
  shown: boolean;
  labelShown: boolean;
  /** `null`: the style's marker for the place's kind. */
  marker: MapMarker | null;
  /** Marker size in mm, 1..20. `null`: the style's size (`MapStyle.sizes.marker`). */
  markerSize: Mm | null;
  /** From the marker, in mm. `null`: automatic placement. */
  labelOffset: { dx: Mm; dy: Mm } | null;
  /** The medallion: a photo of the album in a circle, shown when `MapElement.medallions` is on. */
  photo: {
    assetId: string;
    /** From the marker, in mm. */
    offset: { dx: Mm; dy: Mm };
    diameter: Mm;
    crop: { scale: number; cx: number; cy: number };
  } | null;
}

export interface MapLeg {
  mode: MapLegMode;
  curve: 'droit' | 'courbe';
  /** -1..1: which side the curve bulges to, and how much. */
  bend: number;
  /** Draw the vehicle on the leg. */
  icon: boolean;
}

export interface MapRoute {
  /** Place ids, in travel order; a place may repeat. */
  stops: string[];
  /** `legs[i]` goes from `stops[i]` to `stops[i + 1]`. */
  legs: MapLeg[];
  numbered: boolean;
}

/** Fill and stroke colours are CSS colours, or `null` for not painted. */
export interface MapMarkerStyle {
  kind: MapMarker;
  color: string;
  stroke: string | null;
  /** Multiplies the marker size: a capital is drawn larger than a city. */
  scale: number;
}

export interface MapRouteStyle {
  color: string;
  width: Mm;
  /** Lengths of dashes and gaps in mm, as in SVG `stroke-dasharray`. `null`: solid. */
  dash: Mm[] | null;
}

/**
 * Every look of a map, copied into the element: a map never refers to a preset, so editing a
 * preset or a template changes no existing map. Widths are in mm, text sizes in pt.
 */
export interface MapStyle {
  /** Bumped when a token is added or changes meaning; old styles are completed from the defaults. */
  styleVersion: 1;
  land: { fill: string | null; stroke: string | null; width: Mm };
  regions: { stroke: string | null; width: Mm; dash: Mm[] | null };
  neighbours: { fill: string | null; stroke: string | null; width: Mm };
  /** The major lakes, drawn over the land. */
  lakes: { fill: string | null; stroke: string | null; width: Mm };
  /** `detail` 0..1: 1 keeps the full print precision of the outline, less simplifies it. */
  outline: { color: string | null; width: Mm; detail: number };
  label: {
    font: string;
    weight: number;
    /** Sights are set in italics. */
    italicSights: boolean;
    sizePt: number;
    color: string;
    case: 'none' | 'upper' | 'lower';
    /** In em. */
    letterSpacingEm: number;
    /** A stroke under the text; width 0 draws none. */
    halo: { color: string; width: Mm };
  };
  markers: Record<MapPlaceKind, MapMarkerStyle>;
  route: Record<MapLegMode, MapRouteStyle>;
  /** The numbered disc of an itinerary stop; its size is `sizes.badge`. */
  badge: { fill: string; text: string; stroke: string | null; font: string; weight: number };
  medallion: { ringColor: string; ringWidth: Mm };
  /** Each 1..20 mm. */
  sizes: { marker: Mm; badge: Mm; vehicle: Mm };
  /** Hand-drawn outline (roughjs): the seed keeps it stable. `null`: clean lines. */
  rough: { seed: number; roughness: number } | null;
}

export interface MapElement extends ElementBase {
  type: 'map';
  /** The baked, projected geometry: an asset of kind `map`. */
  geometryAssetId: string;
  subject: {
    /** An index subject id: `TH`, `FR-MET`, `US-AK`. */
    id: string;
    /** Region ids of the subject; empty is the whole subject. */
    regions: string[];
    showRegions: boolean;
    showNeighbours: boolean;
    /** The lakes layer; on by default. */
    showLakes: boolean;
    /** Frame far-off territories too. */
    includeRemote: boolean;
  };
  /** The user's pan and zoom, `center` in degrees. `null`: the default fit of the subject. */
  frame: { center: [number, number]; scale: number } | null;
  projection: 'auto' | 'mercator';
  style: MapStyle;
  places: MapPlace[];
  route: MapRoute | null;
  /** Master switch of the photo medallions. */
  medallions: boolean;
  /** `null`: transparent. */
  background: string | null;
}
