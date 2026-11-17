import { z } from 'zod';
import { color, elementBase, id, mm, nonNegMm, unit } from '../schemaPrimitives';

/** The marks a place can be drawn with, in the order a style editor lists them. */
export const MAP_MARKERS = ['point', 'pin', 'flag', 'badge', 'star', 'icon'] as const;
export const MAP_PLACE_KINDS = ['capital', 'city', 'sight', 'custom'] as const;
export const MAP_LEG_MODES = ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied'] as const;

const MarkerSchema = z.enum(MAP_MARKERS);
const PlaceKindSchema = z.enum(MAP_PLACE_KINDS);
const LegModeSchema = z.enum(MAP_LEG_MODES);

/** A size of a mark on the page: 1 to 20 mm. */
const markSize = z.number().min(1).max(20);
const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
const offset = z.object({ dx: mm, dy: mm });
/** Lengths of dashes and gaps, as in SVG `stroke-dasharray`. */
const dash = z.array(nonNegMm).min(1).max(8).nullable();

const MapPlaceSchema = z.object({
  id,
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['city', 'sight']), ref: z.string().min(1) }),
    z.object({ kind: z.literal('custom') }),
  ]),
  lon,
  lat,
  label: z.string(),
  kind: PlaceKindSchema.optional(),
  shown: z.boolean(),
  labelShown: z.boolean(),
  marker: MarkerSchema.nullable(),
  markerSize: markSize.nullable(),
  labelOffset: offset.nullable(),
  photo: z
    .object({
      assetId: id,
      offset,
      diameter: mm.positive(),
      crop: z.object({ scale: z.number().min(1), cx: unit, cy: unit }),
    })
    .nullable(),
});

const MapLegSchema = z.object({
  mode: LegModeSchema,
  curve: z.enum(['droit', 'courbe']),
  bend: z.number().min(-1).max(1),
  icon: z.boolean(),
});

const MapRouteSchema = z.object({
  stops: z.array(id),
  legs: z.array(MapLegSchema),
  numbered: z.boolean(),
  unnumbered: z.array(z.boolean()).optional(),
});

/** A fill or a stroke: a colour, or `null` for not painted. */
const paint = color.nullable();

const MapMarkerStyleSchema = z.object({
  kind: MarkerSchema,
  color,
  stroke: paint,
  scale: z.number().positive(),
});

const MapRouteStyleSchema = z.object({ color, width: nonNegMm, dash });

export const MapStyleSchema = z.object({
  styleVersion: z.literal(1),
  land: z.object({ fill: paint, stroke: paint, width: nonNegMm }),
  regions: z.object({ stroke: paint, width: nonNegMm, dash }),
  neighbours: z.object({ fill: paint, stroke: paint, width: nonNegMm }),
  lakes: z.object({ fill: paint, stroke: paint, width: nonNegMm }),
  outline: z.object({ color: paint, width: nonNegMm, detail: unit }),
  label: z.object({
    font: z.string().min(1),
    weight: z.number().int().min(100).max(900),
    italicSights: z.boolean(),
    sizePt: z.number().positive(),
    color,
    case: z.enum(['none', 'upper', 'lower']),
    letterSpacingEm: z.number().finite(),
    halo: z.object({ color, width: nonNegMm }),
  }),
  markers: z.record(PlaceKindSchema, MapMarkerStyleSchema),
  route: z.record(LegModeSchema, MapRouteStyleSchema),
  badge: z.object({
    fill: color,
    text: color,
    stroke: paint,
    font: z.string().min(1),
    weight: z.number().int().min(100).max(900),
  }),
  medallion: z.object({ ringColor: color, ringWidth: nonNegMm }),
  sizes: z.object({ marker: markSize, badge: markSize, vehicle: markSize }),
  rough: z.object({ seed: z.number().int(), roughness: z.number().min(0) }).nullable(),
});

export const MapElementSchema = z.object({
  ...elementBase,
  type: z.literal('map'),
  // Like a sticker's: an element without geometry shows "Carte introuvable".
  geometryAssetId: z.string(),
  subject: z.object({
    id,
    regions: z.array(id),
    showRegions: z.boolean(),
    showNeighbours: z.boolean(),
    showLakes: z.boolean(),
    includeRemote: z.boolean(),
  }),
  frame: z.object({ center: z.tuple([lon, lat]), scale: z.number().positive() }).nullable(),
  projection: z.enum(['auto', 'mercator']),
  style: MapStyleSchema,
  places: z.array(MapPlaceSchema),
  route: MapRouteSchema.nullable(),
  medallions: z.boolean(),
  background: color.nullable(),
});

const finiteNumber = z.number().finite();
const point = z.tuple([finiteNumber, finiteNumber]);
const bounds = z.tuple([point, point]);
/** A path string that was drawn from finite numbers. */
const bakedPath = z
  .string()
  .refine((d) => !/NaN|Infinity/.test(d), 'a path with a NaN or an Infinity');

/** A baked map geometry, as stored in an asset: Tasks that load one validate it with this. */
export const MapGeometrySchema = z.object({
  version: z.literal(1),
  projection: z.object({
    kind: z.enum(['transverseMercator', 'conicConformal', 'mercator']),
    rotate: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
    parallels: z.tuple([finiteNumber, finiteNumber]).optional(),
    k: finiteNumber.positive(),
    tx: finiteNumber,
    ty: finiteNumber,
  }),
  bounds,
  remoteBounds: bounds,
  paths: z.object({
    land: bakedPath,
    outline: bakedPath,
    regions: bakedPath,
    selected: bakedPath,
    neighbours: bakedPath,
    neighbourLines: bakedPath.optional(),
    lakes: bakedPath,
  }),
});
